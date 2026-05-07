import { useCallback, useEffect, useMemo, useState } from "react";
import { listAuditEvents, listCases, listClinics, listReviewers, listSubmittedReports } from "../api/platformApi";
import {
  isP2pEnabled,
  isPlatformCheckoutEnabled,
  listPayouts,
  listRecentP2pPayments
} from "../api/paymentsApi";
import DashboardHeader from "../components/common/DashboardHeader";
import { adminMenu } from "../constants/menus";
import { useAuth } from "../context/AuthContext";
import AdminCaseControlTable from "../features/admin/components/AdminCaseControlTable";
import AdminMetricsGrid from "../features/admin/components/AdminMetricsGrid";
import P2pConfirmationsTable from "../features/admin/components/P2pConfirmationsTable";
import PayoutsQueueTable from "../features/admin/components/PayoutsQueueTable";

function AdminDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState({ clinics: [], reviewers: [], cases: [] });
  const [auditEvents, setAuditEvents] = useState([]);
  const [submittedReports, setSubmittedReports] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [p2pPending, setP2pPending] = useState([]);

  const showPayouts = isPlatformCheckoutEnabled();
  const showP2p = isP2pEnabled();

  const refreshPayouts = useCallback(async () => {
    try {
      const list = await listPayouts();
      setPayouts(list);
    } catch (_error) {
      setPayouts([]);
    }
  }, []);

  const refreshP2p = useCallback(async () => {
    try {
      const list = await listRecentP2pPayments({ limit: 50 });
      setP2pPending(list);
    } catch (_error) {
      setP2pPending([]);
    }
  }, []);

  useEffect(() => {
    Promise.all([listClinics(), listReviewers(), listCases(), listAuditEvents(12), listSubmittedReports(8)]).then(
      ([clinicsList, reviewerList, caseList, audits, reports]) => {
        setData({ clinics: clinicsList, reviewers: reviewerList, cases: caseList });
        setAuditEvents(audits);
        setSubmittedReports(reports);
      }
    );
    if (showPayouts) refreshPayouts();
    if (showP2p) refreshP2p();
  }, [refreshPayouts, refreshP2p, showPayouts, showP2p]);

  const metrics = useMemo(() => {
    const base = [
      ["Total cases", data.cases.length],
      ["Pending review", data.cases.filter((c) => c.status === "Submitted" || c.status === "Under Review").length],
      ["Reports completed", data.cases.filter((c) => c.status === "Completed").length],
      ["Average turnaround time", "18.5h"],
      ["Active clinics", data.clinics.length],
      ["Active reviewers", data.reviewers.length]
    ];
    if (showPayouts) base.push(["Monthly revenue placeholder", "$18,000"]);
    return base;
  }, [data, showPayouts]);

  return (
    <main className="container">
      <DashboardHeader title="Admin Dashboard" menu={adminMenu} />
      <AdminMetricsGrid metrics={metrics} />
      <AdminCaseControlTable items={data.cases} />
      {showP2p && (
        <P2pConfirmationsTable
          items={p2pPending}
          onRefresh={refreshP2p}
          currentAdminEmail={user?.email || null}
        />
      )}
      {showPayouts && <PayoutsQueueTable items={payouts} onRefresh={refreshPayouts} />}
      <section className="card">
        <h3>Recent Submitted Reports</h3>
        <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Case ID</th>
              <th>Reviewer</th>
              <th>Submitted At</th>
            </tr>
          </thead>
          <tbody>
            {submittedReports.map((report) => (
              <tr key={report.id}>
                <td>{report.caseId}</td>
                <td>{report.reviewerEmail || report.reviewerId || "Unknown"}</td>
                <td>{report.submittedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>
      <section className="card">
        <h3>Audit Log</h3>
        <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Event</th>
              <th>Case ID</th>
              <th>Actor</th>
            </tr>
          </thead>
          <tbody>
            {auditEvents.map((event) => (
              <tr key={event.id}>
                <td>{event.createdAt}</td>
                <td>{event.eventType}</td>
                <td>{event.caseId || "-"}</td>
                <td>{event.actorEmail || event.actorId || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>
    </main>
  );
}

export default AdminDashboard;
