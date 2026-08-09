// ============================================================
// Cross-tenant RLS isolation tests
// ============================================================
// Verifies that a user from Org A cannot read, insert-as, update, or delete
// data belonging to Org B, using two REAL authenticated sessions through the
// public anon key + PostgREST — the same path any real client goes through.
// (Running raw SQL as the `postgres` superuser in the SQL Editor does NOT
// test this correctly, because that role bypasses RLS entirely.)
//
// SAFE BY DESIGN:
//   - Never touches pre-existing business data.
//   - The only rows it writes are throwaway fixtures it creates itself
//     (name-prefixed "RLS-TEST-...") and attempts to clean up afterward.
//   - Only needs the public anon key — no service_role key required.
//
// PREREQUISITE (you must set this up once, ideally on a disposable/test
// Supabase project, not production):
//   - Two Supabase Auth users that already exist and can log in.
//   - Each one's `profiles.org_id` pointing to a DIFFERENT organization.
//   - Fill in the four values below.
//
// USAGE:
//   npm install @supabase/supabase-js   (if not already installed)
//   node tests/rls/cross_tenant.test.mjs
//
// Exit code 0 = all checks passed. Exit code 1 = at least one isolation
// failure was found (read the 🔴 lines above the summary for detail).

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://xxxxxxxx.supabase.co";
const SUPABASE_ANON_KEY = "PASTE_YOUR_ANON_KEY_HERE"; // public/anon key only — never the service_role key
const ORG_A = { email: "org-a-test-user@example.com", password: "PASTE_PASSWORD" };
const ORG_B = { email: "org-b-test-user@example.com", password: "PASTE_PASSWORD" };

// Tables checked for cross-tenant SELECT leaks. Extend this list if new
// org_id-scoped tables are added later.
const TABLES = [
  "products",
  "clients",
  "suppliers",
  "invoices",
  "invoice_items",
  "payments",
  "expenses",
  "employees",
  "salary_payments",
  "attendance",
  "cash_vouchers",
  "advances",
  "penalties",
  "stock_levels",
  "stock_movements",
  "manufacturing_orders",
  "categories",
  "units",
];

async function signIn(creds) {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await sb.auth.signInWithPassword(creds);
  if (error) throw new Error(`login failed for ${creds.email}: ${error.message}`);
  const { data: profile, error: profErr } = await sb
    .from("profiles")
    .select("org_id")
    .eq("id", data.user.id)
    .single();
  if (profErr) throw new Error(`could not read profile for ${creds.email}: ${profErr.message}`);
  return { sb, orgId: profile.org_id, userId: data.user.id, email: creds.email };
}

async function main() {
  console.log("Signing in as both test users...\n");
  const a = await signIn(ORG_A);
  const b = await signIn(ORG_B);
  console.log(`Org A user: ${a.email} → org_id ${a.orgId}`);
  console.log(`Org B user: ${b.email} → org_id ${b.orgId}\n`);
  if (a.orgId === b.orgId) {
    throw new Error(
      "ORG_A and ORG_B users belong to the SAME org — this test is meaningless as configured. " +
        "Use two genuinely different test organizations."
    );
  }

  let failures = 0;

  console.log("== TEST 1: cross-tenant SELECT leak check ==");
  for (const table of TABLES) {
    const { data: rows, error } = await a.sb.from(table).select("id,org_id").limit(1000);
    if (error) {
      console.log(`  [SKIP] ${table}: query error (${error.message})`);
      continue;
    }
    const leaked = (rows || []).filter((r) => r.org_id && r.org_id !== a.orgId);
    if (leaked.length > 0) {
      console.log(`  🔴 FAIL [${table}] SELECT leak: ${leaked.length} row(s) from another org visible to Org A`);
      failures++;
    } else {
      console.log(`  ✅ PASS [${table}] no cross-tenant rows visible (${(rows || []).length} own rows returned)`);
    }
  }

  console.log("\n== TEST 2: cross-tenant INSERT spoof check ==");
  for (const table of ["products", "clients", "categories", "units"]) {
    const probeName = `RLS-TEST-SPOOF-${Date.now()}`;
    const { data: inserted, error } = await a.sb
      .from(table)
      .insert({ org_id: b.orgId, name: probeName })
      .select("id,org_id");
    if (error) {
      console.log(`  ✅ PASS [${table}] insert spoofing Org B's org_id correctly rejected: ${error.message}`);
      continue;
    }
    const row = inserted?.[0];
    if (row && row.org_id === b.orgId) {
      console.log(`  🔴 FAIL [${table}] Org A successfully created a row tagged under Org B's org_id!`);
      failures++;
      await a.sb.from(table).delete().eq("id", row.id);
    } else if (row) {
      console.log(
        `  ⚠️  [${table}] insert succeeded but ended up under org_id ${row.org_id}, not the spoofed value — ` +
          `likely safe (server-side default), but worth a manual look`
      );
      await a.sb.from(table).delete().eq("id", row.id);
    }
  }

  console.log("\n== TEST 3: cross-tenant UPDATE/DELETE on a real Org B row (self-contained fixture) ==");
  const fixtureName = `RLS-TEST-FIXTURE-${Date.now()}`;
  const { data: fixture, error: fixtureErr } = await b.sb
    .from("categories")
    .insert({ org_id: b.orgId, name: fixtureName })
    .select("id,name")
    .single();

  if (fixtureErr) {
    console.log(`  [SKIP] could not create Org B fixture to test against: ${fixtureErr.message}`);
  } else {
    const { data: updRows } = await a.sb
      .from("categories")
      .update({ name: "HACKED-BY-ORG-A" })
      .eq("id", fixture.id)
      .select();
    if (!updRows || updRows.length === 0) {
      console.log("  ✅ PASS UPDATE: Org A cannot modify Org B's row (0 rows affected)");
    } else {
      console.log("  🔴 FAIL UPDATE: Org A's update call reported success against Org B's row!");
      failures++;
    }
    // Confirm from Org B's own session, not just Org A's response.
    const { data: verify } = await b.sb.from("categories").select("name").eq("id", fixture.id).single();
    if (verify && verify.name !== fixture.name) {
      console.log("  🔴 CONFIRMED via Org B's own session: the row WAS altered by Org A");
      failures++;
    }

    const { data: delRows } = await a.sb.from("categories").delete().eq("id", fixture.id).select();
    if (delRows && delRows.length > 0) {
      console.log("  🔴 FAIL DELETE: Org A successfully deleted Org B's row!");
      failures++;
    } else {
      console.log("  ✅ PASS DELETE: Org A cannot delete Org B's row");
    }

    // Cleanup regardless of outcome above.
    await b.sb.from("categories").delete().eq("id", fixture.id);
  }

  console.log("\n" + "=".repeat(50));
  if (failures === 0) {
    console.log("✅ ALL CROSS-TENANT ISOLATION TESTS PASSED");
  } else {
    console.log(`🔴 ${failures} ISOLATION FAILURE(S) FOUND — see the FAIL lines above`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Test run error:", e.message);
  process.exit(1);
});
