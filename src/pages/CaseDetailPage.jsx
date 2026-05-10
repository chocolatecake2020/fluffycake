import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  deleteCase,
  deleteReport,
  getCase,
  getUserProfileById,
  listCaseFiles,
  listClinicCases
} from "../api/platformApi";
import {
  claimFirstFreeCase,
  getPaymentForCase,
  isP2pEnabled,
  isPaymentPaid,
  isPlatformCheckoutEnabled
} from "../api/paymentsApi";
import Info from "../components/common/Info";
import StatusBadge from "../components/common/StatusBadge";
import { useAuth } from "../context/AuthContext";
import P2pPaymentPanel from "../features/payments/components/P2pPaymentPanel";
import { PRIOR_AI_LABELS, extractIntakeFromHistory } from "../lib/caseIntake";

function isImageFile(file) {
  return file.fileType?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(file.fileName || "");
}

function CaseDetailPage() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const [item, setItem] = useState(null);
  const [files, setFiles] = useState([]);
  const [paid, setPaid] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reviewerProfile, setReviewerProfile] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deletingReport, setDeletingReport] = useState(false);
  const [reportError, setReportError] = useState("");

  useEffect(() => {
    let cancelled = false;
    // Safety net: if any underlying call (Supabase auth/session edge cases)
    // never settles, we still resolve the loading state with a fallback so
    // the page does not hang on "Loading case...".
    const withTimeout = (promise, ms, fallback) =>
      Promise.race([
        Promise.resolve(promise).catch(() => fallback),
        new Promise((resolve) => setTimeout(() => resolve(fallback), ms))
      ]);

    const LOAD_TIMEOUT_MS = 4000;

    const load = async () => {
      setLoading(true);
      const [caseData, caseFiles, payment] = await Promise.all([
        withTimeout(getCase(caseId), LOAD_TIMEOUT_MS, null),
        withTimeout(listCaseFiles(caseId), LOAD_TIMEOUT_MS, []),
        withTimeout(getPaymentForCase(caseId), LOAD_TIMEOUT_MS, null)
      ]);

      let resolvedCase = caseData;
      if (!resolvedCase && profile?.role === "clinic") {
        try {
          const clinicCases = await withTimeout(listClinicCases(), LOAD_TIMEOUT_MS, []);
          resolvedCase = (clinicCases || []).find((c) => c.id === caseId) || null;
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

      // First-case-free promo runs in the background so it never blocks the
      // main case detail render. The payment pill updates once it settles.
      const canAttemptFree =
        resolvedCase
        && profile?.role === "clinic"
        && resolvedCase.status === "Report Ready"
        && !isPaymentPaid(payment);
      if (canAttemptFree) {
        (async () => {
          try {
            await claimFirstFreeCase({
              caseId: resolvedCase.id,
              clinicId: resolvedCase.clinicId
            });
            const refreshed = await withTimeout(
              getPaymentForCase(caseId),
              LOAD_TIMEOUT_MS,
              payment
            );
            if (!cancelled) setPaid(isPaymentPaid(refreshed));
          } catch (_promoError) {
            // Promo claim failure should never affect the rendered case.
          }
        })();
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

  // Edit / Delete are only offered to the owning clinic before the case has
  // progressed past "Submitted". Once a reviewer opens or submits the report,
  // the clinic can no longer mutate the source data. We also accept admin so
  // an admin can clean up on the clinic's behalf if needed.
  const norm = (value) => String(value ?? "").trim().toLowerCase();
  const role = norm(profile?.role);
  const isClinicRole = role === "clinic" || role === ""; // role missing -> assume clinic for legacy accounts
  const isAdminRole = role === "admin";
  const isOwnerClinic = (() => {
    if (!item?.clinicId) return false;
    if (isAdminRole) return true;
    if (!isClinicRole) return false;
    const candidates = [user?.id, profile?.id, user?.email, profile?.email]
      .map(norm)
      .filter(Boolean);
    return candidates.includes(norm(item.clinicId));
  })();
  const canEditOrDelete = isOwnerClinic && item?.status === "Submitted";

  const handleDelete = async () => {
    if (!item) return;
    const confirmed = window.confirm(
      "Delete this case? Attached files and audit references will be removed. This cannot be undone."
    );
    if (!confirmed) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteCase(item.id);
      navigate("/clinic");
    } catch (error) {
      setDeleteError(error?.message || "Failed to delete the case.");
      setDeleting(false);
    }
  };

  // Report-level Edit/Delete is offered only when the current reviewer authored
  // the report and the clinic has not yet paid. After payment the report becomes
  // immutable so the clinic can rely on what they paid for.
  const isReportAuthor =
    role === "reviewer"
      && item?.reviewerId
      && user?.id
      && String(item.reviewerId) === String(user.id);
  const canEditOrDeleteReport = Boolean(isReportAuthor && item?.report && !paid);

  const handleDeleteReport = async () => {
    if (!item) return;
    const confirmed = window.confirm(
      "Delete this submitted report? The case will move back to \"Submitted\" so you can rewrite a new one. This cannot be undone."
    );
    if (!confirmed) return;
    setDeletingReport(true);
    setReportError("");
    try {
      await deleteReport(item.id);
      navigate("/reviewer");
    } catch (error) {
      setReportError(error?.message || "Failed to delete the report.");
      setDeletingReport(false);
    }
  };

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
        <div className="row between">
          <h2 style={{ margin: 0 }}>{item.title}</h2>
          {canEditOrDelete && (
            <div className="row" style={{ gap: 8 }}>
              <Link className="btn small" to={`/clinic/cases/${item.id}/edit`}>
                Edit
              </Link>
              <button
                className="btn small"
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                style={{ borderColor: "#8b1f15", color: "#8b1f15" }}
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          )}
        </div>
        {isOwnerClinic && !canEditOrDelete && item?.status && item.status !== "Submitted" && (
          <p className="auth-meta">
            Edit/Delete is disabled because this case is in "{item.status}" state.
          </p>
        )}
        {deleteError && <p className="auth-meta" style={{ color: "#8b1f15" }}>{deleteError}</p>}
        <div className="grid two" style={{ marginTop: 12 }}>
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
      {(() => {
        const intake = extractIntakeFromHistory(item.history);
        const priorLabel = PRIOR_AI_LABELS[intake.priorAiSource] || PRIOR_AI_LABELS.none;
        const dash = "-";
        return (
          <section className="card">
            <h3>Submitted Case Details</h3>
            <div className="grid two">
              <Info label="Patient name" value={item.patientName || dash} />
              <Info label="Species" value={item.species || dash} />
              <Info label="Breed" value={item.breed || dash} />
              <Info label="Age" value={item.age || dash} />
              <Info label="Sex" value={item.sex || dash} />
              <Info label="Weight" value={item.weight || dash} />
              <Info label="Presenting complaint" value={item.complaint || dash} />
              <Info label="Requested review type" value={item.reviewType || dash} />
              <Info label="Priority" value={item.priority || dash} />
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
              <Info label="Current medication" value={item.medication || dash} />
            </div>
          </section>
        );
      })()}
      <section className="card">
        <h3>Uploaded Files</h3>
        {files.length === 0 ? (
          <p className="auth-meta" style={{ margin: 0 }}>No files uploaded.</p>
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
        <div className="row between">
          <h3 style={{ margin: 0 }}>Report</h3>
          {canEditOrDeleteReport && (
            <div className="row" style={{ gap: 8 }}>
              <Link className="btn small" to={`/reviewer/report/${item.id}`}>
                Edit Report
              </Link>
              <button
                className="btn small"
                type="button"
                onClick={handleDeleteReport}
                disabled={deletingReport}
                style={{ borderColor: "#8b1f15", color: "#8b1f15" }}
              >
                {deletingReport ? "Deleting..." : "Delete Report"}
              </button>
            </div>
          )}
        </div>
        {isReportAuthor && item?.report && paid && (
          <p className="auth-meta">
            This report is locked because the clinic has paid for it. Contact the admin if a correction is required.
          </p>
        )}
        {reportError && <p className="auth-meta" style={{ color: "#8b1f15" }}>{reportError}</p>}
        {(() => {
          const innerRole = profile?.role;
          const reviewerCanView = innerRole === "reviewer" || innerRole === "admin";
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
                    ? "Review report is locked. Complete PayPal checkout in the payment section above—the report unlocks automatically after payment."
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
