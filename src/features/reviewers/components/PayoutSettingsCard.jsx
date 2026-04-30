import { useEffect, useState } from "react";
import { useAuth } from "../../../context/AuthContext";

function PayoutSettingsCard() {
  const { profile, updatePayoutEmail } = useAuth();
  const [paypalEmail, setPaypalEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setPaypalEmail(profile?.paypal_email || "");
  }, [profile?.paypal_email]);

  const onSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      const trimmed = (paypalEmail || "").trim();
      if (!trimmed) {
        setMessage("Please enter a valid PayPal email.");
        return;
      }
      await updatePayoutEmail(trimmed);
      setMessage("Payout email saved.");
    } catch (error) {
      setMessage(error?.message || "Failed to save payout email.");
    } finally {
      setSaving(false);
    }
  };

  const isMissing = !profile?.paypal_email;

  return (
    <section className={`card ${isMissing ? "warning-box" : ""}`}>
      <h3>Payout Settings</h3>
      <p>
        Reviewer payouts are sent automatically to your PayPal account once a case payment clears
        and the report is submitted.
      </p>
      <div className="form-grid auth-grid">
        <div className="full">
          <label>PayPal Email</label>
          <input
            type="email"
            value={paypalEmail}
            onChange={(event) => setPaypalEmail(event.target.value)}
            placeholder="reviewer@paypal.com"
          />
        </div>
        <div className="row full">
          <button className="btn primary" type="button" onClick={onSave} disabled={saving}>
            {saving ? "Saving..." : "Save Payout Email"}
          </button>
        </div>
      </div>
      {message && <p className="auth-meta">{message}</p>}
    </section>
  );
}

export default PayoutSettingsCard;
