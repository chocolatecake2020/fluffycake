import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listClinicCases } from "../api/platformApi";
import { listFreeCaseIds, listPaidCaseIds } from "../api/paymentsApi";
import DashboardHeader from "../components/common/DashboardHeader";
import { useAuth } from "../context/AuthContext";
import { clinicMenu } from "../constants/menus";
import CaseTable from "../features/cases/components/CaseTable";

function ClinicDashboard() {
  const { loading, user } = useAuth();
  const [data, setData] = useState([]);
  const [paidCaseIds, setPaidCaseIds] = useState(new Set());
  const [freeCaseIds, setFreeCaseIds] = useState(new Set());
  const [error, setError] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setData([]);
      setPaidCaseIds(new Set());
      setFreeCaseIds(new Set());
      setError("");
      return;
    }
    let cancelled = false;
    const loadCases = async () => {
      const identity = {
        clinicId: user?.id || null,
        clinicEmail: user?.email || null
      };
      let lastResult = [];
      let lastError = "";
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const cases = await listClinicCases(identity);
          lastResult = cases;
          lastError = "";
          if (cases.length > 0) break;
        } catch (loadError) {
          lastError = loadError?.message || "Failed to load clinic cases.";
        }
        await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
      }
      if (!cancelled) {
        setData(lastResult);
        setError(lastError);
      }

      // Pull paid + free in parallel; failures fall back to empty sets so a
      // single API hiccup never blocks the case table from rendering.
      const [paidIds, freeIds] = await Promise.all([
        listPaidCaseIds().catch(() => new Set()),
        listFreeCaseIds().catch(() => new Set())
      ]);
      if (!cancelled) {
        setPaidCaseIds(paidIds);
        setFreeCaseIds(freeIds);
      }
    };

    loadCases();
    return () => {
      cancelled = true;
    };
  }, [loading, user?.id]);

  return (
    <main className="container">
      <DashboardHeader title="Clinic Dashboard" menu={clinicMenu} />
      <section className="card">
        <div className="row between">
          <h3>My Cases</h3>
          <Link className="btn primary" to="/clinic/new-case">
            Create New Case
          </Link>
        </div>
        {error && <p className="auth-meta">{error}</p>}
        <CaseTable items={data} paidCaseIds={paidCaseIds} freeCaseIds={freeCaseIds} />
      </section>
    </main>
  );
}

export default ClinicDashboard;
