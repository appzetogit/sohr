import { Link } from "react-router-dom"
import { GOLD_TEXT, SERIF, SohrFonts } from "./sohrBrand"
import { LEGAL, LEGAL_PAGES } from "./legalInfo"

const UPDATED = "6 November 2026"

const Contact = () => (
  <ul className="list-none pl-0 space-y-1">
    <li><strong>{LEGAL.legalName}</strong> (trading as {LEGAL.brand})</li>
    <li>{LEGAL.address}</li>
    <li>Phone: <a href={LEGAL.phoneHref}>{LEGAL.phone}</a></li>
    <li>Website: <a href={LEGAL.website}>{LEGAL.website}</a></li>
  </ul>
)

const CONTENT = {
  "/about": (
    <>
      <p>
        {LEGAL.brand} is a pure-vegetarian food brand. Its recipes come from Master Chef Vyas Ji, rooted in
        Tapovan, Rishikesh, and are cooked in our kitchen at Civil Lines, {LEGAL.city}.
      </p>
      <p>
        The SOHR website, customer app and rider app are owned and operated by <strong>{LEGAL.legalName}</strong>.
        Customers order from us through the website or by WhatsApp, and our delivery partners bring the food to
        their door within our {LEGAL.city} delivery area.
      </p>
      <h2>Registered business</h2>
      <Contact />
    </>
  ),
  "/contact": (
    <>
      <p>For orders, payments, refunds or any other question, contact us:</p>
      <Contact />
      <p>Our kitchen and support are open 24 hours a day, 7 days a week.</p>
      <p>
        For a problem with an order, have your order number ready. We aim to respond to every request within
        24 hours.
      </p>
    </>
  ),
  "/terms": (
    <>
      <p>
        These terms apply to the website {LEGAL.website}, the SOHR customer and rider apps, and orders placed
        through them (together, the "Service"). The Service is operated by <strong>{LEGAL.legalName}</strong>
        ("SOHR", "we", "us"). By using the Service you agree to these terms.
      </p>
      <h2>1. Your account</h2>
      <p>
        You log in with your mobile number and a one-time password (OTP). Keep your phone and OTPs to yourself;
        you are responsible for orders placed from your account. Give us an accurate name, phone number and
        delivery address.
      </p>
      <h2>2. Orders and prices</h2>
      <p>
        Menu prices are in Indian Rupees. GST and any delivery or packaging charges are shown before you pay. An
        order is confirmed when our restaurant accepts it. We may decline or cancel an order, for example if an
        item is unavailable or the address is outside our delivery area; if you have already paid, you get a full
        refund under our <Link to="/refund-policy">Refund &amp; Cancellation Policy</Link>.
      </p>
      <h2>3. Payment</h2>
      <p>
        You can pay online or in cash on delivery where offered. Online payments are processed by our payment
        partner, Cashfree Payments. We do not see or store your card, UPI or bank details.
      </p>
      <h2>4. Delivery</h2>
      <p>
        We deliver within our {LEGAL.city} service area as described in our{" "}
        <Link to="/shipping-policy">Shipping &amp; Delivery Policy</Link>. Delivery times shown are estimates.
      </p>
      <h2>5. Food and allergies</h2>
      <p>
        All our food is vegetarian. Dishes may contain dairy, nuts, gluten or other allergens; ask us before
        ordering if you have an allergy.
      </p>
      <h2>6. Acceptable use</h2>
      <p>
        Do not misuse the Service: no fake orders, fraud, abuse of delivery partners or staff, or attempts to
        interfere with the website or apps. We may suspend accounts that do.
      </p>
      <h2>7. Delivery partners</h2>
      <p>
        Riders using the SOHR rider app must provide accurate documents, follow traffic laws, hand over orders
        safely, and pay all cash collected from customers to SOHR as shown in the app.
      </p>
      <h2>8. Liability</h2>
      <p>
        To the extent the law allows, our liability for any order is limited to the amount you paid for it. We
        are not responsible for delays caused by events outside our control, such as weather, traffic or network
        outages.
      </p>
      <h2>9. Changes</h2>
      <p>We may update these terms. The date at the top shows the latest version.</p>
      <h2>10. Law and disputes</h2>
      <p>
        These terms are governed by the laws of India. Courts in {LEGAL.city}, Uttar Pradesh have jurisdiction.
      </p>
      <h2>Contact</h2>
      <Contact />
    </>
  ),
  "/privacy-policy": (
    <>
      <p>
        This policy explains how <strong>{LEGAL.legalName}</strong> ("SOHR", "we") collects and uses personal
        information through {LEGAL.website} and the SOHR apps.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li><strong>Customers:</strong> name, mobile number, email (if given), delivery addresses and map location, and order history.</li>
        <li><strong>Delivery partners:</strong> name, mobile number, identity and vehicle documents, bank or UPI details for payouts, and live location while on duty.</li>
        <li><strong>Devices:</strong> a notification token, device type and basic usage logs, used to send order updates and keep the Service secure.</li>
        <li><strong>Payments:</strong> handled by Cashfree Payments. We receive only the payment status, amount and reference, never your card or UPI credentials.</li>
      </ul>
      <h2>How we use it</h2>
      <p>
        To create your account and log you in by OTP, take and deliver orders, process payments and refunds,
        pay delivery partners, give support, prevent fraud and meet legal obligations. We do not sell your data.
      </p>
      <h2>Who we share it with</h2>
      <ul>
        <li>Our restaurant and the delivery partner handling your order (name, phone, address).</li>
        <li>Service providers that run parts of the Service for us: Cashfree Payments (payments), our SMS provider (OTPs), Google Firebase (notifications) and Google Maps (locations).</li>
        <li>Authorities, when the law requires it.</li>
      </ul>
      <h2>Storage and security</h2>
      <p>
        Data is stored on secured servers in India. Payment secrets are encrypted, and access is limited to
        people who need it. We keep data while your account is active and as long as tax and accounting law
        requires afterwards.
      </p>
      <h2>Your choices</h2>
      <p>
        You can see and correct your profile in the app, delete your account from the app, or ask us to access,
        correct or delete your data using the contact details below.
      </p>
      <h2>Grievances</h2>
      <p>Send any privacy concern or complaint to:</p>
      <Contact />
    </>
  ),
  "/refund-policy": (
    <>
      <p>
        This policy applies to orders placed with <strong>{LEGAL.legalName}</strong> (trading as {LEGAL.brand}).
      </p>
      <h2>Cancelling an order</h2>
      <ul>
        <li>You can cancel from the app until our restaurant accepts the order.</li>
        <li>Once the restaurant accepts, food is being prepared and the order can no longer be cancelled in the app. Call us if something has gone wrong.</li>
        <li>We may cancel an order if an item is unavailable, the address is outside our delivery area, or we cannot reach you. You are not charged for orders we cancel.</li>
      </ul>
      <h2>Refunds</h2>
      <ul>
        <li><strong>Paid online:</strong> the full amount is refunded to your original payment method. Refunds are started straight away and usually reach you in 5–7 working days, depending on your bank.</li>
        <li><strong>Paid from your SOHR wallet:</strong> the amount goes back to your wallet straight away.</li>
        <li><strong>Cash on delivery:</strong> nothing is charged until delivery, so there is nothing to refund for a cancelled order.</li>
      </ul>
      <h2>Wrong, missing or damaged items</h2>
      <p>
        Contact us within 24 hours of delivery with your order number and a photo. If we confirm the problem, we
        will replace the item or refund it to your original payment method or wallet.
      </p>
      <h2>Contact</h2>
      <Contact />
    </>
  ),
  "/shipping-policy": (
    <>
      <p>
        <strong>{LEGAL.legalName}</strong> (trading as {LEGAL.brand}) sells freshly cooked food for delivery. We
        do not ship by courier.
      </p>
      <h2>Where we deliver</h2>
      <p>
        We deliver within our {LEGAL.city} service area, roughly 15 km around our kitchen at Civil Lines,{" "}
        {LEGAL.city}. The app checks your address before you order and tells you if it is outside the area.
      </p>
      <h2>How and when</h2>
      <ul>
        <li>Orders are cooked after the restaurant accepts them, and are delivered by SOHR delivery partners.</li>
        <li>The app shows an estimated delivery time and lets you follow the rider live. Times are estimates and can change with traffic or weather.</li>
        <li>We deliver 24 hours a day, 7 days a week, subject to rider availability.</li>
      </ul>
      <h2>Charges</h2>
      <p>Any delivery charge and GST are shown before you pay.</p>
      <h2>If a delivery fails</h2>
      <p>
        If the rider cannot reach you at the address, they will call you. If we still cannot deliver, contact us
        and we will arrange a new attempt or a refund under our{" "}
        <Link to="/refund-policy">Refund &amp; Cancellation Policy</Link>.
      </p>
      <h2>Contact</h2>
      <Contact />
    </>
  ),
}

