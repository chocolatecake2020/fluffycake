import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

function TopBar() {
  const navigate = useNavigate();
  const { user, signOut, hasSupabaseConfig } = useAuth();
  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (_error) {
      // Ignore sign-out network errors; local session is still cleared.
    }
    navigate("/login", { replace: true });
  };

  return (
    <header className="topbar">
      <Link to="/" className="brand">
        VetBridge
      </Link>
      <nav className="top-nav">
        <NavLink to="/login">{user ? "Workspace" : "Login"}</NavLink>
        <NavLink to="/payments">Payments</NavLink>
        <NavLink to="/sample-report">Sample Report</NavLink>
        <NavLink to="/pilot-inquiry">Pilot Inquiry</NavLink>
        <NavLink to="/reviewer-recruitment">Reviewer</NavLink>
        {hasSupabaseConfig && user?.email && <span className="auth-meta">{user.email}</span>}
        {hasSupabaseConfig && user && (
          <button className="btn nav-signout" type="button" onClick={handleSignOut}>
            Sign Out
          </button>
        )}
      </nav>
    </header>
  );
}

export default TopBar;
