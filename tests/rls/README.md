# Cross-tenant RLS isolation tests

`cross_tenant.test.mjs` verifies that a user belonging to Organization A can
never read, spoof-insert-as, update, or delete data belonging to Organization
B — through the real authenticated REST path (anon key + PostgREST + RLS),
not by running privileged SQL directly.

## Why not just run SQL in the Supabase SQL Editor?

The SQL Editor runs as a superuser role, which **bypasses RLS entirely**.
Testing there would always look "safe" even if a policy is broken. This
script signs in as two real, ordinary application users instead — the same
way a real browser session would — so it actually exercises the policies.

## Prerequisites (one-time setup, ideally on a disposable/test project)

1. Two Supabase Auth users that can already log in.
2. Each linked (via `profiles.org_id`) to a **different** organization.
3. Only the public **anon** key is needed — never the `service_role` key.

## Running it

```bash
npm install @supabase/supabase-js   # if not already installed
node tests/rls/cross_tenant.test.mjs
```

Fill in `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ORG_A`, and `ORG_B` at the top
of the file first.

## What it checks

1. **SELECT leak check** — for every org-scoped table, confirms Org A's
   session never returns a row belonging to Org B.
2. **INSERT spoof check** — confirms Org A cannot create a row tagged with
   Org B's `org_id`.
3. **UPDATE/DELETE isolation** — creates a disposable fixture row as Org B,
   then confirms Org A's session cannot modify or delete it (verified from
   Org B's own session afterward, not just Org A's response).

Exit code `0` = everything passed. Exit code `1` = at least one isolation
failure was found — read the `🔴 FAIL` lines above the summary.

## Safety

The script never touches pre-existing data. The only rows it ever writes are
throwaway, clearly-named fixtures (`RLS-TEST-...`) that it creates and
attempts to clean up itself within the same run.
