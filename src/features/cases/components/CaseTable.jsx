import { Link } from "react-router-dom";
import StatusBadge from "../../../components/common/StatusBadge";

function CaseTable({ items, paidCaseIds }) {
  const paidSet = paidCaseIds instanceof Set ? paidCaseIds : new Set(paidCaseIds || []);

  return (
    <table>
      <thead>
        <tr>
          <th>Case</th>
          <th>Patient</th>
          <th>Review Type</th>
          <th>Priority</th>
          <th>Status</th>
          <th>Payment</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const isPaid = paidSet.has(item.id);
          return (
            <tr key={item.id}>
              <td>
                <Link to={`/cases/${item.id}`}>{item.title}</Link>
              </td>
              <td>{item.patientName}</td>
              <td>{item.reviewType}</td>
              <td>{item.priority}</td>
              <td>
                <StatusBadge status={item.status} />
              </td>
              <td>
                {isPaid ? (
                  <Link className="btn small primary" to={`/cases/${item.id}#report`}>
                    Paid · View Review
                  </Link>
                ) : (
                  <Link className="btn small" to={`/payments?caseId=${encodeURIComponent(item.id)}`}>
                    Pay
                  </Link>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default CaseTable;
