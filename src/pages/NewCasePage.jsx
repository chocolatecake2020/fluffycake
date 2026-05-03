import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createCase, getCase, updateCase, uploadCaseFiles } from "../api/platformApi";
import DashboardHeader from "../components/common/DashboardHeader";
import Field from "../components/common/Field";
import { clinicMenu } from "../constants/menus";
import { useAuth } from "../context/AuthContext";

const MAX_FILE_SIZE_MB = 25;

const REVIEW_TYPE_OPTIONS = [
  "Cytology review",
  "Histopathology review",
  "Oncology consult",
  "Internal medicine consult",
  "Dermatology consult",
  "Ultrasound review",
  "Radiology review",
  "Surgery second opinion",
  "Emergency triage support"
];

const PRIOR_AI_LABELS = {
  none: "None",
  in_clinic: "In-clinic AI",
  third_party: "Third-party AI",
  unsure: "Not sure"
};

const PRIORITY_SLA = {
  Standard: "Typical turnaround: next US business day (target).",
  Urgent: "Typical turnaround: within 12 hours (target).",
  Overnight: "Typical turnaround: by 9:00 AM ET next business morning (target)."
};

const ALLOWED_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "pdf",
  "dcm",
  "dicom",
  "zip",
  "csv",
  "txt",
  "doc",
  "docx"
];

function getExtension(fileName = "") {
  const parts = fileName.split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

function validateSelectedFiles(selectedFiles) {
  const maxBytes = MAX_FILE_SIZE_MB * 1024 * 1024;
  for (const file of selectedFiles) {
    const ext = getExtension(file.name);
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `Unsupported file type: ${file.name}. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`;
    }
    if (file.size > maxBytes) {
      return `File too large: ${file.name}. Max ${MAX_FILE_SIZE_MB}MB per file.`;
    }
  }
  return "";
}

function mergeIntakeIntoHistory({ baseHistory, priorAiSource, priorAiNotes, primaryQuestion }) {
  const priorLabel = PRIOR_AI_LABELS[priorAiSource] || PRIOR_AI_LABELS.none;
  const notes = (priorAiNotes || "").trim();
  const pq = (primaryQuestion || "").trim();
  return `[Intake]\nPrior diagnostics/AI: ${priorLabel}\nAI/impression notes:\n${notes}\n\nPrimary question for reviewer:\n${pq}\n\n[Clinical history]\n${(baseHistory || "").trim()}`;
}

function extractIntakeFromHistory(full) {
  const raw = typeof full === "string" ? full : "";
  const marker = "\n\n[Clinical history]\n";
  const idx = raw.indexOf(marker);
  if (idx === -1) {
    return {
      baseHistory: raw,
      priorAiSource: "none",
      priorAiNotes: "",
      primaryQuestion: ""
    };
  }
  const before = raw.slice(0, idx);
  const baseHistory = raw.slice(idx + marker.length);
  if (!before.startsWith("[Intake]")) {
    return {
      baseHistory: raw,
      priorAiSource: "none",
      priorAiNotes: "",
      primaryQuestion: ""
    };
  }
  const pqMarker = "\n\nPrimary question for reviewer:\n";
  const pqIdx = before.indexOf(pqMarker);
  if (pqIdx === -1) {
    return {
      baseHistory: raw,
      priorAiSource: "none",
      priorAiNotes: "",
      primaryQuestion: ""
    };
  }
  const primaryQuestion = before.slice(pqIdx + pqMarker.length).trim();
  const intakeTop = before.slice(0, pqIdx);
  const notesMarker = "AI/impression notes:\n";
  const nmIdx = intakeTop.indexOf(notesMarker);
  let priorAiNotes = "";
  let priorAiSource = "none";
  if (nmIdx !== -1) {
    priorAiNotes = intakeTop.slice(nmIdx + notesMarker.length).trim();
    const priorSection = intakeTop.slice(0, nmIdx);
    const m = priorSection.match(/Prior diagnostics\/AI:\s*([^\n]+)/);
    if (m) {
      const v = m[1].trim();
      if (v === PRIOR_AI_LABELS.in_clinic) priorAiSource = "in_clinic";
      else if (v === PRIOR_AI_LABELS.third_party) priorAiSource = "third_party";
      else if (v === PRIOR_AI_LABELS.unsure) priorAiSource = "unsure";
      else priorAiSource = "none";
    }
  }
  return { baseHistory, priorAiSource, priorAiNotes, primaryQuestion };
}

