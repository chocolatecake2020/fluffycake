import AdminCaseRow from "./AdminCaseRow";

function AdminCaseControlTable({ items }) {
  return (
    <section className="card">
      <h3>Case Control</h3>
      <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Case</th>
            <th>Status</th>
            <th>Assign Reviewer</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <AdminCaseRow key={item.id} item={item} />
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}

export default AdminCaseControlTable;
