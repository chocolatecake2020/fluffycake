import { useEffect, useState } from "react";
import { listCases, listReviewers } from "../api/platformApi";
import DashboardHeader from "../components/common/DashboardHeader";
import { reviewerMenu } from "../constants/menus";
import AssignedCaseTable from "../features/reviewers/components/AssignedCaseTable";
import ReviewerProfileCard from "../features/reviewers/components/ReviewerProfileCard";

function ReviewerDashboard() {
  const [caseList, setCaseList] = useState([]);
  const [reviewerList, setReviewerList] = useState([]);

  useEffect(() => {
    listCases().then(setCaseList);
    listReviewers().then(setReviewerList);
  }, []);

  return (
    <main className="container">
      <DashboardHeader title="Reviewer Dashboard" menu={reviewerMenu} />
      <section className="card">
        <h3>Assigned Cases</h3>
        <AssignedCaseTable items={caseList} />
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
