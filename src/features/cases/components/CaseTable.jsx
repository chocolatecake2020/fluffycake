import { Link } from "react-router-dom";
import { isP2pEnabled, isPlatformCheckoutEnabled } from "../../../api/paymentsApi";
import StatusBadge from "../../../components/common/StatusBadge";

function CaseTable({ items, paidCaseIds, freeCaseIds }) {
  const paidSet = paidCaseIds instanceof Set ? paidCaseIds : new Set(paidCaseIds || []);
  const freeSet = freeCaseIds instanceof Set ? freeCaseIds : new Set(freeCaseIds || []);
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
          const isFree = freeSet.has(item.id);
          const isPaid = !isFree && paidSet.has(item.id);
          const payHref = p2pOnly
            ? `/cases/${item.id}#payment`
            : `/payments?caseId=${encodeURIComponent(item.id)}`;
          let paymentCell;
          if (isFree) {
            paymentCell = (
              <Link className="btn small primary" to={`/cases/${item.id}#report`}>
                Free · View Case
              </Link>
            );
          } else if (isPaid) {
            paymentCell = (
              <Link className="btn small primary" to={`/cases/${item.id}#report`}>
                Paid · View Review
              </Link>
            );
          } else {
            paymentCell = (
              <Link className="btn small" to={payHref}>
                Pay
              </Link>
            );
          }
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
              <td>{paymentCell}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
    </div>
  );
}

export default CaseTable;
