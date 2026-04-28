import paypalLogo from "../../assets/logos/paypal.png";
import stripeLogo from "../../assets/logos/stripe.png";
import usdtLogo from "../../assets/logos/usdt.png";

const logos = [
  { id: "stripe", src: stripeLogo, alt: "Stripe logo" },
  { id: "paypal", src: paypalLogo, alt: "PayPal logo" },
  { id: "usdt", src: usdtLogo, alt: "USDT logo" }
];

function PaymentLogoStrip() {
  return (
    <div className="payment-logo-row">
      {logos.map((logo) => (
        <div className={`pay-logo pay-logo-${logo.id}`} key={logo.id}>
          <img src={logo.src} alt={logo.alt} />
        </div>
      ))}
    </div>
  );
}

export default PaymentLogoStrip;
