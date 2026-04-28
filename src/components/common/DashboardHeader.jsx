import { caseStatuses } from "../../data/mockData";
import StatusBadge from "./StatusBadge";

function DashboardHeader({ title, menu }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      <div className="menu-row">
        {menu.map((item) => (
          <span className="menu-pill" key={item}>
            {item}
          </span>
        ))}
      </div>
      <div className="menu-row">
        {caseStatuses.map((status) => (
          <StatusBadge status={status} key={status} />
        ))}
      </div>
    </section>
  );
}

export default DashboardHeader;
