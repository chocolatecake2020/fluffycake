import { cases, clinics, reportTemplate, reviewers } from "../data/mockData";

const wait = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

let inMemoryCases = [...cases];

function ensureSeedCases() {
  if (!Array.isArray(inMemoryCases) || inMemoryCases.length === 0) {
    inMemoryCases = [...cases];
  }
}

export async function createCase(payload) {
  await wait();
  ensureSeedCases();
  const nextCase = {
    id: `cs-${1000 + inMemoryCases.length + 1}`,
    status: "Submitted",
    submittedAt: new Date().toISOString().slice(0, 10),
    ...payload
  };
  inMemoryCases = [nextCase, ...inMemoryCases];
  return nextCase;
}

export async function listCases() {
  await wait();
  ensureSeedCases();
  return inMemoryCases;
}

export async function getCase(caseId) {
  await wait();
  ensureSeedCases();
  return inMemoryCases.find((c) => c.id === caseId) ?? null;
}

export async function assignReviewer(caseId, reviewerId) {
  await wait();
  ensureSeedCases();
  inMemoryCases = inMemoryCases.map((c) =>
    c.id === caseId ? { ...c, reviewerId, status: "Under Review" } : c
  );
  return inMemoryCases.find((c) => c.id === caseId);
}

export async function updateCase(caseId, payload = {}) {
  await wait();
  ensureSeedCases();
  inMemoryCases = inMemoryCases.map((c) =>
    c.id === caseId ? { ...c, ...payload } : c
  );
  return inMemoryCases.find((c) => c.id === caseId);
}

export async function deleteCase(caseId) {
  await wait();
  ensureSeedCases();
  inMemoryCases = inMemoryCases.filter((c) => c.id !== caseId);
  return { id: caseId, deleted: true };
}

export async function submitReport(caseId, reportPayload = reportTemplate) {
  await wait();
  ensureSeedCases();
  inMemoryCases = inMemoryCases.map((c) =>
    c.id === caseId ? { ...c, status: "Report Ready", report: reportPayload } : c
  );
  return inMemoryCases.find((c) => c.id === caseId);
}

export async function deleteReport(caseId) {
  await wait();
  ensureSeedCases();
  inMemoryCases = inMemoryCases.map((c) =>
    c.id === caseId ? { ...c, status: "Submitted", report: null } : c
  );
  return { caseId, deleted: true };
}

export async function requestMoreInfo(caseId, message) {
  await wait();
  ensureSeedCases();
  inMemoryCases = inMemoryCases.map((c) =>
    c.id === caseId ? { ...c, status: "Needs More Information", reviewerMessage: message } : c
  );
  return inMemoryCases.find((c) => c.id === caseId);
}

export async function downloadReportPDF(caseId) {
  await wait();
  ensureSeedCases();
  const item = inMemoryCases.find((c) => c.id === caseId);
  if (!item) return { caseId, url: null };
  const report = item.report || {};
  const text = [
    "VetBridge Clinical Review Report",
    "================================",
    `Case ID: ${item.id}`,
    `Title: ${item.title || "-"}`,
    `Patient: ${item.patientName || "-"} (${item.species || "-"})`,
    "",
    "Case Summary",
    report.caseSummary || "-",
    "",
    "Findings",
    report.findings || "-",
    "",
    "Interpretation",
    report.interpretation || "-",
    "",
    "Recommendations",
    report.recommendations || "-",
    "",
    "Reviewer Signature",
    report.reviewerSignature || "-"
  ].join("\n");
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  return { caseId, url: URL.createObjectURL(blob) };
}

export async function createPilotInquiry(payload) {
  await wait();
  return { id: `inquiry-${Date.now()}`, ...payload };
}

export async function listReviewers() {
  await wait();
  return reviewers;
}

export async function listClinics() {
  await wait();
  return clinics;
}
