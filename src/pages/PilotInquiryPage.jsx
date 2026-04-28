import { useState } from "react";
import { createPilotInquiry } from "../api/platformApi";
import Field from "../components/common/Field";

function PilotInquiryPage() {
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({
    name: "",
    institution: "",
    country: "",
    email: "",
    role: "Overseas clinic",
    interest: "Radiology",
    message: ""
  });

  const onChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    await createPilotInquiry(form);
    setSent(true);
  };

  return (
    <main className="container narrow">
      <form className="card form-grid" onSubmit={onSubmit}>
        <h2>Pilot Inquiry</h2>
        <Field label="Name" name="name" value={form.name} onChange={onChange} required />
        <Field label="Clinic / Institution" name="institution" value={form.institution} onChange={onChange} required />
        <Field label="Country" name="country" value={form.country} onChange={onChange} required />
        <Field label="Email" name="email" value={form.email} onChange={onChange} required />
        <Field
          label="Role"
          name="role"
          value={form.role}
          onChange={onChange}
          select
          options={["Overseas clinic", "Korean veterinary reviewer", "US-based Korean veterinarian", "Academic advisor"]}
        />
        <Field
          label="Interest area"
          name="interest"
          value={form.interest}
          onChange={onChange}
          select
          options={["Radiology", "Internal medicine", "Dermatology", "Surgery", "Emergency", "Platform feedback"]}
        />
        <Field label="Message" name="message" value={form.message} onChange={onChange} textarea />
        <button className="btn primary full">Submit Inquiry</button>
        {sent && <p className="full">Pilot inquiry submitted.</p>}
      </form>
    </main>
  );
}

export default PilotInquiryPage;
