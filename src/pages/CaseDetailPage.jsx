import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getCase, listCaseFiles } from "../api/platformApi";
import { getPaymentForCase, isPaymentPaid } from "../api/paymentsApi";
import Info from "../components/common/Info";
import StatusBadge from "../components/common/StatusBadge";
import { useAuth } from "../context/AuthContext";

function isImageFile(file) {
  return file.fileType?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(file.fileName || "");
}

function CaseDetailPage() {
  const { caseId } = useParams();
  const { profile } = useAuth();
  const [item, setItem] = useState(null);
  const [files, setFiles] = useState([]);
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    Promise.all([getCase(caseId), listCaseFiles(caseId), getPaymentForCase(caseId)]).then(
      ([caseData, caseFiles, payment]) => {
        setItem(caseData);
        setFiles(caseFiles);
        setPaid(isPaymentPaid(payment));
      }
    );
  }, [caseId]);

  if (!item) {
    return (
      <main className="container">
        <section className="card">Case not found.</section>
      </main>
    );
  }

  return (
    <main className="container">
      <section className="card">
        <h2>{item.title}</h2>
        <div className="grid two">
          <Info label="Patient information" value={`${item.patientName} / ${item.species}`} />
          <Info label="Clinic information" value={item.clinicId ?? "Assigned clinic"} />
          <Info label="Clinical question" value={item.complaint} />
          <Info label="Reviewer assignment" value={item.reviewerId ?? "Unassigned"} />
          <Info label="Status" value={<StatusBadge status={item.status} />} />
          <Info label="Internal notes" value="Awaiting reviewer interpretation assistance." />
        </div>
      </section>
      <section className="card">
        <h3>Uploaded Files</h3>
        {files.length === 0 ? (
          <div className="image-grid">
            {[1, 2, 3, 4].map((n) => (
              <div className="image-placeholder" key={n}>
                Imaging Preview {n}
                <small>DICOM / JPG placeholder viewer</small>
              </div>
            ))}
          </div>
        ) : (
          <div className="file-list">
            {files.map((file) => (
              <a className="file-item" href={file.publicUrl || "#"} target="_blank" rel="noreferrer" key={file.id}>
                <div className="file-left">
                  {isImageFile(file) ? (
                    <img className="file-thumb" src={file.publicUrl} alt={file.fileName} />
                  ) : (
                    <div className="file-doc">FILE</div>
                  )}
                  <div>
                    <strong>{file.fileName}</strong>
                    <small>{file.fileType} | {Math.max(1, Math.round(file.fileSize / 1024))} KB</small>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>
      <section className="card">
        <h3>Case Timeline</h3>
        <ul className="timeline">
          <li>Draft created</li>
          <li>Case submitted</li>
          <li>Reviewer assigned</li>
          <li>Report pending</li>
        </ul>
      </section>
      <section className="card" id="report">
        <h3>Report</h3>
        {(() => {
          const role = profile?.role;
          const reviewerCanView = role === "reviewer" || role === "admin";
          const canViewReport = reviewerCanView || paid;

          if (!item.report) {
            return <p>No report submitted yet.</p>;
          }

          if (!canViewReport) {
            return (
              <div className="row between">
                <p>
                  Review report is locked. Complete payment to unlock the full report.
                </p>
                <Link className="btn primary" to={`/payments?caseId=${encodeURIComponent(item.id)}`}>
                  Pay to Unlock
                </Link>
              </div>
            );
          }

          return (
            <div className="grid two">
              <Info label="Case Summary" value={item.report.caseSummary || "-"} />
              <Info label="Imaging / Clinical Findings" value={item.report.findings || "-"} />
              <Info label="Interpretation" value={item.report.interpretation || "-"} />
              <Info label="Differential Considerations" value={item.report.differential || "-"} />
              <Info label="Recommendations" value={item.report.recommendations || "-"} />
              <Info label="Limitations" value={item.report.limitations || "-"} />
              <Info label="Reviewer Signature" value={item.report.reviewerSignature || "-"} />
            </div>
          );
        })()}
      </section>
    </main>
  );
}

export default CaseDetailPage;
