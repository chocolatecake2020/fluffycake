import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function RoleSelectionPage() {
  const navigate = useNavigate();
  const { hasSupabaseConfig, user, profile, signIn, signUp, selectRole } = useAuth();
  const adminEmailWhitelist = (import.meta.env.VITE_ADMIN_EMAIL_WHITELIST || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const [form, setForm] = useState({
    email: "",
    password: "",
    phone: "",
    fullName: "",
    institution: "",
    signupRole: "clinic",
    paypalEmail: ""
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const canSignupAdmin = adminEmailWhitelist.includes((form.email || "").trim().toLowerCase());

  const onChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSignIn = async () => {
    setLoading(true);
    setMessage("");
    try {
      const email = form.email.trim();
      const password = form.password;
      if (!email || !password) {
        setMessage("이메일과 비밀번호를 모두 입력해 주세요.");
        return;
      }
      await signIn(email, password);
      setMessage("Signed in successfully.");
    } catch (error) {
      const raw = (error?.message || "").toLowerCase();
      if (raw.includes("invalid login credentials")) {
        setMessage("이메일 또는 비밀번호가 올바르지 않습니다.");
      } else if (raw.includes("email not confirmed")) {
        setMessage("이메일 인증이 완료되지 않았습니다. 메일함에서 인증을 먼저 진행해 주세요.");
      } else {
        setMessage(error.message || "로그인에 실패했습니다.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    setLoading(true);
    setMessage("");
    try {
      if (!form.fullName.trim()) {
        setMessage("Name is required for account creation.");
        return;
      }
      if (!form.institution.trim()) {
        setMessage("Hospital / Institution is required for account creation.");
        return;
      }
      if (!form.phone.trim()) {
        setMessage("Phone is required for account creation.");
        return;
      }
      if (form.signupRole === "admin" && !canSignupAdmin) {
        setMessage("This email is not allowed for admin signup.");
        return;
      }
      if (form.signupRole === "reviewer" && !form.paypalEmail.trim()) {
        setMessage("PayPal email is required for reviewer payouts.");
        return;
      }
      await signUp({
        email: form.email,
        password: form.password,
        phone: form.phone.trim(),
        role: form.signupRole,
        fullName: form.fullName.trim(),
        institution: form.institution.trim(),
        paypalEmail: form.paypalEmail.trim()
      });
      setMessage("Account created. You can sign in now.");
    } catch (error) {
      const raw = (error?.message || "").toLowerCase();
      if (raw.includes("rate limit") || raw.includes("quota")) {
        setMessage("이메일 발송 한도에 도달했습니다. 잠시 후 다시 시도하거나 Supabase Authentication > Rate Limits에서 한도를 확인해 주세요.");
      } else {
        setMessage(error.message || "Failed to sign up.");
      }
    } finally {
      setLoading(false);
    }
  };

  const goRole = async (role) => {
    const routeMap = { clinic: "/clinic", reviewer: "/reviewer", admin: "/admin" };
    const target = routeMap[role];

    if (hasSupabaseConfig && !user) {
      setMessage("Please sign in first, then choose Clinic / Reviewer / Admin.");
      return;
    }

    navigate(target);

    if (hasSupabaseConfig && user) {
      try {
        await selectRole(role);
      } catch (error) {
        setMessage(error.message || "Role sync failed, but workspace entry succeeded.");
      }
    }
  };

  return (
    <main className="container narrow">
      <section className="card role-card">
        <h2>Login / Role Selection</h2>
        <p>Select your operational role for role-based dashboard routing.</p>
        {!hasSupabaseConfig && (
          <div className="warning-box full">
            Supabase env is not configured yet. Role routing works in demo mode.
          </div>
        )}

        {hasSupabaseConfig && !user && (
          <div className="form-grid auth-grid">
            <div>
              <label>Email</label>
              <input name="email" type="email" value={form.email} onChange={onChange} />
            </div>
            <div>
              <label>Password</label>
              <input name="password" type="password" value={form.password} onChange={onChange} />
            </div>
            <div>
              <label>Phone (for signup only)</label>
              <input name="phone" type="tel" value={form.phone} onChange={onChange} placeholder="+82 10..." />
            </div>
            <div>
              <label>Name (for signup only)</label>
              <input name="fullName" value={form.fullName} onChange={onChange} placeholder="Dr. Kim" />
            </div>
            <div>
              <label>Hospital / Institution (for signup only)</label>
              <input name="institution" value={form.institution} onChange={onChange} placeholder="Konkuk Veterinary Hospital" />
            </div>
            <div>
              <label>Account Type (for signup only)</label>
              <select name="signupRole" value={form.signupRole} onChange={onChange}>
                <option value="clinic">Clinic</option>
                <option value="reviewer">Reviewer</option>
                {canSignupAdmin && <option value="admin">Admin</option>}
              </select>
            </div>
            {form.signupRole === "reviewer" && (
              <div>
                <label>PayPal Email (for reviewer payouts)</label>
                <input
                  name="paypalEmail"
                  type="email"
                  value={form.paypalEmail}
                  onChange={onChange}
                  placeholder="reviewer@paypal.com"
                />
              </div>
            )}
            <div className="row full">
              <button className="btn primary" onClick={handleSignIn} disabled={loading}>
                {loading ? "Working..." : "Sign In"}
              </button>
              <button className="btn" onClick={handleSignUp} disabled={loading}>
                Create Account
              </button>
            </div>
          </div>
        )}
        {hasSupabaseConfig && user && (
          <p className="auth-meta">
            Signed in as <strong>{user.email}</strong> {profile?.role ? `(role: ${profile.role})` : ""}
          </p>
        )}

        {message && <p className="auth-meta">{message}</p>}

        <div className="grid three role-grid">
          <button className="btn role-btn role-btn-clinic" type="button" onClick={() => goRole("clinic")}>
            Clinic
          </button>
          <button className="btn role-btn role-btn-reviewer" type="button" onClick={() => goRole("reviewer")}>
            Reviewer
          </button>
          <button className="btn role-btn role-btn-admin" type="button" onClick={() => goRole("admin")}>
            Admin
          </button>
        </div>
      </section>
    </main>
  );
}

export default RoleSelectionPage;
