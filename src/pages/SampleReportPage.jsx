function SampleReportPage() {
  return (
    <main className="container narrow">
      <section className="card">
        <h2>VetBridge Report</h2>
        <p>Patient: Milo</p>
        <p>Species: Dog</p>
        <p>Breed: Mixed</p>
        <p>Age: 8 years</p>
        <p>Submitted by: Crescenta Valley Veterinary Hospital</p>
        <p>Review type: Thoracic radiograph review</p>
        <p>Priority: Standard</p>
        <p>Reviewer: Dr. J. Kim</p>
        <hr />
        <h3>Clinical Summary</h3>
        <p>Chronic cough with intermittent exercise intolerance. No acute cyanosis reported.</p>
        <h3>Findings</h3>
        <p>Mild diffuse bronchial pattern and focal right middle lung lobe opacity are identified.</p>
        <h3>Interpretation</h3>
        <p>Findings are suggestive of chronic inflammatory airway disease with possible focal atelectatic change.</p>
        <h3>Recommendations</h3>
        <p>Clinical correlation is recommended. Follow-up thoracic imaging and airway-directed management may be considered.</p>
        <h3>Limitations</h3>
        <p>This report is intended as consultative support and does not replace primary veterinarian judgment.</p>
        <button className="btn primary">Download PDF (Placeholder)</button>
      </section>
    </main>
  );
}

export default SampleReportPage;
