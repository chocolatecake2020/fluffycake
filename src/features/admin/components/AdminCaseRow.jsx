import { useState } from "react";
import { assignReviewer } from "../../../api/platformApi";
import StatusBadge from "../../../components/common/StatusBadge";

function AdminCaseRow({ item }) {
  const [selected, setSelected] = useState("rv-1");
  const [status, setStatus] = useState(item.status);

  const handleAssign = async () => {
    await assignReviewer(item.id, selected);
    setStatus("Under Review");
  };

  return (
    <tr>
      <td>{item.title}</td>
      <td>
        <StatusBadge status={status} />
      </td>
      <td>
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="rv-1">Dr. J. Kim</option>
          <option value="rv-2">Dr. H. Lee</option>
          <option value="rv-3">Dr. S. Park</option>
          <option value="rv-4">Dr. M. Choi</option>
        </select>
        <button className="btn small" onClick={handleAssign}>
          Assign
        </button>
      </td>
    </tr>
  );
}

export default AdminCaseRow;
