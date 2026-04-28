import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listClinicCases } from "../api/platformApi";
import DashboardHeader from "../components/common/DashboardHeader";
import { clinicMenu } from "../constants/menus";
import CaseTable from "../features/cases/components/CaseTable";

function ClinicDashboard() {
  const [data, setData] = useState([]);

  useEffect(() => {
    listClinicCases()
      .then(setData)
      .catch(() => setData([]));
  }, []);

  return (
    <main className="container">
      <DashboardHeader title="Clinic Dashboard" menu={clinicMenu} />
      <section className="card">
        <div className="row between">
          <h3>My Cases</h3>
          <Link className="btn primary" to="/clinic/new-case">
            Create New Case
          </Link>
        </div>
        <CaseTable items={data} />
      </section>
    </main>
  );
}

export default ClinicDashboard;
