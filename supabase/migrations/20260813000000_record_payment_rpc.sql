-- ============================================================
-- Batch 3b — record_payment RPC (design/local-test artifact)
-- NOT applied to production yet. Requires explicit approval first.
-- ============================================================

-- Schema change required (additive, non-breaking): supports idempotent retries.
alter table public.payments add column idempotency_key uuid;
-- NOTE: non-unique deliberately — one logical payment call can legitimately
-- produce more than one row (one per invoice allocation, plus one for any
-- unapplied/credit remainder), all sharing the same idempotency_key. The real
-- duplicate-prevention guard is the `EXISTS` check inside the function below,
-- not a database-level uniqueness rule. (An earlier draft used a UNIQUE index
-- here; local testing caught that it broke even a single non-retry call with
-- more than one resulting row — fixed before this reached production.)
create index payments_org_idempotency_key_idx
  on public.payments (org_id, idempotency_key)
  where idempotency_key is not null;

create or replace function public.record_payment(
  p_idempotency_key uuid,
  p_party_type text,        -- 'client' | 'supplier' | null (null for simple "pay this one invoice" mode)
  p_party_id uuid,          -- null for simple invoice-mode payments
  p_amount numeric,
  p_payment_date date,
  p_method text,
  p_reference_number text,
  p_notes text,
  p_allocations jsonb        -- [{id: uuid, invoice_id: uuid, amount: numeric}, ...] — pre-generated ids from the client
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org_id uuid := get_my_org_id();
  v_existing jsonb;
  v_total_allocated numeric := 0;
  v_unapplied numeric;
  v_alloc jsonb;
  v_invoice record;
  v_new_paid numeric;
  v_result jsonb := '[]'::jsonb;
  v_payment_id uuid;
  v_alloc_amount numeric;
  v_alloc_invoice_id uuid;
begin
  if v_org_id is null then
    raise exception 'Not authorized';
  end if;

  if p_idempotency_key is null then
    raise exception 'p_idempotency_key is required and cannot be null';
  end if;

  -- Serialize any two calls sharing the same idempotency_key BEFORE either one
  -- checks whether it was already applied. Without this, two truly-simultaneous
  -- retries of the exact same request could both pass the EXISTS check below
  -- (neither has committed yet) and both proceed to insert — defeating the
  -- whole point of the idempotency key. This lock is transaction-scoped
  -- (auto-released when this call's implicit transaction ends) and forces the
  -- second concurrent call to wait until the first one has fully committed (or
  -- rolled back) before it even reads the payments table.
  --
  -- Using hashtextextended(..., 0) instead of hashtext(...): hashtext() returns
  -- a 32-bit int, so two UNRELATED idempotency keys have a real (if small)
  -- chance of hashing to the same lock id, which would make them wait on each
  -- other unnecessarily — harmless for correctness (the EXISTS check right
  -- after still matches on the exact key, not the hash) but a needless
  -- performance hit as usage grows. hashtextextended(..., 0) returns a full
  -- 64-bit bigint directly, which is what pg_advisory_xact_lock(bigint) wants
  -- natively (no cast needed) and cuts the collision space from 2^32 to 2^64 —
  -- effectively eliminates the concern for any realistic concurrency level.
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));

  -- Idempotency: if this exact request (same key) was already applied, return the
  -- prior result untouched instead of re-processing. Safe for a client to retry
  -- blindly after a dropped network response.
  if exists (select 1 from payments where org_id = v_org_id and idempotency_key = p_idempotency_key) then
    select jsonb_agg(to_jsonb(p)) into v_existing
    from payments p
    where org_id = v_org_id and idempotency_key = p_idempotency_key;
    return jsonb_build_object('status', 'already_applied', 'payments', v_existing);
  end if;

  if p_amount <= 0 then
    raise exception 'Payment amount must be positive';
  end if;

  -- Party validation: never trust p_party_id blindly — confirm it actually
  -- belongs to THIS org before it's allowed to be stored on any payment row.
  if p_party_type is not null then
    if p_party_type not in ('client', 'supplier') then
      raise exception 'p_party_type must be ''client'' or ''supplier'' (got %)', p_party_type;
    end if;
    if p_party_id is null then
      raise exception 'p_party_id is required when p_party_type is provided';
    end if;
    if p_party_type = 'client' and not exists (
      select 1 from clients where id = p_party_id and org_id = v_org_id
    ) then
      raise exception 'client % not found in this organization', p_party_id;
    end if;
    if p_party_type = 'supplier' and not exists (
      select 1 from suppliers where id = p_party_id and org_id = v_org_id
    ) then
      raise exception 'supplier % not found in this organization', p_party_id;
    end if;
  end if;

  -- Validate every allocation's shape and values explicitly — the frontend
  -- already does this too, but this function must not assume the caller is
  -- the trusted frontend; it can be called directly via the API by anyone
  -- holding a valid session.
  for v_alloc in select * from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb))
  loop
    if not (v_alloc ? 'invoice_id') or (v_alloc->>'invoice_id') is null then
      raise exception 'each allocation must include a non-null invoice_id';
    end if;
    if not (v_alloc ? 'amount') or (v_alloc->>'amount') is null then
      raise exception 'each allocation must include a non-null amount';
    end if;

    v_alloc_amount := (v_alloc->>'amount')::numeric;
    if v_alloc_amount <= 0 then
      raise exception 'each allocation amount must be positive (got % for invoice %)',
        v_alloc_amount, (v_alloc->>'invoice_id');
    end if;

    v_total_allocated := v_total_allocated + v_alloc_amount;
  end loop;

  if v_total_allocated > p_amount + 0.01 then
    raise exception 'Allocated amount (%) exceeds payment amount (%)', v_total_allocated, p_amount;
  end if;

  for v_alloc in select * from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb))
  loop
    v_alloc_invoice_id := (v_alloc->>'invoice_id')::uuid;
    v_alloc_amount := (v_alloc->>'amount')::numeric;

    -- Row lock: serializes concurrent payments against the same invoice so two
    -- simultaneous calls can never both read the same stale paid_amount. The
    -- org_id filter here is what guarantees a caller can never lock, read, or
    -- affect an invoice belonging to another organization — v_org_id itself is
    -- derived server-side from auth.uid() (get_my_org_id()), never from any
    -- client-supplied parameter, so it cannot be spoofed.
    select id, total_amount, paid_amount into v_invoice
    from invoices
    where id = v_alloc_invoice_id and org_id = v_org_id
    for update;

    if v_invoice.id is null then
      raise exception 'Invoice % not found in this organization', v_alloc_invoice_id;
    end if;

    v_new_paid := v_invoice.paid_amount + v_alloc_amount;
    if v_new_paid > v_invoice.total_amount + 0.01 then
      raise exception 'Payment would overpay invoice % (total %, already paid %, attempted +%)',
        v_invoice.id, v_invoice.total_amount, v_invoice.paid_amount, v_alloc_amount;
    end if;

    v_payment_id := case
      when v_alloc ? 'id' and (v_alloc->>'id') is not null then (v_alloc->>'id')::uuid
      else gen_random_uuid()
    end;

    -- org_id below is always v_org_id (server-derived), never client-supplied —
    -- a caller cannot make this INSERT target another organization's rows.
    insert into payments (
      id, org_id, invoice_id, amount, payment_date, method, reference_number, notes,
      party_type, party_id, idempotency_key, created_by
    ) values (
      v_payment_id, v_org_id, v_invoice.id, v_alloc_amount, p_payment_date, p_method,
      p_reference_number, p_notes, p_party_type, p_party_id, p_idempotency_key, auth.uid()
    );

    -- The UPDATE below targets v_invoice.id, which was only ever populated by
    -- the org_id-filtered SELECT ... FOR UPDATE above — it is not possible for
    -- this statement to touch a row outside v_org_id.
    update invoices
    set paid_amount = v_new_paid,
        status = case when v_new_paid >= total_amount then 'paid' else 'partial' end
    where id = v_invoice.id;

    v_result := v_result || jsonb_build_object(
      'invoice_id', v_invoice.id, 'payment_id', v_payment_id, 'amount', v_alloc_amount
    );
  end loop;

  -- Leftover, unallocated amount becomes an on-account (unapplied) credit — same
  -- concept already used today by the existing "pay against party balance" mode.
  v_unapplied := p_amount - v_total_allocated;
  if v_unapplied > 0.01 then
    v_payment_id := gen_random_uuid();
    insert into payments (
      id, org_id, invoice_id, amount, payment_date, method, reference_number, notes,
      party_type, party_id, idempotency_key, created_by
    ) values (
      v_payment_id, v_org_id, null, v_unapplied, p_payment_date, p_method,
      p_reference_number, coalesce(p_notes, '') || ' (مقدم غير مخصص لفاتورة)', p_party_type, p_party_id,
      p_idempotency_key, auth.uid()
    );
    v_result := v_result || jsonb_build_object('invoice_id', null, 'payment_id', v_payment_id, 'amount', v_unapplied);
  end if;

  return jsonb_build_object('status', 'applied', 'payments', v_result);
end;
$$;

-- Postgres grants EXECUTE to PUBLIC by default on a newly created function.
-- Lock this down explicitly so an unauthenticated (anon-key-only) caller can't
-- invoke it at all -- matching the posture of every other RPC in this schema.
-- (The function's own `if v_org_id is null then raise exception` already
-- blocks an unauthenticated caller functionally, but this removes the
-- ambiguity instead of relying on that as the only line of defense.)
revoke execute on function public.record_payment(uuid, text, uuid, numeric, date, text, text, text, jsonb) from public;
grant execute on function public.record_payment(uuid, text, uuid, numeric, date, text, text, text, jsonb) to authenticated;
