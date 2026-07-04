import { useState } from "react";
import { sb } from "../services/supabaseClient";

export function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const handleSignIn = async () => {
    setError("");
    setLoading(true);
    const { data, error } = await sb.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (error) {
      setError("بيانات الدخول غير صحيحة");
      return;
    }
    onLogin(data.session);
  };
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
            background: "linear-gradient(135deg,#0f4c5c,#0a3540)",
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
            📦
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              marginTop: 8,
            }}
          >
            باك سيستم
          </div>
          <div
            style={{
              fontSize: 13,
              opacity: 0.75,
              marginTop: 4,
            }}
          >
            إدارة التعبئة والتغليف
          </div>
        </div>
        <div
          className="card-body"
          style={{
            padding: 28,
          }}
        >
          <div className="form-group">
            <label>البريد الإلكتروني</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
            />
          </div>
          <div className="form-group">
            <label>كلمة المرور</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
            />
          </div>
          {error && (
            <div
              className="alert"
              style={{
                background: "var(--red-bg)",
                color: "var(--red)",
                marginBottom: 12,
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}
          <button
            className="btn btn-primary"
            style={{
              width: "100%",
              justifyContent: "center",
              padding: "12px",
            }}
            disabled={loading}
            onClick={handleSignIn}
          >
            {loading ? "جاري التحميل..." : "تسجيل الدخول"}
          </button>
          <div
            style={{
              textAlign: "center",
              marginTop: 18,
              fontSize: 12.5,
              color: "var(--text3)",
            }}
          >
            للحصول على حساب، يرجى التواصل مع مزوّد النظام.
          </div>
        </div>
      </div>
    </div>
  );
}
