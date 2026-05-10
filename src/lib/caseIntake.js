// Shared helpers for the structured intake block that NewCasePage stores
// inside the case `history` field. CaseDetailPage uses the same helpers so
// the values clinics typed in the form (Prior diagnostics / AI notes /
// Primary question) can be displayed back to them after submission without
// changing the database schema.

export const PRIOR_AI_LABELS = {
  none: "None",
  in_clinic: "In-clinic AI",
  third_party: "Third-party AI",
  unsure: "Not sure"
};

export function mergeIntakeIntoHistory({
  baseHistory,
  priorAiSource,
  priorAiNotes,
  primaryQuestion
}) {
  const priorLabel = PRIOR_AI_LABELS[priorAiSource] || PRIOR_AI_LABELS.none;
  const notes = (priorAiNotes || "").trim();
  const pq = (primaryQuestion || "").trim();
  return `[Intake]\nPrior diagnostics/AI: ${priorLabel}\nAI/impression notes:\n${notes}\n\nPrimary question for reviewer:\n${pq}\n\n[Clinical history]\n${(baseHistory || "").trim()}`;
}

export function extractIntakeFromHistory(full) {
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
