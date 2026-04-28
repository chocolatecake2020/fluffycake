import { Link } from "react-router-dom";
import StatusBadge from "../../../components/common/StatusBadge";

function AssignedCaseTable({ items }) {
  return (
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
              <Link to={`/reviewer/report/${item.id}`}>Write Report</Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default AssignedCaseTable;
