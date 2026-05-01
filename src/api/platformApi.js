import * as mockApi from "./mockApi";
import { enqueuePayoutForReportSubmission } from "./paymentsApi";
import { hasSupabaseConfig, supabase, supabaseAnonKey, supabaseUrl } from "../lib/supabaseClient";

let inMemoryCaseFiles = [];
let inMemoryAuditEvents = [];
let inMemorySubmittedReports = [];
let inMemoryReviewerApplications = [];

function shouldUseMock() {
  return !hasSupabaseConfig || !supabase;
}

const SUPABASE_AUTH_STORAGE_KEY = "vetbridge-auth-token";

function readStoredAuthBlob() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SUPABASE_AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

function readStoredAccessToken() {
  const blob = readStoredAuthBlob();
  return blob?.access_token || blob?.currentSession?.access_token || null;
}

function readStoredAuthUser() {
  const blob = readStoredAuthBlob();
  return blob?.user || blob?.currentSession?.user || null;
}

async function getCurrentActor() {
  if (shouldUseMock()) return { actorId: "mock-user", actorEmail: "mock@vetbridge.local" };
  const storedUser = readStoredAuthUser();
  if (storedUser?.id) {
    return { actorId: storedUser.id, actorEmail: storedUser.email ?? null };
  }
  // Fallback: ask supabase client (may be slower/locked).
  try {
    const { data } = await supabase.auth.getSession();
    const sessionUser = data?.session?.user || null;
    return {
      actorId: sessionUser?.id ?? null,
      actorEmail: sessionUser?.email ?? null
    };
  } catch (_error) {
    return { actorId: null, actorEmail: null };
  }
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

  try {
    await restInsert("audit_events", [event], { returning: "minimal" });
  } catch (_error) {
    // Audit log must never block the main flow.
  }
  return null;
}

function normalizeCase(row) {
  return {
    id: row.id,
    title: row.title,
    patientName: row.patient_name,
    species: row.species,
    breed: row.breed,
    age: row.age,
    sex: row.sex,
    weight: row.weight,
    complaint: row.complaint,
    history: row.clinical_history,
    medication: row.current_medication,
    reviewType: row.review_type,
    priority: row.priority,
    status: row.status,
    clinicId: row.clinic_id,
    reviewerId: row.reviewer_id,
    submittedAt: row.submitted_at,
    report: row.report
  };
}

function toRestQueryValue(value) {
  return encodeURIComponent(String(value ?? ""));
}

async function restInsert(table, rows, { returning = "minimal" } = {}) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase REST endpoint is not configured.");
  }
  const accessToken = readStoredAccessToken();
  if (!accessToken) throw new Error("Local session is missing. Please sign in again.");
  const endpoint = `${supabaseUrl}/rest/v1/${table}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      Prefer: returning === "representation" ? "return=representation" : "return=minimal"
    },
    body: JSON.stringify(rows)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Insert into ${table} failed (${response.status}): ${detail || "unknown error"}`);
  }
  if (returning === "representation") {
    const data = await response.json();
    return Array.isArray(data) ? data : [data];
  }
  return [];
}

async function restUpdate(table, patch, { match }) {
  if (!supabaseUrl || !supabaseAnonKey || !match) {
    throw new Error("Supabase REST update misconfigured.");
  }
  const accessToken = readStoredAccessToken();
  if (!accessToken) throw new Error("Local session is missing. Please sign in again.");
  const params = Object.entries(match).map(
    ([column, value]) => `${column}=eq.${toRestQueryValue(value)}`
  );
  const endpoint = `${supabaseUrl}/rest/v1/${table}?${params.join("&")}`;
  const response = await fetch(endpoint, {
    method: "PATCH",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(patch)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Update on ${table} failed (${response.status}): ${detail || "unknown error"}`);
  }
  const data = await response.json();
  return Array.isArray(data) ? data : [data];
}

async function restDelete(table, { match }) {
  if (!supabaseUrl || !supabaseAnonKey || !match) {
    throw new Error("Supabase REST delete misconfigured.");
  }
  const accessToken = readStoredAccessToken();
  if (!accessToken) throw new Error("Local session is missing. Please sign in again.");
  const params = Object.entries(match).map(
    ([column, value]) => `${column}=eq.${toRestQueryValue(value)}`
  );
  const endpoint = `${supabaseUrl}/rest/v1/${table}?${params.join("&")}`;
  const response = await fetch(endpoint, {
    method: "DELETE",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      Prefer: "return=minimal"
    }
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Delete on ${table} failed (${response.status}): ${detail || "unknown error"}`);
  }
}

