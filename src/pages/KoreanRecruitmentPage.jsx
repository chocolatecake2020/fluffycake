import { useState } from "react";
import { createReviewerApplication } from "../api/platformApi";

function KoreanRecruitmentPage() {
  const koreanIntro =
    "VetBridge\uB294 \uD574\uC678 \uB3D9\uBB3C\uBCD1\uC6D0\uC758 \uC601\uC0C1 \uBC0F \uC784\uC0C1 \uCF00\uC774\uC2A4\uC5D0 \uB300\uD574 \uD55C\uAD6D \uC218\uC758\uC0AC\uC758 \uC804\uBB38\uC801 second opinion\uC744 \uC81C\uACF5\uD558\uB294 \uAE00\uB85C\uBC8C \uC6D0\uACA9 \uC790\uBB38 \uD50C\uB7AB\uD3FC\uC785\uB2C8\uB2E4.";
  const koreanPilot =
    "\uCD08\uAE30 \uD30C\uC77C\uB7FF \uB2E8\uACC4\uC5D0\uC11C \uC601\uC0C1, \uB0B4\uACFC, \uD53C\uBD80\uACFC, \uC678\uACFC, \uC751\uAE09 \uCF00\uC774\uC2A4 \uB9AC\uBDF0\uC5D0 \uCC38\uC5EC\uD560 clinical reviewer \uBC0F advisor\uB97C \uBAA8\uC9D1\uD569\uB2C8\uB2E4.";
  const participationTitle = "\uCC38\uC5EC \uBC29\uC2DD";
  const participationItems = [
    "\uCF00\uC774\uC2A4\uBCC4 \uC120\uD0DD \uCC38\uC5EC",
    "\uC6D0\uACA9 \uB9AC\uD3EC\uD2B8 \uC791\uC131",
    "\uC2DC\uAC04 \uC720\uC5F0",
    "\uD30C\uC77C\uB7FF \uB2E8\uACC4 \uC218\uC775 \uBC30\uBD84",
    "\uD5A5\uD6C4 founding clinical panel profile \uC81C\uACF5"
  ];
  const ctaText = "Reviewer\uB85C \uAD00\uC2EC \uB4F1\uB85D\uD558\uAE30";
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    institution: "",
    specialty: "Radiology",
    message: ""
  });
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const onChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus("");
    try {
      await createReviewerApplication(form);
      const subject = encodeURIComponent("[VetBridge] Reviewer Interest Registration");
      const body = encodeURIComponent(
        [
          `Name: ${form.name}`,
          `Email: ${form.email}`,
          `Phone: ${form.phone}`,
          `Institution: ${form.institution}`,
          `Specialty: ${form.specialty}`,
          "",
          "Message:",
          form.message
        ].join("\n")
      );
      window.location.href = `mailto:oasis.dev.lab@gmail.com?subject=${subject}&body=${body}`;
      setStatus("����� ����Ǿ����ϴ�. ���� �ʾ� â�� ������ �ʾҴٸ� �˾� ������ Ȯ���� �ּ���.");
      setForm({ name: "", email: "", phone: "", institution: "", specialty: "Radiology", message: "" });
    } catch (error) {
      setStatus(error.message || "���� ��� �� ������ �߻��߽��ϴ�.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="container narrow">
      <section className="card premium-panel">
        <h2>Join the Founding Clinical Reviewer Panel</h2>
        <p>{koreanIntro}</p>
        <p>{koreanPilot}</p>
        <h3>{participationTitle}</h3>
        <ul>
          {participationItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <form className="form-grid" onSubmit={onSubmit}>
          <div>
            <label>Name</label>
            <input name="name" value={form.name} onChange={onChange} required />
          </div>
          <div>
            <label>Email</label>
            <input name="email" type="email" value={form.email} onChange={onChange} required />
          </div>
          <div>
            <label>Phone</label>
            <input name="phone" type="tel" value={form.phone} onChange={onChange} required />
          </div>
          <div>
            <label>Institution</label>
            <input name="institution" value={form.institution} onChange={onChange} />
          </div>
          <div>
            <label>Specialty</label>
            <select name="specialty" value={form.specialty} onChange={onChange}>
              <option value="Radiology">Radiology</option>
              <option value="Internal Medicine">Internal Medicine</option>
              <option value="Dermatology">Dermatology</option>
              <option value="Surgery">Surgery</option>
              <option value="Emergency">Emergency</option>
            </select>
          </div>
          <div className="full">
            <label>Message</label>
            <textarea name="message" rows={4} value={form.message} onChange={onChange} />
          </div>
          <button className="btn primary full" disabled={loading}>
            {loading ? "��� ��..." : ctaText}
          </button>
          {status && <p className="full auth-meta">{status}</p>}
        </form>
      </section>
    </main>
  );
}

export default KoreanRecruitmentPage;
