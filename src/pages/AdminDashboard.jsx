import { useEffect, useMemo, useState } from "react";
import { listAuditEvents, listCases, listClinics, listReviewers, listSubmittedReports } from "../api/platformApi";
import DashboardHeader from "../components/common/DashboardHeader";
import { adminMenu } from "../constants/menus";
import AdminCaseControlTable from "../features/admin/components/AdminCaseControlTable";
import AdminMetricsGrid from "../features/admin/components/AdminMetricsGrid";

function AdminDashboard() {
  const [data, setData] = useState({ clinics: [], reviewers: [], cases: [] });
  const [auditEvents, setAuditEvents] = useState([]);
  const [submittedReports, setSubmittedReports] = useState([]);

  useEffect(() => {
    Promise.all([listClinics(), listReviewers(), listCases(), listAuditEvents(12), listSubmittedReports(8)]).then(
      ([clinicsList, reviewerList, caseList, audits, reports]) => {
        setData({ clinics: clinicsList, reviewers: reviewerList, cases: caseList });
        setAuditEvents(audits);
        setSubmittedReports(reports);
      }
    );
  }, []);

  const metrics = useMemo(
    () => [
      ["Total cases", data.cases.length],
      ["Pending review", data.cases.filter((c) => c.status === "Submitted" || c.status === "Under Review").length],
      ["Reports completed", data.cases.filter((c) => c.status === "Completed").length],
      ["Average turnaround time", "18.5h"],
      ["Active clinics", data.clinics.length],
      ["Active reviewers", data.reviewers.length],
      ["Monthly revenue placeholder", "$18,000"]
    ],
    [data]
  );

  return (
    <main className="container">
      <DashboardHeader title="Admin Dashboard" menu={adminMenu} />
      <AdminMetricsGrid metrics={metrics} />
      <AdminCaseControlTable items={data.cases} />
      <section className="card">
        <h3>Recent Submitted Reports</h3>
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
      </section>
      <section className="card">
        <h3>Audit Log</h3>
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
      </section>
    </main>
  );
}

export default AdminDashboard;
