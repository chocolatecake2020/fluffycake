import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getCase, getUserProfileById, listCaseFiles, listClinicCases } from "../api/platformApi";
import {
  getPaymentForCase,
  isP2pEnabled,
  isPaymentPaid,
  isPlatformCheckoutEnabled
} from "../api/paymentsApi";
import Info from "../components/common/Info";
import StatusBadge from "../components/common/StatusBadge";
import { useAuth } from "../context/AuthContext";
import P2pPaymentPanel from "../features/payments/components/P2pPaymentPanel";

function isImageFile(file) {
  return file.fileType?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(file.fileName || "");
}

function CaseDetailPage() {
  const { caseId } = useParams();
  const { profile } = useAuth();
  const [item, setItem] = useState(null);
  const [files, setFiles] = useState([]);
  const [paid, setPaid] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reviewerProfile, setReviewerProfile] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const [caseData, caseFiles, payment] = await Promise.all([
        getCase(caseId).catch(() => null),
        listCaseFiles(caseId).catch(() => []),
        getPaymentForCase(caseId).catch(() => null)
      ]);

      let resolvedCase = caseData;
      if (!resolvedCase && profile?.role === "clinic") {
        try {
          const clinicCases = await listClinicCases();
          resolvedCase = clinicCases.find((c) => c.id === caseId) || null;
        } catch (_error) {
          // ignore
        }
      }

      if (cancelled) return;
      setItem(resolvedCase);
      setFiles(caseFiles || []);
      setPaid(isPaymentPaid(payment));
      setLoading(false);

      const reviewerId = resolvedCase?.reviewerId;
      if (reviewerId) {
        getUserProfileById(reviewerId)
          .then((p) => {
            if (!cancelled) setReviewerProfile(p);
          })
          .catch(() => null);
      } else {
        setReviewerProfile(null);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [caseId, profile?.role]);

  const handlePaymentChanged = useCallback((payment) => {
    setPaid(isPaymentPaid(payment));
  }, []);

  if (loading) {
    return (
      <main className="container">
        <section className="card">Loading case...</section>
      </main>
    );
  }

  if (!item) {
    return (
      <main className="container">
        <section className="card">
          <p>Case not found, or your session may have expired.</p>
          <p className="auth-meta">
            Try returning to the <Link to="/clinic">workspace</Link> and reopening the case. If the
            issue persists, sign out and back in to refresh your session.
          </p>
        </section>
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
          <Info
            label="Reviewer assignment"
            value={
              item.reviewerId
                ? [
                    reviewerProfile?.full_name,
                    reviewerProfile?.email,
                    !reviewerProfile?.full_name && !reviewerProfile?.email
                      ? item.reviewerId
                      : null
                  ]
                    .filter(Boolean)
                    .join(" / ")
                : "Unassigned"
            }
          />
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
      <P2pPaymentPanel caseItem={item} role={profile?.role} onPaymentChanged={handlePaymentChanged} />
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
            const showPlatformCta = isPlatformCheckoutEnabled();
            const showP2pCta = isP2pEnabled();
            return (
              <div className="row between">
                <p>
                  {showP2pCta && !showPlatformCta
                    ? "Review report is locked. Complete the direct PayPal settlement above and wait for admin verification to unlock the report."
                    : "Review report is locked. Complete payment to unlock the full report."}
                </p>
                {showP2pCta && !showPlatformCta ? (
                  <a className="btn primary" href="#payment">
                    Go to Payment
                  </a>
                ) : (
                  <Link className="btn primary" to={`/payments?caseId=${encodeURIComponent(item.id)}`}>
                    Pay to Unlock
                  </Link>
                )}
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
