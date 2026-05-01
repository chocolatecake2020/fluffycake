import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createCase, getCase, updateCase, uploadCaseFiles } from "../api/platformApi";
import DashboardHeader from "../components/common/DashboardHeader";
import Field from "../components/common/Field";
import { clinicMenu } from "../constants/menus";
import { useAuth } from "../context/AuthContext";

const MAX_FILE_SIZE_MB = 25;
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
    reviewType: "Radiology review",
    priority: "Standard",
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
          history: existing.history ?? "",
          medication: existing.medication ?? "",
          reviewType: existing.reviewType ?? prev.reviewType,
          priority: existing.priority ?? prev.priority
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
    setSubmitting(true);
    setError("");
    setUploadProgress(isEditMode ? "Updating case record..." : "Creating case record...");
    try {
      let resolvedCaseId = caseId;
      if (isEditMode) {
        const updated = await withTimeout(
          updateCase(caseId, form),
          15000,
          "Case update timed out. Please retry in a few seconds."
        );
        resolvedCaseId = updated?.id || caseId;
      } else {
        const clinicId =
          user?.id || profile?.id || user?.email || profile?.email || "clinic-local";
        const created = await withTimeout(
          createCase({ ...form, clinicId }),
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
        <Field
          label="Requested review type"
          name="reviewType"
          value={form.reviewType}
          onChange={onChange}
          select
          options={[
            "Radiology review",
            "Ultrasound review",
            "Dermatology consult",
            "Internal medicine consult",
            "Surgery second opinion",
            "Emergency triage support"
          ]}
        />
        <Field label="Priority" name="priority" value={form.priority} onChange={onChange} select options={["Standard", "Urgent", "Overnight"]} />
        <div>
          <label>{isEditMode ? "Add additional files (optional)" : "Files upload"}</label>
          <input type="file" multiple onChange={onFilesChange} />
          <small>X-ray, Ultrasound, CT/MRI, Photos, Lab results, Referral note</small>
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
