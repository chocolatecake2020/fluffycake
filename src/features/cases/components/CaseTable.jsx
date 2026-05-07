import { Link } from "react-router-dom";
import { isP2pEnabled, isPlatformCheckoutEnabled } from "../../../api/paymentsApi";
import StatusBadge from "../../../components/common/StatusBadge";

function CaseTable({ items, paidCaseIds }) {
  const paidSet = paidCaseIds instanceof Set ? paidCaseIds : new Set(paidCaseIds || []);
  const p2pOnly = isP2pEnabled() && !isPlatformCheckoutEnabled();

  return (
    <div className="table-wrap">
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
          const payHref = p2pOnly
            ? `/cases/${item.id}#payment`
            : `/payments?caseId=${encodeURIComponent(item.id)}`;
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
                  <Link className="btn small" to={payHref}>
                    Pay
                  </Link>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
    </div>
  );
}

export default CaseTable;
