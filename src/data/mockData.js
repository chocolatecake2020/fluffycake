export const clinics = [
  { id: "cl-1", name: "Crescenta Valley Veterinary Hospital", country: "USA", activeCases: 4 },
  { id: "cl-2", name: "Animal Medical Center, Valencia", country: "Spain", activeCases: 3 },
  { id: "cl-3", name: "OSO Pet Care Center", country: "Philippines", activeCases: 2 },
  { id: "cl-4", name: "Seoul Pilot Animal Clinic", country: "Korea", activeCases: 5 },
  { id: "cl-5", name: "Bangkok Companion Animal Clinic", country: "Thailand", activeCases: 4 }
];

export const reviewers = [
  {
    id: "rv-1",
    name: "Dr. J. Kim",
    specialty: "Radiology Reviewer",
    institution: "Seoul Clinical Imaging Center",
    languages: ["Korean", "English"],
    availability: "Available",
    reviewCount: 84,
    avgTurnaround: "16h"
  },
  {
    id: "rv-2",
    name: "Dr. H. Lee",
    specialty: "Internal Medicine Reviewer",
    institution: "Korea Veterinary Internal Unit",
    languages: ["Korean", "English"],
    availability: "Busy",
    reviewCount: 67,
    avgTurnaround: "19h"
  },
  {
    id: "rv-3",
    name: "Dr. S. Park",
    specialty: "Dermatology Reviewer",
    institution: "K-Vet Skin Referral Group",
    languages: ["Korean", "English"],
    availability: "Available",
    reviewCount: 49,
    avgTurnaround: "21h"
  },
  {
    id: "rv-4",
    name: "Dr. M. Choi",
    specialty: "Surgery Reviewer",
    institution: "Advanced Small Animal Surgery Unit",
    languages: ["Korean", "English", "Japanese"],
    availability: "Limited",
    reviewCount: 73,
    avgTurnaround: "18h"
  }
];

export const caseStatuses = [
  "Draft",
  "Submitted",
  "Under Review",
  "Report Ready",
  "Completed",
  "Needs More Information"
];

export const cases = [
  {
    id: "cs-1001",
    title: "Thoracic radiograph review",
    patientName: "Milo",
    species: "dog",
    complaint: "Chronic cough",
    reviewType: "Radiology review",
    priority: "Standard",
    status: "Under Review",
    clinicId: "cl-1",
    reviewerId: "rv-1",
    submittedAt: "2026-04-20"
  },
  {
    id: "cs-1002",
    title: "Abdominal ultrasound consult",
    patientName: "Nabi",
    species: "cat",
    complaint: "Vomiting",
    reviewType: "Ultrasound review",
    priority: "Urgent",
    status: "Submitted",
    clinicId: "cl-2",
    reviewerId: "rv-2",
    submittedAt: "2026-04-22"
  },
  {
    id: "cs-1003",
    title: "Dermatology photo consult",
    patientName: "Bori",
    species: "dog",
    complaint: "Chronic skin lesion",
    reviewType: "Dermatology consult",
    priority: "Standard",
    status: "Needs More Information",
    clinicId: "cl-3",
    reviewerId: "rv-3",
    submittedAt: "2026-04-23"
  },
  {
    id: "cs-1004",
    title: "Orthopedic second opinion",
    patientName: "Hodu",
    species: "dog",
    complaint: "Hindlimb lameness",
    reviewType: "Surgery second opinion",
    priority: "Overnight",
    status: "Report Ready",
    clinicId: "cl-4",
    reviewerId: "rv-4",
    submittedAt: "2026-04-24"
  },
  {
    id: "cs-1005",
    title: "Emergency triage support",
    patientName: "Coco",
    species: "cat",
    complaint: "Respiratory distress",
    reviewType: "Emergency triage support",
    priority: "Urgent",
    status: "Completed",
    clinicId: "cl-5",
    reviewerId: "rv-2",
    submittedAt: "2026-04-25"
  }
];

export const reportTemplate = {
  caseSummary: "",
  findings: "",
  interpretation: "",
  differential: "",
  recommendations: "",
  limitations: "This report is intended as consultative support.",
  reviewerSignature: ""
};
