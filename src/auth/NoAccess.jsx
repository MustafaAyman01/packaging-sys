import { sb } from "../services/supabaseClient";

export function NoAccess({ session, errorType, onRetry }) {
  const isConnIssue = errorType === "timeout" || errorType === "network" || errorType === "error";
  const title = isConnIssue ? "تعذّر تحميل بيانات الحساب" : "مصنع الملابس";
  const message =
    errorType === "timeout"
      ? "الاتصال بالسحابة بياخد وقت أطول من المعتاد — على الأغلب الإنترنت ضعيف أو غير مستقر حاليًا."
      : errorType === "network"
        ? "تعذّر الاتصال بالسحابة — تأكد من اتصالك بالإنترنت وحاول مرة أخرى."
        : errorType === "error"
          ? "حدث خطأ غير متوقع أثناء تحميل بيانات حسابك. جرّب إعادة المحاولة، ولو استمرت المشكلة تواصل مع مزوّد النظام."
          : null;
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
          width: 400,
          maxWidth: "100%",
          padding: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: isConnIssue
              ? "linear-gradient(135deg,#7a4f00,#5c3a00)"
              : "linear-gradient(135deg,#0f4c5c,#0a3540)",
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
            {isConnIssue ? "\uD83D\uDCF6" : "\uD83D\uDCE6"}
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              marginTop: 8,
            }}
          >
            {title}
          </div>
        </div>
        <div
          className="card-body"
          style={{
            padding: 28,
            textAlign: "center",
          }}
        >
          {isConnIssue ? (
            <div
              style={{
                fontSize: 14,
                color: "var(--text2)",
                marginBottom: 18,
                lineHeight: 1.7,
              }}
            >
              {message}
            </div>
          ) : (
            <div
              style={{
                fontSize: 14,
                color: "var(--text2)",
                marginBottom: 18,
              }}
            >
              حسابك ({session?.user?.email}) لم يتم ربطه بأي منشأة بعد.
              <br />
              يرجى التواصل مع مزوّد النظام لتفعيل حسابك.
            </div>
          )}
          {isConnIssue && (
            <button
              className="btn btn-primary"
              style={{
                width: "100%",
                justifyContent: "center",
                marginBottom: 10,
              }}
              onClick={onRetry}
            >
              🔄 إعادة المحاولة
            </button>
          )}
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

// ── APP ROOT (handles auth + feature flags when Supabase enabled) ──────────────
