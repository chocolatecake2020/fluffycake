import { useEffect, useState } from "react";
import { useAuth } from "../../../context/AuthContext";

function PayoutSettingsCard() {
  const { profile, updatePayoutEmail, updateDisplayName } = useAuth();
  const [paypalEmail, setPaypalEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");
  const [nameMessage, setNameMessage] = useState("");

  useEffect(() => {
    setPaypalEmail(profile?.paypal_email || "");
  }, [profile?.paypal_email]);

  useEffect(() => {
    setDisplayName(profile?.full_name || "");
  }, [profile?.full_name]);

  const onSaveEmail = async () => {
    setSavingEmail(true);
    setEmailMessage("");
    try {
      const trimmed = (paypalEmail || "").trim();
      if (!trimmed) {
        setEmailMessage("Please enter a valid PayPal email.");
        return;
      }
      await updatePayoutEmail(trimmed);
      setEmailMessage("Payout email saved.");
    } catch (error) {
      setEmailMessage(error?.message || "Failed to save payout email.");
    } finally {
      setSavingEmail(false);
    }
  };

  const onSaveName = async () => {
    setSavingName(true);
    setNameMessage("");
    try {
      const trimmed = (displayName || "").trim();
      if (!trimmed) {
        setNameMessage("Please enter a display name.");
        return;
      }
      await updateDisplayName(trimmed);
      setNameMessage("Display name saved.");
    } catch (error) {
      setNameMessage(error?.message || "Failed to save display name.");
    } finally {
      setSavingName(false);
    }
  };

  const isMissing = !profile?.paypal_email;

  return (
    <section className={`card ${isMissing ? "warning-box" : ""}`}>
      <h3>Payout Settings</h3>
      <p>
        Reviewer payouts are sent automatically to your PayPal account once a case payment clears
        and the report is submitted. The display name shown to clinics on the payment screen.
      </p>
      <div className="form-grid auth-grid">
        <div className="full">
          <label>Display Name (shown to clinics)</label>
          <input
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="e.g. Dr. Hong Gildong"
          />
        </div>
        <div className="row full">
          <button className="btn" type="button" onClick={onSaveName} disabled={savingName}>
            {savingName ? "Saving..." : "Save Display Name"}
          </button>
        </div>
        {nameMessage && <p className="full auth-meta">{nameMessage}</p>}

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
          <button className="btn primary" type="button" onClick={onSaveEmail} disabled={savingEmail}>
            {savingEmail ? "Saving..." : "Save Payout Email"}
          </button>
        </div>
        {emailMessage && <p className="full auth-meta">{emailMessage}</p>}
      </div>
    </section>
  );
}

export default PayoutSettingsCard;
