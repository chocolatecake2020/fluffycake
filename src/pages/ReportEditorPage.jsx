import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  downloadReportPDF,
  getCase,
  listCaseFiles,
  requestMoreInfo,
  submitReport
} from "../api/platformApi";
import DashboardHeader from "../components/common/DashboardHeader";
import Field from "../components/common/Field";
import Info from "../components/common/Info";
import StatusBadge from "../components/common/StatusBadge";
import { reviewerMenu } from "../constants/menus";
import { reportTemplate } from "../data/mockData";
import { PRIOR_AI_LABELS, extractIntakeFromHistory } from "../lib/caseIntake";

function isImageFile(file) {
  return file.fileType?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(file.fileName || "");
}

function ReportEditorPage() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(reportTemplate);
  const [caseItem, setCaseItem] = useState(null);
  const [files, setFiles] = useState([]);
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
        // Pull case details and uploaded files in parallel so the reviewer
        // can read everything the clinic submitted (intake, history,
        // attached imaging) without leaving the report editor.
        const [existing, caseFiles] = await Promise.all([
          getCase(caseId).catch(() => null),
          listCaseFiles(caseId).catch(() => [])
        ]);
        if (cancelled) return;
        setCaseItem(existing || null);
        setFiles(caseFiles || []);
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

  const intake = extractIntakeFromHistory(caseItem?.history);
  const priorLabel = PRIOR_AI_LABELS[intake.priorAiSource] || PRIOR_AI_LABELS.none;
  const dash = "-";

  return (
    <main className="container">
      <DashboardHeader
        title={hasExistingReport ? `Edit Report / ${caseId}` : `Report Editor / ${caseId}`}
        menu={reviewerMenu}
      />
      {caseItem && (
        <section className="card">
          <div className="row between">
            <h2 style={{ margin: 0 }}>{caseItem.title || "Submitted case"}</h2>
            <StatusBadge status={caseItem.status} />
          </div>
          <div className="grid two" style={{ marginTop: 12 }}>
            <Info label="Patient name" value={caseItem.patientName || dash} />
            <Info label="Species" value={caseItem.species || dash} />
            <Info label="Breed" value={caseItem.breed || dash} />
            <Info label="Age" value={caseItem.age || dash} />
            <Info label="Sex" value={caseItem.sex || dash} />
            <Info label="Weight" value={caseItem.weight || dash} />
            <Info label="Presenting complaint" value={caseItem.complaint || dash} />
            <Info label="Requested review type" value={caseItem.reviewType || dash} />
            <Info label="Priority" value={caseItem.priority || dash} />
            <Info label="Prior diagnostics / AI output" value={priorLabel} />
            <Info
              label="AI or prior impression notes"
              value={intake.priorAiNotes || dash}
            />
            <Info
              label="Primary question for reviewer"
              value={intake.primaryQuestion || dash}
            />
            <Info label="Clinical history" value={intake.baseHistory || dash} />
            <Info label="Current medication" value={caseItem.medication || dash} />
          </div>
        </section>
      )}
      <section className="card">
        <h3>Uploaded Files</h3>
        {files.length === 0 ? (
          <p className="auth-meta" style={{ margin: 0 }}>No files uploaded.</p>
        ) : (
          <div className="file-list">
            {files.map((file) => (
              <a
                className="file-item"
                href={file.publicUrl || "#"}
                target="_blank"
                rel="noreferrer"
                key={file.id}
              >
                <div className="file-left">
                  {isImageFile(file) ? (
                    <img className="file-thumb" src={file.publicUrl} alt={file.fileName} />
                  ) : (
                    <div className="file-doc">FILE</div>
                  )}
                  <div>
                    <strong>{file.fileName}</strong>
                    <small>
                      {file.fileType} | {Math.max(1, Math.round(file.fileSize / 1024))} KB
                    </small>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>
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
