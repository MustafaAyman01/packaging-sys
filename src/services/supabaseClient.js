import { createClient } from "@supabase/supabase-js";

// لتفعيل المزامنة السحابية + تسجيل الدخول + الصلاحيات، عرّف المتغيرات دي في ملف .env
// (انسخ .env.example وسمّيه .env وحط فيه القيم بتاعتك من Supabase Dashboard > Project Settings > API)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export { SUPABASE_URL, SUPABASE_ANON_KEY };

export const SUPABASE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const sb = SUPABASE_ENABLED ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// الصلاحيات الافتراضية المتاحة لما نبقى شغالين من غير Supabase / لما المؤسسة لسه معملهاش feature flags
export const DEFAULT_FEATURES = {
  core: true,
  hr: true,
  cash_vouchers: true,
  csv_import: true,
  reports_advanced: true,
  eta_einvoice: false,
};
