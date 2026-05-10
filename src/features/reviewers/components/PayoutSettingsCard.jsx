import { useEffect, useState } from "react";
import { useAuth } from "../../../context/AuthContext";

function PayoutSettingsCard() {
  // Reviewer payouts are settled via local bank transfer by the operations
  // team, so the PayPal email field is no longer collected here. The card
  // keeps only the display name (shown to clinics on the case/payment view).
  // Existing user_profiles.paypal_email rows are retained in DB and ignored
  // by the UI; the AuthContext.updatePayoutEmail action remains available
  // for future re-enablement.
  const { profile, updateDisplayName } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState("");

  useEffect(() => {
    setDisplayName(profile?.full_name || "");
  }, [profile?.full_name]);

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

  return (
    <section className="card">
      <h3>Reviewer Profile</h3>
      <p>
        Reviewer payouts are settled by the operations team via bank transfer on the agreed
        cadence. Update the display name shown to clinics on the case and payment screens.
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
          <button className="btn primary" type="button" onClick={onSaveName} disabled={savingName}>
            {savingName ? "Saving..." : "Save Display Name"}
          </button>
        </div>
        {nameMessage && <p className="full auth-meta">{nameMessage}</p>}
      </div>
    </section>
  );
}

export default PayoutSettingsCard;
