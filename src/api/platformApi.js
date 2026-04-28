import * as mockApi from "./mockApi";
import { hasSupabaseConfig, supabase } from "../lib/supabaseClient";

let inMemoryCaseFiles = [];
let inMemoryAuditEvents = [];
let inMemorySubmittedReports = [];
let inMemoryReviewerApplications = [];

function shouldUseMock() {
  return !hasSupabaseConfig || !supabase;
}

async function getCurrentActor() {
  if (shouldUseMock()) return { actorId: "mock-user", actorEmail: "mock@vetbridge.local" };
  const { data } = await supabase.auth.getUser();
  return {
    actorId: data.user?.id ?? null,
    actorEmail: data.user?.email ?? null
  };
}

async function logAuditEvent({
  eventType,
  caseId = null,
  actorId = null,
  actorEmail = null,
  payload = {}
}) {
  const event = {
    event_type: eventType,
    case_id: caseId,
    actor_id: actorId,
    actor_email: actorEmail,
    payload
  };

  if (shouldUseMock()) {
    const mapped = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      eventType,
      caseId,
      actorId,
      actorEmail,
      payload,
      createdAt: new Date().toISOString()
    };
    inMemoryAuditEvents = [mapped, ...inMemoryAuditEvents].slice(0, 100);
    return mapped;
  }

  await supabase.from("audit_events").insert([event]);
  return null;
}

function normalizeCase(row) {
  return {
    id: row.id,
    title: row.title,
    patientName: row.patient_name,
    species: row.species,
    complaint: row.complaint,
    reviewType: row.review_type,
    priority: row.priority,
    status: row.status,
    clinicId: row.clinic_id,
    reviewerId: row.reviewer_id,
    submittedAt: row.submitted_at,
    report: row.report
  };
}

function toCaseInsert(payload) {
  return {
    title: payload.title,
    patient_name: payload.patientName,
    species: payload.species,
    breed: payload.breed,
    age: payload.age,
    sex: payload.sex,
    weight: payload.weight,
    complaint: payload.complaint,
    clinical_history: payload.history,
    current_medication: payload.medication,
    review_type: payload.reviewType,
    priority: payload.priority,
    status: "Submitted",
    submitted_at: new Date().toISOString().slice(0, 10)
  };
}

export async function createCase(payload) {
  if (shouldUseMock()) return mockApi.createCase(payload);

  const actor = await getCurrentActor();
  const insertPayload = {
    ...toCaseInsert(payload),
    clinic_id: actor.actorId || payload.clinicId || actor.actorEmail || "clinic-demo"
  };
  const { data, error } = await supabase.from("cases").insert([insertPayload]).select().single();
  if (error) throw error;
  await logAuditEvent({
    eventType: "case_created",
    caseId: data.id,
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    payload: { reviewType: data.review_type, priority: data.priority }
  });
  return normalizeCase(data);
}

export async function listCases() {
  if (shouldUseMock()) return mockApi.listCases();
  try {
    const { data, error } = await supabase.from("cases").select("*").order("submitted_at", { ascending: false });
    if (error) {
      return mockApi.listCases();
    }
    if (!data || data.length === 0) {
      // Fallback for pilot/dev when Supabase table is empty.
      return mockApi.listCases();
    }
    return data.map(normalizeCase);
  } catch (_error) {
    // Last-resort fallback to keep dashboard usable.
    return mockApi.listCases();
  }
}

export async function listClinicCases() {
  if (shouldUseMock()) return mockApi.listCases();
  const actor = await getCurrentActor();
  if (!actor.actorId && !actor.actorEmail) return [];

  // Primary keying: clinic_id = auth.uid()
  if (actor.actorId) {
    const { data, error } = await supabase
      .from("cases")
      .select("*")
      .eq("clinic_id", actor.actorId)
      .order("submitted_at", { ascending: false });
    if (!error && Array.isArray(data) && data.length > 0) {
      return data.map(normalizeCase);
    }
  }

  // Backward compatibility for rows saved with email-based clinic_id.
  if (actor.actorEmail) {
    const { data, error } = await supabase
      .from("cases")
      .select("*")
      .eq("clinic_id", actor.actorEmail)
      .order("submitted_at", { ascending: false });
    if (!error && Array.isArray(data)) {
      return data.map(normalizeCase);
    }
  }

  return [];
}

