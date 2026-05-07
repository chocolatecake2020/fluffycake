import { Link } from "react-router-dom";
import StatusBadge from "../../../components/common/StatusBadge";

function ActionCell({ item, currentUserId }) {
  const status = item.status;
  const isAuthor = currentUserId && item.reviewerId && String(item.reviewerId) === String(currentUserId);

  if (status === "Submitted") {
    return <Link to={`/reviewer/report/${item.id}`}>Write Report</Link>;
  }

  if (status === "Report Ready") {
    if (isAuthor) {
      return (
        <Link to={`/cases/${item.id}`}>
          View / Edit
        </Link>
      );
    }
    return <Link to={`/cases/${item.id}`}>View Case</Link>;
  }

  // For other statuses (Under Review, Completed, Needs More Information, Draft, etc.)
  // a plain detail view is the safest default.
  return <Link to={`/cases/${item.id}`}>Open</Link>;
}

function AssignedCaseTable({ items, currentUserId }) {
  return (
    <div className="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Case ID</th>
          <th>Case</th>
          <th>Status</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td>{item.id}</td>
            <td>{item.title}</td>
            <td>
              <StatusBadge status={item.status} />
            </td>
            <td>
              <ActionCell item={item} currentUserId={currentUserId} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

export default AssignedCaseTable;
