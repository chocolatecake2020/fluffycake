import { Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import TopBar from "./components/layout/TopBar";
import AdminDashboard from "./pages/AdminDashboard";
import CaseDetailPage from "./pages/CaseDetailPage";
import ClinicDashboard from "./pages/ClinicDashboard";
import KoreanRecruitmentPage from "./pages/KoreanRecruitmentPage";
import LandingPage from "./pages/LandingPage";
import NewCasePage from "./pages/NewCasePage";
import PaymentSettlementPage from "./pages/PaymentSettlementPage";
import PilotInquiryPage from "./pages/PilotInquiryPage";
import PricingPage from "./pages/PricingPage";
import ReportEditorPage from "./pages/ReportEditorPage";
import ReviewerDashboard from "./pages/ReviewerDashboard";
import RoleSelectionPage from "./pages/RoleSelectionPage";
import SampleReportPage from "./pages/SampleReportPage";
import USAdvisoryPage from "./pages/USAdvisoryPage";

function App() {
  return (
    <div className="app-shell">
      <TopBar />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<RoleSelectionPage />} />
        <Route
          path="/clinic"
          element={
            <ProtectedRoute requiredRole="clinic">
              <ClinicDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/clinic/new-case"
          element={
            <ProtectedRoute requiredRole="clinic">
              <NewCasePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/clinic/cases/:caseId/edit"
          element={
            <ProtectedRoute requiredRole="clinic">
              <NewCasePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cases/:caseId"
          element={
            <ProtectedRoute>
              <CaseDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reviewer"
          element={
            <ProtectedRoute requiredRole="reviewer">
              <ReviewerDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reviewer/report/:caseId"
          element={
            <ProtectedRoute requiredRole="reviewer">
              <ReportEditorPage />
            </ProtectedRoute>
          }
        />
        <Route path="/sample-report" element={<SampleReportPage />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute requiredRole="admin">
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route path="/pilot-inquiry" element={<PilotInquiryPage />} />
        <Route path="/reviewer-recruitment" element={<KoreanRecruitmentPage />} />
        <Route path="/us-advisory" element={<USAdvisoryPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/payments" element={<PaymentSettlementPage />} />
      </Routes>
    </div>
  );
}

export default App;