/** Public About, Contact and policy pages. */
export default function LegalPage({ path }) {
  const page = LEGAL_PAGES.find((p) => p.path === path) || LEGAL_PAGES[0]
  return (
    <div className="min-h-screen bg-[#0B0806] text-[#E8DCC2]">
      <SohrFonts />
      <header className="border-b border-[#C9973B]/20 px-4 sm:px-8">
        <div className="max-w-3xl mx-auto py-5 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-3">
            <img src="/sohr-logo.jpg?v=2" alt="" className="w-10 h-10 rounded-full ring-1 ring-[#C9973B]/60 object-cover" />
            <span className={`text-2xl font-bold ${GOLD_TEXT}`} style={SERIF}>SOHR</span>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-8 py-10">
        <h1 className={`text-3xl sm:text-4xl font-bold ${GOLD_TEXT}`} style={SERIF}>{page.title}</h1>
        <p className="mt-2 text-xs text-[#9A8B6E]">
          {LEGAL.legalName} · Last updated {UPDATED}
        </p>
        <article className="legal-content mt-8 space-y-4 text-[15px] leading-relaxed text-[#D9CCAF] [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-[#E0B45A] [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2 [&_a]:text-[#FBE7A6] [&_a]:underline">
          {CONTENT[page.path]}
        </article>
      </main>

      <footer className="border-t border-[#C9973B]/15 px-4 sm:px-8 py-8">
        <nav className="max-w-3xl mx-auto flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {LEGAL_PAGES.map((p) => (
            <Link key={p.path} to={p.path} className="text-[#BFB091] hover:text-[#FBE7A6]">{p.title}</Link>
          ))}
        </nav>
        <p className="max-w-3xl mx-auto mt-4 text-xs text-[#7D6F55]">
          © {new Date().getFullYear()} {LEGAL.legalName}. All rights reserved.
        </p>
      </footer>
    </div>
  )
}
