import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

function ProtectedRoute({ children, requiredRole }) {
  const { hasSupabaseConfig, loading, user, profile } = useAuth();

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
