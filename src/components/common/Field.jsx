function Field({ label, select, textarea, options = [], ...props }) {
  return (
    <div>
      <label>{label}</label>
      {select ? (
        <select {...props}>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : textarea ? (
        <textarea rows={3} {...props} />
      ) : (
        <input {...props} />
      )}
    </div>
  );
}

export default Field;