function uploadHintForReviewType(reviewType) {
  switch (reviewType) {
    case "Cytology review":
      return "Upload: stained smears, scanner photos, or PDF reports with representative fields.";
    case "Histopathology review":
      return "Upload: H&E / special stain photos, pathology reports, or zipped whole-slide exports if available.";
    case "Oncology consult":
      return "Upload: staging imaging, lab trends, biopsy or cytology summaries, and treatment goals.";
    case "Internal medicine consult":
      return "Upload: lab panels, vitals trends, imaging summaries, and medication list (also in form).";
    case "Dermatology consult":
      return "Upload: lesion photos (multiple angles/lighting), trichograms, cytology, and parasite testing.";
    case "Ultrasound review":
      return "Upload: key cine loops or still frames, measurements, and the specific structure or differential in question.";
    case "Radiology review":
      return "Upload: DICOM or zipped series when possible; include positioning notes and region of interest.";
    case "Surgery second opinion":
      return "Upload: imaging, lab results, anesthesia risk factors, and the proposed procedure summary.";
    case "Emergency triage support":
      return "Upload: vitals sheet, point-of-care labs, ECG or imaging, and current treatments given.";
    default:
      return "Upload: any images, reports, or zipped studies that support the question below.";
  }
}

function withTimeout(promise, timeoutMs, timeoutMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    })
  ]);
}

