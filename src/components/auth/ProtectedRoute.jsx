import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const ACTIVE_ACCOUNT_EMAIL_KEY = "vetbridge-active-account-email";

function readExpectedEmail() {
  try {
    return (window.localStorage.getItem(ACTIVE_ACCOUNT_EMAIL_KEY) || "").trim().toLowerCase();
  } catch (_error) {
    return "";
  }
}

function ProtectedRoute({ children, requiredRole }) {
  const { hasSupabaseConfig, loading, user, profile, signOut } = useAuth();

  // If the active session email diverges from the pinned account email,
  // force a sign-out so we never read another user's data.
  useEffect(() => {
    if (!hasSupabaseConfig || loading || !user?.email) return;
    const expected = readExpectedEmail();
    const current = (user.email || "").trim().toLowerCase();
    if (expected && current && expected !== current) {
      signOut().catch(() => {});
    }
  }, [hasSupabaseConfig, loading, user?.email, signOut]);

  if (loading) return <main className="container"><section className="card">Loading...</section></main>;

  if (!hasSupabaseConfig) return children;
  if (!user) return <Navigate to="/login" replace />;

  // If role is not synced yet, allow access for authenticated users.
  // Only block when an explicit, mismatched role exists.
  if (requiredRole && profile?.role && profile.role !== requiredRole) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default ProtectedRoute;