async function listCasesByClinicIdWithSessionToken(clinicId, accessToken) {
  if (!supabaseUrl || !supabaseAnonKey || !clinicId || !accessToken) return [];
  const endpoint = `${supabaseUrl}/rest/v1/cases?select=*&clinic_id=eq.${toRestQueryValue(clinicId)}&order=submitted_at.desc`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Case query failed (${response.status}): ${detail || "unknown error"}`);
  }
  const rows = await response.json();
  return Array.isArray(rows) ? rows.map(normalizeCase) : [];
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
  const resolvedClinicId = payload.clinicId || actor.actorId || actor.actorEmail;
  if (!resolvedClinicId) {
    throw new Error("Authenticated clinic identity is unavailable. Please sign in again.");
  }
  const insertPayload = {
    ...toCaseInsert(payload),
    clinic_id: resolvedClinicId
  };
  const inserted = await restInsert("cases", [insertPayload], { returning: "representation" });
  const data = Array.isArray(inserted) ? inserted[0] : inserted;
  if (!data) throw new Error("Case insert returned no row.");
  await logAuditEvent({
    eventType: "case_created",
    caseId: data.id,
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    payload: { reviewType: data.review_type, priority: data.priority }
  });
  return normalizeCase(data);
}

// Build a column patch from form payload, dropping undefined values so we never
// overwrite columns the caller did not intend to change.
function toCaseUpdate(payload = {}) {
  const mapping = {
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
    priority: payload.priority
  };
  return Object.fromEntries(
    Object.entries(mapping).filter(([, value]) => value !== undefined)
  );
}

export async function updateCase(caseId, payload) {
  if (!caseId) throw new Error("Case id is required.");
  if (shouldUseMock()) return mockApi.updateCase ? mockApi.updateCase(caseId, payload) : null;

  const actor = await getCurrentActor();
  const patch = toCaseUpdate(payload);
  if (!Object.keys(patch).length) {
    throw new Error("No editable fields were provided.");
  }
  const updated = await restUpdate("cases", patch, { match: { id: caseId } });
  const data = Array.isArray(updated) ? updated[0] : updated;
  if (!data) throw new Error("Case update returned no row. The case may no longer exist.");
  await logAuditEvent({
    eventType: "case_updated",
    caseId: data.id,
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    payload: { fieldsChanged: Object.keys(patch) }
  });
  return normalizeCase(data);
}

export async function deleteCase(caseId) {
  if (!caseId) throw new Error("Case id is required.");
  if (shouldUseMock()) return mockApi.deleteCase ? mockApi.deleteCase(caseId) : null;

  const actor = await getCurrentActor();
  // Audit before delete so the row id is still resolvable in logs.
  await logAuditEvent({
    eventType: "case_deleted",
    caseId,
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    payload: {}
  });
  await restDelete("cases", { match: { id: caseId } });
  return { id: caseId, deleted: true };
}

async function listCasesViaRest({ filterColumn, filterValue } = {}) {
  if (!supabaseUrl || !supabaseAnonKey) return [];
  const accessToken = readStoredAccessToken();
  if (!accessToken) throw new Error("Local session is missing. Please sign in again.");
  const params = ["select=*", "order=submitted_at.desc"];
  if (filterColumn && filterValue) {
    params.push(`${filterColumn}=eq.${toRestQueryValue(filterValue)}`);
  }
  const endpoint = `${supabaseUrl}/rest/v1/cases?${params.join("&")}`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Case query failed (${response.status}): ${detail || "unknown error"}`);
  }
  const rows = await response.json();
  return Array.isArray(rows) ? rows.map(normalizeCase) : [];
}