function NewCasePage() {
  const navigate = useNavigate();
  const { caseId } = useParams();
  const isEditMode = Boolean(caseId);
  const { user, profile } = useAuth();
  const [form, setForm] = useState({
    patientName: "",
    species: "dog",
    breed: "",
    age: "",
    sex: "",
    weight: "",
    complaint: "",
    history: "",
    medication: "",
    reviewType: "Cytology review",
    priority: "Standard",
    priorAiSource: "none",
    priorAiNotes: "",
    primaryQuestion: "",
    title: "New submitted case"
  });
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [uploadProgress, setUploadProgress] = useState(null);
  const [loadingCase, setLoadingCase] = useState(isEditMode);
  const [editLocked, setEditLocked] = useState(false);

  useEffect(() => {
    if (!isEditMode) return;
    let cancelled = false;
    const load = async () => {
      setLoadingCase(true);
      setError("");
      try {
        const existing = await getCase(caseId);
        if (cancelled) return;
        if (!existing) {
          setError("Case not found, or you no longer have access to it.");
          return;
        }
        // Edit is only safe before the case has progressed beyond Submitted.
        if (existing.status && existing.status !== "Submitted") {
          setEditLocked(true);
          setError(
            `This case is in "${existing.status}" state and can no longer be edited. Open the case detail page instead.`
          );
        }
        const extracted = extractIntakeFromHistory(existing.history ?? "");
        setForm((prev) => ({
          ...prev,
          title: existing.title ?? prev.title,
          patientName: existing.patientName ?? "",
          species: existing.species ?? prev.species,
          breed: existing.breed ?? "",
          age: existing.age ?? "",
          sex: existing.sex ?? "",
          weight: existing.weight ?? "",
          complaint: existing.complaint ?? "",
          history: extracted.baseHistory,
          medication: existing.medication ?? "",
          reviewType: existing.reviewType ?? prev.reviewType,
          priority: existing.priority ?? prev.priority,
          priorAiSource: extracted.priorAiSource,
          priorAiNotes: extracted.priorAiNotes,
          primaryQuestion: extracted.primaryQuestion
        }));
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Failed to load case for editing.");
        }
      } finally {
        if (!cancelled) setLoadingCase(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [isEditMode, caseId]);

  const onChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  const onFilesChange = (e) => {
    const nextFiles = Array.from(e.target.files || []);
    const validationError = validateSelectedFiles(nextFiles);
    if (validationError) {
      setFiles([]);
      setError(validationError);
      return;
    }
    setError("");
    setFiles(nextFiles);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (editLocked) return;
    if (!form.primaryQuestion.trim()) {
      setError("Primary question for reviewer is required (what decision are you trying to make?).");
      return;
    }
    setSubmitting(true);
    setError("");
    setUploadProgress(isEditMode ? "Updating case record..." : "Creating case record...");
    const mergedHistory = mergeIntakeIntoHistory({
      baseHistory: form.history,
      priorAiSource: form.priorAiSource,
      priorAiNotes: form.priorAiNotes,
      primaryQuestion: form.primaryQuestion
    });
    const payload = { ...form, history: mergedHistory };
    try {
      let resolvedCaseId = caseId;
      if (isEditMode) {
        const updated = await withTimeout(
          updateCase(caseId, payload),
          15000,
          "Case update timed out. Please retry in a few seconds."
        );
        resolvedCaseId = updated?.id || caseId;
      } else {
        const clinicId =
          user?.id || profile?.id || user?.email || profile?.email || "clinic-local";
        const created = await withTimeout(
          createCase({ ...payload, clinicId }),
          15000,
          "Case creation timed out. Please retry in a few seconds."
        );
        resolvedCaseId = created.id;
      }
      if (files.length) {
        await withTimeout(
          uploadCaseFiles(resolvedCaseId, files, {
            onProgress: ({ uploaded, total, percent }) =>
              setUploadProgress(`Uploading files: ${uploaded}/${total} (${percent}%)`)
          }),
          45000,
          "File upload timed out. Try submitting again with fewer/smaller files."
        );
      }
      navigate(`/cases/${resolvedCaseId}`);
    } catch (submitError) {
      setError(submitError.message || (isEditMode ? "Failed to update case." : "Failed to submit case."));
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  };

  if (isEditMode && loadingCase) {
    return (
      <main className="container">
        <DashboardHeader title="Edit Case" menu={clinicMenu} />
        <section className="card">Loading case...</section>
      </main>
    );
  }

  const headerTitle = isEditMode ? "Edit Case" : "New Case Submission";
  const submitLabel = isEditMode
    ? submitting
      ? "Saving..."
      : "Save Changes"
    : submitting
      ? "Submitting..."
      : "Submit Case";

  return (
    <main className="container">
      <DashboardHeader title={headerTitle} menu={clinicMenu} />
      {!isEditMode && (
        <section className="card" style={{ marginBottom: "1rem" }}>
          <p style={{ margin: 0, fontWeight: 600 }}>Clinician-to-clinician judgment support</p>
          <p className="auth-meta" style={{ margin: "0.5rem 0 0" }}>
            VetBridge is built for high-uncertainty decisions and second opinions when algorithms or in-clinic reads are
            ambiguous—not for routine screening alone.
          </p>
          <p className="auth-meta" style={{ margin: "0.5rem 0 0" }}>
            Konkuk alumni pilot: early cohorts may see faster turnaround while we calibrate reviewer coverage.
          </p>
        </section>
      )}
      <form className="card form-grid" onSubmit={onSubmit}>
        <Field label="Patient name" name="patientName" value={form.patientName} onChange={onChange} required />
        <Field label="Species" name="species" value={form.species} onChange={onChange} select options={["dog", "cat", "exotic", "other"]} />
        <Field label="Breed" name="breed" value={form.breed} onChange={onChange} />
        <Field label="Age" name="age" value={form.age} onChange={onChange} />
        <Field label="Sex" name="sex" value={form.sex} onChange={onChange} />
        <Field label="Weight" name="weight" value={form.weight} onChange={onChange} />
        <Field label="Presenting complaint" name="complaint" value={form.complaint} onChange={onChange} />
        <Field label="Clinical history" name="history" value={form.history} onChange={onChange} textarea />
        <Field label="Current medication" name="medication" value={form.medication} onChange={onChange} textarea />
        <div className="full">
          <label>Prior diagnostics / AI output</label>
          <div className="form-grid" style={{ gridTemplateColumns: "1fr", gap: "0.35rem", marginTop: "0.35rem" }}>
            {Object.entries(PRIOR_AI_LABELS).map(([value, label]) => (
              <label key={value} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 400 }}>
                <input
                  type="radio"
                  name="priorAiSource"
                  value={value}
                  checked={form.priorAiSource === value}
                  onChange={onChange}
                />
                {label}
              </label>
            ))}
          </div>
          <Field
            label="AI or prior impression notes (optional)"
            name="priorAiNotes"
            value={form.priorAiNotes}
            onChange={onChange}
            textarea
          />
        </div>
        <Field
          label="Primary question for reviewer (required)"
          name="primaryQuestion"
          value={form.primaryQuestion}
          onChange={onChange}
          textarea
          required
          placeholder="e.g., Should we excise vs monitor given staging ambiguity?"
        />
        <Field
          label="Requested review type"
          name="reviewType"
          value={form.reviewType}
          onChange={onChange}
          select
          options={REVIEW_TYPE_OPTIONS}
        />
        <div className="full">
          <Field label="Priority" name="priority" value={form.priority} onChange={onChange} select options={["Standard", "Urgent", "Overnight"]} />
          <small className="auth-meta" style={{ display: "block", marginTop: "0.35rem" }}>
            {PRIORITY_SLA[form.priority] || PRIORITY_SLA.Standard}
          </small>
        </div>
        <div>
          <label>{isEditMode ? "Add additional files (optional)" : "Files upload"}</label>
          <input type="file" multiple onChange={onFilesChange} />
          <small>{uploadHintForReviewType(form.reviewType)}</small>
          <small>Allowed: {ALLOWED_EXTENSIONS.join(", ")} / Max {MAX_FILE_SIZE_MB}MB each</small>
          {isEditMode && (
            <small>Existing files remain attached. Selecting new files appends them.</small>
          )}
          {files.length > 0 && <small>{files.length} file(s) selected</small>}
        </div>
        <div className="full warning-box">
          This service provides veterinary case review support and does not replace the primary veterinarian&apos;s
          clinical judgment.
        </div>
        <button className="btn primary full" type="submit" disabled={submitting || editLocked}>
          {submitLabel}
        </button>
        {uploadProgress && <p className="full auth-meta">{uploadProgress}</p>}
        {error && <p className="full auth-meta">{error}</p>}
      </form>
    </main>
  );
}

export default NewCasePage;
