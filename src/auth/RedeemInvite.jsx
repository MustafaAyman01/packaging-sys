import { useState } from "react";
import { sb } from "../services/supabaseClient";

export function RedeemInvite() {
  const [stage, setStage] = useState("signin"); // signin -> redeem
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState(null);
  const handleAuth = async (isSignUp) => {
    setError("");
    setInfo("");
    setLoading(true);
    if (!email || !password) {
      setError("ادخل البريد الإلكتروني وكلمة المرور");
      setLoading(false);
      return;
    }
    const { data, error } = isSignUp
      ? await sb.auth.signUp({
          email,
          password,
        })
      : await sb.auth.signInWithPassword({
          email,
          password,
        });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data.session) {
      setSession(data.session);
      setStage("redeem");
    } else {
      setInfo("تم إنشاء الحساب! تحقق من بريدك الإلكتروني لتأكيده، ثم سجل الدخول من هنا بنفس البيانات.");
    }
  };
  const redeem = async () => {
    setError("");
    setLoading(true);
    if (!fullName || !inviteCode) {
      setError("من فضلك اكمل كل الحقول");
      setLoading(false);
      return;
    }
    // Make sure the Supabase client actually has an active session before
    // calling the RPC — auth.uid() inside the function depends on this.
    const { data: sessCheck } = await sb.auth.getSession();
    if (!sessCheck.session) {
      setLoading(false);
      setError("انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى من الخطوة السابقة.");
      setStage("signin");
      return;
    }
    const { error } = await sb.rpc("redeem_invite", {
      p_code: inviteCode.trim(),
      p_full_name: fullName,
    });
    setLoading(false);
    if (error) {
      setError("كود الدعوة غير صحيح أو مستخدم من قبل: " + error.message);
      return;
    }
    window.location.href = window.location.pathname; // reload into the main app, invite-free
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
            👖
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              marginTop: 8,
            }}
          >
            الانضمام بكود دعوة
          </div>
        </div>
        <div
          className="card-body"
          style={{
            padding: 28,
          }}
        >
          {stage === "signin" && (
            <React.Fragment>
              <div className="form-group">
                <label>البريد الإلكتروني</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="form-group">
                <label>كلمة المرور</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
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
              {info && (
                <div
                  className="alert alert-success"
                  style={{
                    marginBottom: 12,
                    fontSize: 13,
                  }}
                >
                  {info}
                </div>
              )}
              <button
                className="btn btn-primary"
                style={{
                  width: "100%",
                  justifyContent: "center",
                  marginBottom: 8,
                }}
                disabled={loading}
                onClick={() => handleAuth(false)}
              >
                تسجيل الدخول
              </button>
              <button
                className="btn btn-secondary"
                style={{
                  width: "100%",
                  justifyContent: "center",
                }}
                disabled={loading}
                onClick={() => handleAuth(true)}
              >
                إنشاء حساب جديد بهذا البريد
              </button>
            </React.Fragment>
          )}
          {stage === "redeem" && (
            <React.Fragment>
              <div className="form-group">
                <label>اسمك الكامل</label>
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="form-group">
                <label>كود الدعوة</label>
                <input
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="مثال: a1b2c3d4"
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
                }}
                disabled={loading}
                onClick={redeem}
              >
                {loading ? "جاري الانضمام..." : "انضمام للشركة"}
              </button>
            </React.Fragment>
          )}
        </div>
      </div>
    </div>
  );
}
