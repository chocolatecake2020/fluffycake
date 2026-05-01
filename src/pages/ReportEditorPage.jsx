import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  downloadReportPDF,
  getCase,
  requestMoreInfo,
  submitReport
} from "../api/platformApi";
import DashboardHeader from "../components/common/DashboardHeader";
import Field from "../components/common/Field";
import { reviewerMenu } from "../constants/menus";
import { reportTemplate } from "../data/mockData";

function ReportEditorPage() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(reportTemplate);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [hasExistingReport, setHasExistingReport] = useState(false);

  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setMessage("");
      try {
        const existing = await getCase(caseId).catch(() => null);
        if (cancelled) return;
        if (existing?.report && typeof existing.report === "object") {
          setReport({ ...reportTemplate, ...existing.report });
          setHasExistingReport(true);
        } else {
          setReport(reportTemplate);
          setHasExistingReport(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  const onChange = (e) => setReport((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async () => {
    setBusy(true);
    setMessage("");
    try {
      await submitReport(caseId, report);
      setMessage(hasExistingReport ? "Report updated." : "Report submitted.");
      navigate(`/cases/${caseId}`);
    } catch (error) {
      setMessage(error?.message || "Failed to save report.");
    } finally {
      setBusy(false);
    }
  };

  const handleRequestInfo = async () => {
    setBusy(true);
    setMessage("");
    try {
      await requestMoreInfo(caseId, "Additional imaging view requested.");
      setMessage("Additional information requested.");
    } catch (error) {
      setMessage(error?.message || "Failed to request additional information.");
    } finally {
      setBusy(false);
    }
  };

  const handlePreview = async () => {
    await downloadReportPDF(caseId);
    setMessage("PDF preview placeholder opened.");
  };

  if (loading) {
    return (
      <main className="container">
        <DashboardHeader title={`Report Editor / ${caseId}`} menu={reviewerMenu} />
        <section className="card">Loading report...</section>
      </main>
    );
  }

  return (
    <main className="container">
      <DashboardHeader
        title={hasExistingReport ? `Edit Report / ${caseId}` : `Report Editor / ${caseId}`}
        menu={reviewerMenu}
      />
      <section className="card form-grid">
        <Field label="Case Summary" name="caseSummary" value={report.caseSummary} onChange={onChange} textarea />
        <Field label="Imaging / Clinical Findings" name="findings" value={report.findings} onChange={onChange} textarea />
        <Field label="Interpretation" name="interpretation" value={report.interpretation} onChange={onChange} textarea />
        <Field label="Differential Considerations" name="differential" value={report.differential} onChange={onChange} textarea />
        <Field label="Recommendations" name="recommendations" value={report.recommendations} onChange={onChange} textarea />
        <Field label="Limitations" name="limitations" value={report.limitations} onChange={onChange} textarea />
        <Field label="Reviewer Signature" name="reviewerSignature" value={report.reviewerSignature} onChange={onChange} />
        <div className="full report-tone">
          Findings are suggestive of... Clinical correlation is recommended. Further diagnostic evaluation may be
          considered. This report is intended as consultative support.
        </div>
        <div className="row full">
          <button className="btn primary" type="button" onClick={handleSubmit} disabled={busy}>
            {busy ? "Saving..." : hasExistingReport ? "Save Changes" : "Submit Report"}
          </button>
          <button className="btn" type="button" onClick={handlePreview} disabled={busy}>
            Preview PDF
          </button>
          <button className="btn" type="button" onClick={handleRequestInfo} disabled={busy}>
            Request Additional Information
          </button>
        </div>
        {message && <p className="full">{message}</p>}
      </section>
    </main>
  );
}

export default ReportEditorPage;