export async function getCase(caseId) {
  if (shouldUseMock()) return mockApi.getCase(caseId);
  const { data, error } = await supabase.from("cases").select("*").eq("id", caseId).single();
  if (error) return null;
  return normalizeCase(data);
}

export async function assignReviewer(caseId, reviewerId) {
  if (shouldUseMock()) return mockApi.assignReviewer(caseId, reviewerId);
  const actor = await getCurrentActor();
  const { data, error } = await supabase
    .from("cases")
    .update({ reviewer_id: reviewerId, status: "Under Review" })
    .eq("id", caseId)
    .select()
    .single();
  if (error) throw error;
  await logAuditEvent({
    eventType: "reviewer_assigned",
    caseId,
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    payload: { reviewerId }
  });
  return normalizeCase(data);
}

export async function submitReport(caseId, reportPayload) {
  if (shouldUseMock()) {
    const updated = await mockApi.submitReport(caseId, reportPayload);
    inMemorySubmittedReports = [
      {
        id: `report-${Date.now()}`,
        caseId,
        report: reportPayload,
        reviewerId: "mock-reviewer",
        submittedAt: new Date().toISOString()
      },
      ...inMemorySubmittedReports
    ].slice(0, 100);
    inMemoryAuditEvents = [
      {
        id: `audit-${Date.now()}`,
        eventType: "report_submitted",
        caseId,
        actorId: "mock-reviewer",
        actorEmail: "mock@vetbridge.local",
        payload: { sections: Object.keys(reportPayload || {}) },
        createdAt: new Date().toISOString()
      },
      ...inMemoryAuditEvents
    ].slice(0, 100);
    return updated;
  }

  const actor = await getCurrentActor();
  const { data, error } = await supabase
    .from("cases")
    .update({ report: reportPayload, status: "Report Ready" })
    .eq("id", caseId)
    .select()
    .single();
  if (error) throw error;

  await supabase.from("submitted_reports").insert([
    {
      case_id: caseId,
      reviewer_id: actor.actorId,
      reviewer_email: actor.actorEmail,
      report_snapshot: reportPayload
    }
  ]);
  await logAuditEvent({
    eventType: "report_submitted",
    caseId,
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    payload: { sections: Object.keys(reportPayload || {}) }
  });
  return normalizeCase(data);
}

export async function requestMoreInfo(caseId, message) {
  if (shouldUseMock()) return mockApi.requestMoreInfo(caseId, message);
  const actor = await getCurrentActor();
  const { data, error } = await supabase
    .from("cases")
    .update({ status: "Needs More Information", reviewer_message: message })
    .eq("id", caseId)
    .select()
    .single();
  if (error) throw error;
  await logAuditEvent({
    eventType: "more_info_requested",
    caseId,
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    payload: { message }
  });
  return normalizeCase(data);
}

export async function downloadReportPDF(caseId) {
  return mockApi.downloadReportPDF(caseId);
}

export async function createPilotInquiry(payload) {
  if (shouldUseMock()) return mockApi.createPilotInquiry(payload);
  const { data, error } = await supabase.from("pilot_inquiries").insert([payload]).select().single();
  if (error) throw error;
  return data;
}

export async function listReviewers() {
  if (shouldUseMock()) return mockApi.listReviewers();
  const { data, error } = await supabase.from("reviewers").select("*");
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    specialty: row.specialty,
    institution: row.institution,
    languages: row.languages || [],
    availability: row.availability,
    reviewCount: row.review_count ?? 0,
    avgTurnaround: row.avg_turnaround ?? "-"
  }));
}

export async function listClinics() {
  if (shouldUseMock()) return mockApi.listClinics();
  const { data, error } = await supabase.from("clinics").select("*");
  if (error) throw error;
  return data;
}