export async function listCases() {
  if (shouldUseMock()) return mockApi.listCases();
  return listCasesViaRest();
}

export async function listReviewerCases(identity = {}) {
  if (shouldUseMock()) return mockApi.listCases();
  const storedUser = readStoredAuthUser();
  const reviewerId = identity.reviewerId || storedUser?.id || null;
  if (!reviewerId) return [];
  return listCasesViaRest({ filterColumn: "reviewer_id", filterValue: reviewerId });
}

async function countCasesByClinicIdWithToken(clinicId, accessToken) {
  if (!supabaseUrl || !supabaseAnonKey || !clinicId || !accessToken) return null;
  const endpoint = `${supabaseUrl}/rest/v1/cases?select=id&clinic_id=eq.${toRestQueryValue(clinicId)}`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      Prefer: "count=exact"
    }
  });
  if (!response.ok) {
    throw new Error(`Case count failed (${response.status})`);
  }
  const contentRange = response.headers.get("content-range") || "";
  const total = contentRange.includes("/") ? Number(contentRange.split("/").pop()) : null;
  if (Number.isFinite(total)) return total;
  const rows = await response.json();
  return Array.isArray(rows) ? rows.length : 0;
}

export async function listClinicCases(identity = {}) {
  if (shouldUseMock()) return mockApi.listCases();
  const accessToken = readStoredAccessToken();
  const storedUser = readStoredAuthUser();
  if (!accessToken) throw new Error("Local session is missing. Please sign in again.");

  const requestedClinicId = identity.clinicId || null;
  const requestedClinicEmail = identity.clinicEmail || null;
  const clinicId = requestedClinicId || storedUser?.id || null;
  const clinicEmail = requestedClinicEmail || storedUser?.email || null;
  if (!clinicId && !clinicEmail) return [];

  if (clinicId) {
    const byId = await listCasesByClinicIdWithSessionToken(clinicId, accessToken);
    if (byId.length > 0) return byId;
  }

  if (clinicEmail) {
    return listCasesByClinicIdWithSessionToken(clinicEmail, accessToken);
  }

  return [];
}

export async function debugClinicCaseAccess(identity = {}) {
  if (shouldUseMock()) {
    return {
      mode: "mock",
      hasSupabaseConfig,
      clinicId: identity.clinicId || null,
      clinicEmail: identity.clinicEmail || null,
      sessionUserId: null,
      sessionUserEmail: null,
      idMatchCount: null,
      emailMatchCount: null,
      visibleCaseCount: null
    };
  }

  const accessToken = readStoredAccessToken();
  const storedUser = readStoredAuthUser();
  const clinicId = identity.clinicId || storedUser?.id || null;
  const clinicEmail = identity.clinicEmail || storedUser?.email || null;

  let idMatchCount = null;
  let emailMatchCount = null;
  let visibleCaseCount = null;

  if (clinicId) {
    idMatchCount = await countCasesByClinicIdWithToken(clinicId, accessToken);
  }
  if (clinicEmail) {
    emailMatchCount = await countCasesByClinicIdWithToken(clinicEmail, accessToken);
  }

  if (accessToken && supabaseUrl && supabaseAnonKey) {
    const allEndpoint = `${supabaseUrl}/rest/v1/cases?select=id`;
    const response = await fetch(allEndpoint, {
      method: "GET",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        Prefer: "count=exact"
      }
    });
    if (response.ok) {
      const contentRange = response.headers.get("content-range") || "";
      const total = contentRange.includes("/") ? Number(contentRange.split("/").pop()) : null;
      if (Number.isFinite(total)) {
        visibleCaseCount = total;
      } else {
        const rows = await response.json();
        visibleCaseCount = Array.isArray(rows) ? rows.length : 0;
      }
    }
  }

  return {
    mode: "supabase-rest",
    hasSupabaseConfig,
    clinicId,
    clinicEmail,
    sessionUserId: storedUser?.id || null,
    sessionUserEmail: storedUser?.email || null,
    idMatchCount,
    emailMatchCount,
    visibleCaseCount
  };
}

