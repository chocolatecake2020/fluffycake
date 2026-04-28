import { useState } from "react";
import { useParams } from "react-router-dom";
import { downloadReportPDF, requestMoreInfo, submitReport } from "../api/platformApi";
import DashboardHeader from "../components/common/DashboardHeader";
import Field from "../components/common/Field";
import { reviewerMenu } from "../constants/menus";
import { reportTemplate } from "../data/mockData";

function ReportEditorPage() {
  const { caseId } = useParams();
  const [report, setReport] = useState(reportTemplate);
  const [message, setMessage] = useState("");

  const onChange = (e) => setReport((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async () => {
    await submitReport(caseId, report);
    setMessage("Report submitted.");
  };

  const handleRequestInfo = async () => {
    await requestMoreInfo(caseId, "Additional imaging view requested.");
    setMessage("Additional information requested.");
  };

  const handlePreview = async () => {
    await downloadReportPDF(caseId);
    setMessage("PDF preview placeholder opened.");
  };

  return (
    <main className="container">
      <DashboardHeader title={`Report Editor / ${caseId}`} menu={reviewerMenu} />
      <section className="card form-grid">
        <Field label="Case Summary" name="caseSummary" value={report.caseSummary} onChange={onChange} textarea />
        <Field label="Imaging / Clinical Findings" name="findings" value={report.findings} onChange={onChange} textarea />
        <Field label="Interpretation" name="interpretation" value={report.interpretation} onChange={onChange} textarea />
        <Field label="Differential Considerations" name="differential" value={report.differential} onChange={onChange} textarea />
        <Field label="Recommendations" name="recommendations" value={report.recommendations} onChange={onChange} textarea />
        <Field label="Limitations" name="limitations" value={report.limitations} onChange={onChange} textarea />
        <Field label="Reviewer Signature" name="reviewerSignature" value={report.reviewerSignature} onChange={onChange} />
        <div className="full report-tone">
          Findings are suggestive of... Clinical correlation is recommended. Further diagnostic evaluation may be
          considered. This report is intended as consultative support.
        </div>
        <div className="row full">
          <button className="btn" type="button">
            Save Draft
          </button>
          <button className="btn primary" type="button" onClick={handleSubmit}>
            Submit Report
          </button>
          <button className="btn" type="button" onClick={handlePreview}>
            Preview PDF
          </button>
          <button className="btn" type="button" onClick={handleRequestInfo}>
            Request Additional Information
          </button>
        </div>
        {message && <p className="full">{message}</p>}
      </section>
    </main>
  );
}

export default ReportEditorPage;
