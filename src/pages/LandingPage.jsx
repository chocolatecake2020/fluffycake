import { Link } from "react-router-dom";

function LandingPage() {
  const highlights = [
    { label: "Pilot Clinics", value: "5+" },
    { label: "Reviewer Specialties", value: "6 Domains" },
    { label: "Target Turnaround", value: "16-24h" }
  ];

  return (
    <main className="container">
      <section className="hero card premium-hero">
        <p className="eyebrow">Korea-based Veterinary Consultation Network</p>
        <h1>VetBridge</h1>
        <p className="hero-lead">Remote veterinary case review powered by Korean clinical expertise.</p>
        <p className="hero-copy">
          Submit imaging and clinical cases from your clinic. Receive structured second-opinion reports from Korean
          veterinary reviewers.
        </p>
        <div className="row">
          <Link className="btn primary" to="/clinic/new-case">
            Submit a Demo Case
          </Link>
          <Link className="btn" to="/reviewer-recruitment">
            Join as Clinical Reviewer
          </Link>
        </div>
        <div className="highlight-row">
          {highlights.map((item) => (
            <article className="highlight-card" key={item.label}>
              <p className="highlight-label">{item.label}</p>
              <p className="highlight-value">{item.value}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="grid two feature-grid">
        {[
          ["For Overseas Clinics", "Structured case review workflow with status tracking, messaging, and report delivery."],
          ["For Korean Veterinary Reviewers", "Specialty-based case routing, report editor, and consultative language support."],
          ["How It Works", "Submit case data, assign reviewer, review findings, and deliver final reporting support."],
          ["Sample Report", "Professional report format designed for clinical communication and documentation."],
          ["Clinical Workflow", "Draft -> Submitted -> Under Review -> Report Ready -> Completed."],
          ["Why Korea", "Strong specialty training pipeline and bilingual clinical communication for global coordination."],
          ["Contact / Pilot Inquiry", "Join pilot validation to shape turnaround, report format, and workflow compatibility."]
        ].map(([title, body]) => (
          <article className="card feature-card" key={title}>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}

export default LandingPage;