export async function getCase(caseId) {
  if (shouldUseMock()) return mockApi.getCase(caseId);
  if (!caseId) return null;

  // Primary: direct id filter via REST.
  try {
    const rows = await listCasesViaRest({ filterColumn: "id", filterValue: caseId });
    if (rows.length) return rows[0];
  } catch (_primaryError) {
    // Swallow and try fallback below.
  }

  // Fallback: pull the case list this session is allowed to see and pick by id.
  // Helps when a single-row id query is blocked or returns empty due to RLS edge cases.
  try {
    const all = await listCasesViaRest();
    const match = Array.isArray(all) ? all.find((c) => c.id === caseId) : null;
    if (match) return match;
  } catch (_fallbackError) {
    // Final fallthrough: signal not found instead of throwing.
  }

  return null;
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
  const casePatch = {
    report: reportPayload,
    status: "Report Ready"
  };
  // Auto-claim the case for the reviewer that actually submitted the report,
  // so the clinic-side P2P flow can display the reviewer's PayPal email.
  if (actor?.actorId) {
    casePatch.reviewer_id = actor.actorId;
  }
  const updatedRows = await restUpdate(
    "cases",
    casePatch,
    { match: { id: caseId } }
  );
  const data = Array.isArray(updatedRows) ? updatedRows[0] : updatedRows;
  if (!data) throw new Error("Failed to update case with submitted report.");

  await restInsert(
    "submitted_reports",
    [
      {
        case_id: caseId,
        reviewer_id: actor.actorId,
        reviewer_email: actor.actorEmail,
        report_snapshot: reportPayload
      }
    ],
    { returning: "minimal" }
  );
  await logAuditEvent({
    eventType: "report_submitted",
    caseId,
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    payload: { sections: Object.keys(reportPayload || {}) }
  });

  try {
    await enqueuePayoutForReportSubmission({
      caseId,
      reviewerId: actor.actorId,
      reviewerEmail: actor.actorEmail
    });
  } catch (_payoutError) {
    // Payout enqueue should never block report submission flow.
  }

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

export async function updateMyUserProfile(userId, patch) {
  if (!userId) throw new Error("userId is required.");
  if (!patch || !Object.keys(patch).length) {
    throw new Error("Profile patch payload is empty.");
  }
  if (shouldUseMock()) return null;
  const rows = await restUpdate("user_profiles", patch, { match: { id: userId } });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export async function getUserProfileById(userId) {
  if (!userId) return null;
  if (shouldUseMock()) return null;
  if (!supabaseUrl || !supabaseAnonKey) return null;
  const accessToken = readStoredAccessToken();
  if (!accessToken) return null;
  // Use select=* so missing optional columns (full_name / phone / institution) do not
  // cause the request to fail with 400, which would silently return null and break
  // the payment panel reviewer lookup.
  const endpoint = `${supabaseUrl}/rest/v1/user_profiles?select=*&id=eq.${toRestQueryValue(
    userId
  )}&limit=1`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  });
  if (!response.ok) return null;
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows.length) return null;
  return rows[0];
}

export async function listCaseFiles(caseId) {
  if (shouldUseMock()) return inMemoryCaseFiles.filter((file) => file.caseId === caseId);
  if (!caseId) return [];
  if (!supabaseUrl || !supabaseAnonKey) return [];
  const accessToken = readStoredAccessToken();
  if (!accessToken) return [];
  const endpoint = `${supabaseUrl}/rest/v1/case_files?select=*&case_id=eq.${toRestQueryValue(
    caseId
  )}&order=created_at.desc`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  });
  if (!response.ok) return [];
  const rows = await response.json();
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
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