export async function uploadCaseFiles(caseId, files, options = {}) {
  if (!files?.length) return [];
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;

  if (shouldUseMock()) {
    const mapped = files.map((file) => ({
      id: `mock-file-${Date.now()}-${file.name}`,
      caseId,
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
      fileSize: file.size || 0,
      publicUrl: "#",
      createdAt: new Date().toISOString()
    }));
    if (onProgress) onProgress({ uploaded: files.length, total: files.length, percent: 100 });
    inMemoryCaseFiles = [...mapped, ...inMemoryCaseFiles];
    return mapped;
  }

  const uploaded = [];
  let clinicFolder = "clinic-unassigned";
  const { data: caseRow } = await supabase.from("cases").select("clinic_id").eq("id", caseId).single();
  if (caseRow?.clinic_id) clinicFolder = String(caseRow.clinic_id).replaceAll(" ", "_");
  const actor = await getCurrentActor();

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const safeName = file.name.replaceAll(" ", "_");
    const storagePath = `${clinicFolder}/${caseId}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from("case-files").upload(storagePath, file, {
      upsert: false
    });
    if (uploadError) throw uploadError;

    const { data: publicData } = supabase.storage.from("case-files").getPublicUrl(storagePath);
    uploaded.push({
      case_id: caseId,
      file_name: file.name,
      file_type: file.type || "application/octet-stream",
      file_size: file.size || 0,
      storage_path: storagePath,
      public_url: publicData.publicUrl
    });
    if (onProgress) {
      const uploadedCount = index + 1;
      const percent = Math.round((uploadedCount / files.length) * 100);
      onProgress({ uploaded: uploadedCount, total: files.length, percent });
    }
  }

  const { data, error } = await supabase.from("case_files").insert(uploaded).select("*");
  if (error) throw error;
  await logAuditEvent({
    eventType: "case_files_uploaded",
    caseId,
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    payload: { count: uploaded.length }
  });
  return data.map((row) => ({
    id: row.id,
    caseId: row.case_id,
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: row.file_size,
    publicUrl: row.public_url,
    createdAt: row.created_at
  }));
}

export async function listCaseFiles(caseId) {
  if (shouldUseMock()) return inMemoryCaseFiles.filter((file) => file.caseId === caseId);

  const { data, error } = await supabase
    .from("case_files")
    .select("*")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    caseId: row.case_id,
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: row.file_size,
    publicUrl: row.public_url,
    createdAt: row.created_at
  }));
}

export async function listAuditEvents(limit = 30) {
  if (shouldUseMock()) return inMemoryAuditEvents.slice(0, limit);
  const { data, error } = await supabase
    .from("audit_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    eventType: row.event_type,
    caseId: row.case_id,
    actorId: row.actor_id,
    actorEmail: row.actor_email,
    payload: row.payload || {},
    createdAt: row.created_at
  }));
}

export async function listSubmittedReports(limit = 20) {
  if (shouldUseMock()) return inMemorySubmittedReports.slice(0, limit);
  const { data, error } = await supabase
    .from("submitted_reports")
    .select("*")
    .order("submitted_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    caseId: row.case_id,
    reviewerId: row.reviewer_id,
    reviewerEmail: row.reviewer_email,
    report: row.report_snapshot,
    submittedAt: row.submitted_at
  }));
}

export async function createReviewerApplication(payload) {
  const actor = await getCurrentActor();
  const base = {
    name: payload.name || "",
    email: payload.email || "",
    phone: payload.phone || "",
    institution: payload.institution || "",
    specialty: payload.specialty || "",
    message: payload.message || "",
    actor_id: actor.actorId,
    actor_email: actor.actorEmail
  };

  if (shouldUseMock()) {
    const created = {
      id: `reviewer-app-${Date.now()}`,
      ...base,
      createdAt: new Date().toISOString()
    };
    inMemoryReviewerApplications = [created, ...inMemoryReviewerApplications].slice(0, 100);
    return created;
  }

  const { data, error } = await supabase.from("reviewer_applications").insert([base]).select().single();
  if (error) throw error;
  return data;
}
