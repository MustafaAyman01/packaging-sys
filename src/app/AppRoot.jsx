import { useState, useEffect } from "react";
import { sb, SUPABASE_ENABLED, DEFAULT_FEATURES } from "../services/supabaseClient";
import { App } from "./App";
import { Login } from "../auth/Login";
import { NoAccess } from "../auth/NoAccess";
import { RedeemInvite } from "../auth/RedeemInvite";
import { TrialExpired } from "../auth/TrialExpired";

function LoadingScreen() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        fontFamily: "'IBM Plex Sans Arabic',sans-serif",
      }}
    >
      ...جاري التحميل
    </div>
  );
}

export function AppRoot() {
  const isInviteMode =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("invite") === "1";
  const [session, setSession] = useState(undefined); // undefined = loading, null = logged out
  const [profile, setProfile] = useState(undefined); // undefined = loading, null = none yet
  const [profileError, setProfileError] = useState(null); // null | "timeout" | "network" | "error"
  const [features, setFeatures] = useState(DEFAULT_FEATURES);
  const [trialEndsAt, setTrialEndsAt] = useState(undefined); // undefined = loading, null = no trial limit
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!SUPABASE_ENABLED) {
      setSession(null);
      return;
    }
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((_event, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!SUPABASE_ENABLED || !session) return;
    let cancelled = false;
    const timeout = setTimeout(() => {
      // لو التحميل أخد أكتر من 10 ثواني، اعتبرها مشكلة اتصال (مش بالضرورة عدم وجود منشأة)
      if (cancelled) return;
      cancelled = true;
      setProfile(null);
      setProfileError("timeout");
      setTrialEndsAt(null);
    }, 10000);

    (async () => {
      // محاولتين قبل ما نستسلم — أي مشكلة شبكة عابرة ممكن تتحل من المحاولة الثانية
      let lastErr = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const { data: prof, error } = await sb
            .from("profiles")
            .select("*")
            .eq("id", session.user.id)
            .maybeSingle();
          if (error) throw error;
          if (cancelled) return;
          cancelled = true;
          clearTimeout(timeout);
          setProfile(prof || null);
          setProfileError(null);
          if (prof) {
            // هذا الجزء (صلاحيات الميزات + تاريخ انتهاء التجربة) منفصل تمامًا عن
            // نجاح تحميل الـ profile — أي فشل هنا (شبكة/سياسات RLS/صف غير موجود)
            // لا يجب أن يجمّد الشاشة للأبد على "جاري التحميل"
            try {
              const [flagsRes, orgRes] = await Promise.all([
                sb.from("feature_flags").select("feature_key,enabled").eq("org_id", prof.org_id),
                sb.from("organizations").select("trial_ends_at").eq("id", prof.org_id).maybeSingle(),
              ]);
              const flags = flagsRes.data;
              if (flags) {
                const merged = { ...DEFAULT_FEATURES };
                flags.forEach((f) => {
                  merged[f.feature_key] = f.enabled;
                });
                setFeatures(merged);
              }
              setTrialEndsAt(orgRes.data ? orgRes.data.trial_ends_at : null);
            } catch (e2) {
              console.error("Feature flags / trial date load error:", e2);
              setTrialEndsAt(null); // افتراض آمن: بدون قيد تجريبي، حتى لا تتجمد الشاشة
            }
          }
          return;
        } catch (e) {
          lastErr = e;
          if (attempt === 0) await new Promise((r) => setTimeout(r, 1200)); // فرصة قبل إعادة المحاولة
        }
      }
      if (cancelled) return;
      cancelled = true;
      clearTimeout(timeout);
      console.error("Profile load error:", lastErr);
      setProfile(null);
      setProfileError(
        lastErr &&
          (lastErr.message?.toLowerCase().includes("fetch") ||
            lastErr.message?.toLowerCase().includes("network"))
          ? "network"
          : "error"
      );
      setTrialEndsAt(null);
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [session, refreshKey]);

  const isTrialExpired = trialEndsAt && new Date(trialEndsAt) < new Date();

  if (isInviteMode) return <RedeemInvite />;
  if (!SUPABASE_ENABLED) return <App features={DEFAULT_FEATURES} session={null} profile={null} />;
  if (session === undefined) return <LoadingScreen />;
  if (!session) return <Login onLogin={setSession} />;
  if (profile === undefined) return <LoadingScreen />;
  if (profile === null)
    return (
      <NoAccess session={session} errorType={profileError} onRetry={() => setRefreshKey((k) => k + 1)} />
    );
  if (trialEndsAt === undefined) return <LoadingScreen />;
  if (isTrialExpired) return <TrialExpired session={session} trialEndsAt={trialEndsAt} />;

  return <App features={features} session={session} profile={profile} trialEndsAt={trialEndsAt} />;
}
