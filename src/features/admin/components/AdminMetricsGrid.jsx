function AdminMetricsGrid({ metrics }) {
  return (
    <section className="grid three">
      {metrics.map(([label, value]) => (
        <article className="card" key={label}>
          <p className="metric-label">{label}</p>
          <p className="metric-value">{value}</p>
        </article>
      ))}
    </section>
  );
}

export default AdminMetricsGrid;
