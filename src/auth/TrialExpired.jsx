import { sb } from "../services/supabaseClient";

export function TrialExpired({ session, trialEndsAt }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        fontFamily: "'IBM Plex Sans Arabic',sans-serif",
        padding: 16,
      }}
    >
      <div
        className="card"
        style={{
          width: 420,
          maxWidth: "100%",
          padding: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg,#5c1a1a,#3a0f0f)",
            padding: "32px 28px",
            textAlign: "center",
            color: "#fff",
          }}
        >
          <div
            style={{
              fontSize: 40,
            }}
          >
            ⏰
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              marginTop: 8,
            }}
          >
            انتهت الفترة التجريبية
          </div>
        </div>
        <div
          className="card-body"
          style={{
            padding: 28,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 14,
              color: "var(--text2)",
              marginBottom: 8,
            }}
          >
            انتهت الفترة التجريبية لحسابك ({session?.user?.email}) في{" "}
            {trialEndsAt
              ? new Date(trialEndsAt).toLocaleDateString("ar-EG", {
                  numberingSystem: "latn",
                })
              : ""}
            .
          </div>
          <div
            style={{
              fontSize: 14,
              color: "var(--text2)",
              marginBottom: 18,
            }}
          >
            للاستمرار في استخدام النظام، يرجى التواصل مع مزوّد النظام لتفعيل الاشتراك.
          </div>
          <button
            className="btn btn-secondary"
            style={{
              width: "100%",
              justifyContent: "center",
            }}
            onClick={() => sb.auth.signOut()}
          >
            تسجيل الخروج
          </button>
        </div>
      </div>
    </div>
  );
}
