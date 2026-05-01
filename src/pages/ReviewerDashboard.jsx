import { useEffect, useState } from "react";
import { listCases, listReviewers } from "../api/platformApi";
import DashboardHeader from "../components/common/DashboardHeader";
import { reviewerMenu } from "../constants/menus";
import { useAuth } from "../context/AuthContext";
import AssignedCaseTable from "../features/reviewers/components/AssignedCaseTable";
import PayoutSettingsCard from "../features/reviewers/components/PayoutSettingsCard";
import ReviewerProfileCard from "../features/reviewers/components/ReviewerProfileCard";

function ReviewerDashboard() {
  const { loading, user } = useAuth();
  const [caseList, setCaseList] = useState([]);
  const [reviewerList, setReviewerList] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setCaseList([]);
      setReviewerList([]);
      setError("");
      return;
    }
    let cancelled = false;
    const loadData = async () => {
      let lastResult = [];
      let lastError = "";
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const cases = await listCases();
          lastResult = cases;
          lastError = "";
          if (cases.length > 0) break;
        } catch (loadError) {
          lastError = loadError?.message || "Failed to load cases.";
        }
        await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
      }
      if (cancelled) return;
      setCaseList(lastResult);
      setError(lastError);

      try {
        const reviewers = await listReviewers();
        if (!cancelled) setReviewerList(reviewers);
      } catch (_reviewerError) {
        if (!cancelled) setReviewerList([]);
      }
    };

    loadData();
    return () => {
      cancelled = true;
    };
  }, [loading, user?.id]);

  return (
    <main className="container">
      <DashboardHeader title="Reviewer Dashboard" menu={reviewerMenu} />
      <PayoutSettingsCard />
      <section className="card">
        <h3>Cases</h3>
        {error && <p className="auth-meta">{error}</p>}
        <AssignedCaseTable items={caseList} currentUserId={user?.id} />
      </section>
      <section className="grid two">
        {reviewerList.map((reviewer) => (
          <ReviewerProfileCard key={reviewer.id} reviewer={reviewer} />
        ))}
      </section>
    </main>
  );
}

export default ReviewerDashboard;
