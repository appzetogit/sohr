import React from "react";
import { motion } from "framer-motion";
import {
  ArrowRight, Leaf, ShieldCheck, ChefHat, Crown, Truck, Clock,
  MapPin, Mountain, Store, Bike, Home, Mail, Phone, Soup,
} from "lucide-react";

// Brand palette taken from the SOHR logo: warm black, antique gold, cream.
const GOLD_TEXT = "text-transparent bg-clip-text bg-gradient-to-b from-[#FBE7A6] via-[#E0B45A] to-[#9C6E22]";
const SERIF = { fontFamily: "'Cinzel', 'Playfair Display', serif" };
const HINDI = { fontFamily: "'Tiro Devanagari Hindi', 'Noto Serif Devanagari', serif" };

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: i * 0.12 },
  }),
};

const PROMISES = [
  { Icon: Leaf, title: "100% Pure Veg", desc: "Only vegetarian food on the menu. Always." },
  { Icon: ShieldCheck, title: "Hygienic Kitchen", desc: "Clean, sealed and carefully handled from the stove to your door." },
  { Icon: Soup, title: "Freshly Cooked For You", desc: "Every order is prepared when you place it, never kept waiting." },
  { Icon: Crown, title: "Premium Quality", desc: "Handpicked ingredients and recipes perfected over years." },
];

const STEPS = [
  { num: "01", title: "Choose your meal", desc: "Browse the menu and pick what your heart is craving today." },
  { num: "02", title: "Vyas Ji's kitchen cooks it", desc: "Your food is cooked fresh, with the care of a home kitchen." },
  { num: "03", title: "Delivered to your door", desc: "Packed hot and hygienic, and on its way to you." },
];

function Ornament({ className = "" }) {
  return (
    <div className={`flex items-center justify-center gap-3 ${className}`} aria-hidden="true">
      <span className="h-px w-12 sm:w-20 bg-gradient-to-r from-transparent to-[#C9973B]" />
      <span className="w-2 h-2 rotate-45 border border-[#E0B45A]" />
      <span className="h-px w-12 sm:w-20 bg-gradient-to-l from-transparent to-[#C9973B]" />
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <span className="inline-flex items-center gap-2 text-[10px] sm:text-xs font-semibold tracking-[0.3em] uppercase text-[#E0B45A] border border-[#C9973B]/40 bg-[#C9973B]/10 rounded-full px-4 py-1.5">
      {children}
    </span>
  );
}

function RotatingSeal() {
  return (
    <div className="relative w-[300px] h-[300px] sm:w-[420px] sm:h-[420px] lg:w-[520px] lg:h-[520px]">
      {/* Glow behind the seal */}
      <div className="absolute inset-[12%] rounded-full bg-[#C9973B]/25 blur-[80px]" />

      {/* Slowly rotating engraved text ring */}
      <motion.svg
        viewBox="0 0 400 400"
        className="absolute inset-0 w-full h-full"
        animate={{ rotate: 360 }}
        transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
        aria-hidden="true"
      >
        <defs>
          <path id="sohr-ring" d="M 200,200 m -182,0 a 182,182 0 1,1 364,0 a 182,182 0 1,1 -364,0" />
        </defs>
        <circle cx="200" cy="200" r="196" fill="none" stroke="#C9973B" strokeOpacity="0.5" strokeWidth="1" />
        <circle cx="200" cy="200" r="168" fill="none" stroke="#C9973B" strokeOpacity="0.35" strokeWidth="1" />
        <text fill="#E0B45A" fontSize="13" letterSpacing="5" style={SERIF}>
          <textPath href="#sohr-ring">
            INNOVATED FROM TAPOVAN RISHIKESH ✦ PURE VEG ✦ ALL INDIA DELIVERY ✦ 24×7 SERVICE ✦
          </textPath>
        </text>
      </motion.svg>

      {/* The logo itself */}
      <div className="absolute inset-[13%] rounded-full p-[3px] bg-gradient-to-b from-[#FBE7A6] via-[#C9973B] to-[#6B4A14] shadow-[0_30px_80px_-20px_rgba(201,151,59,0.55)]">
        <img
          src="/sohr-logo.jpg"
          alt="SOHR by Vyas Ji logo"
          className="w-full h-full rounded-full object-cover"
        />
      </div>
    </div>
  );
}

export default function SohrHome({ onAbout, onRestaurant, onDelivery, supportContact }) {
  const year = new Date().getFullYear();

  return (
    <div className="relative bg-[#0A0806] text-[#F3E9D2] overflow-x-hidden" style={{ fontFamily: "'Poppins', sans-serif" }}>
      {/* Ambient gold light */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[900px] max-w-[150vw] rounded-full bg-[#C9973B]/10 blur-[160px]" />

      {/* Header */}
      <header className="relative z-50 max-w-[1400px] mx-auto px-4 sm:px-8 lg:px-12 py-5 sm:py-6 flex items-center justify-between gap-3">
        <a href="/" className="flex items-center gap-3 min-w-0">
          <img src="/sohr-logo.jpg" alt="" className="w-11 h-11 sm:w-12 sm:h-12 rounded-full ring-1 ring-[#C9973B]/60 object-cover shrink-0" />
          <div className="leading-none min-w-0">
            <p className={`text-2xl sm:text-3xl font-bold tracking-wide ${GOLD_TEXT}`} style={SERIF}>SOHR</p>
            <p className="text-[9px] sm:text-[10px] tracking-[0.35em] text-[#C9B48A] mt-1">BY VYAS JI</p>
          </div>
        </a>

        <nav className="flex items-center gap-1 sm:gap-1.5 border border-[#C9973B]/25 bg-white/[0.03] backdrop-blur-md rounded-full p-1">
          <a href="/" aria-label="Home" className="flex items-center gap-2 px-3 py-2 rounded-full text-xs font-medium text-[#E8DCC0] hover:text-[#FBE7A6] hover:bg-white/5 transition-colors">
            <Home className="w-4 h-4" /> <span className="hidden md:inline">Home</span>
          </a>
          <button onClick={onRestaurant} aria-label="Restaurant Partner" className="flex items-center gap-2 px-3 py-2 rounded-full text-xs font-medium text-[#E8DCC0] hover:text-[#FBE7A6] hover:bg-white/5 transition-colors cursor-pointer">
            <Store className="w-4 h-4" /> <span className="hidden md:inline">Restaurant Partner</span>
          </button>
          <button onClick={onDelivery} aria-label="Delivery Partner" className="flex items-center gap-2 px-3 py-2 rounded-full text-xs font-medium text-[#E8DCC0] hover:text-[#FBE7A6] hover:bg-white/5 transition-colors cursor-pointer">
            <Bike className="w-4 h-4" /> <span className="hidden md:inline">Delivery Partner</span>
          </button>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative z-10 max-w-[1400px] mx-auto px-4 sm:px-8 lg:px-12 pt-6 pb-20 lg:pt-10 lg:pb-28 grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
        <div className="text-center lg:text-left order-2 lg:order-1">
          <motion.div custom={0} initial="hidden" animate="visible" variants={fadeUp}>
            <SectionLabel><Mountain className="w-3.5 h-3.5" /> Innovated from Tapovan, Rishikesh</SectionLabel>
          </motion.div>

          <motion.h1
            custom={1} initial="hidden" animate="visible" variants={fadeUp}
            className={`mt-6 text-[22vw] sm:text-[8rem] lg:text-[7.5vw] 2xl:text-[9.5rem] font-bold leading-[0.9] tracking-wide ${GOLD_TEXT} drop-shadow-[0_6px_30px_rgba(201,151,59,0.25)]`}
            style={SERIF}
          >
            SOHR
          </motion.h1>

          <motion.div custom={2} initial="hidden" animate="visible" variants={fadeUp} className="mt-2 flex items-center justify-center lg:justify-start gap-3">
            <span className="h-px w-10 bg-[#C9973B]/70" />
            <p className="text-sm sm:text-base tracking-[0.5em] text-[#E0B45A]" style={SERIF}>BY VYAS JI</p>
            <span className="h-px w-10 bg-[#C9973B]/70" />
          </motion.div>

          <motion.p custom={3} initial="hidden" animate="visible" variants={fadeUp} className="mt-7 text-2xl sm:text-3xl text-[#F3E9D2]" style={HINDI}>
            व्यास जी के हाथों से बना हुआ <span className={`font-bold ${GOLD_TEXT}`} style={SERIF}>Tasty</span> खाना
          </motion.p>

          <motion.p custom={4} initial="hidden" animate="visible" variants={fadeUp} className="mt-5 max-w-xl mx-auto lg:mx-0 text-sm sm:text-base text-[#BFB091] leading-relaxed font-light">
            Pure vegetarian food made by Master Chef Vyas Ji, with recipes that began in the hills of Rishikesh. Freshly cooked, hygienically packed and delivered across India.
          </motion.p>

          <motion.div custom={5} initial="hidden" animate="visible" variants={fadeUp} className="mt-9 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
            <a
              href="/food/user"
              className="group inline-flex items-center justify-center gap-2.5 rounded-full px-8 py-4 text-sm font-semibold text-[#1A1206] bg-gradient-to-b from-[#FBE7A6] via-[#E0B45A] to-[#B8862F] shadow-[0_10px_40px_-10px_rgba(224,180,90,0.7)] hover:brightness-110 transition"
            >
              Order Now <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </a>
            <button
              onClick={onAbout}
              className="inline-flex items-center justify-center gap-2.5 rounded-full px-8 py-4 text-sm font-semibold text-[#F3E9D2] border border-[#C9973B]/50 hover:bg-[#C9973B]/10 transition cursor-pointer"
            >
              Our Story
            </button>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          className="flex justify-center lg:justify-end order-1 lg:order-2"
        >
          <RotatingSeal />
        </motion.div>
      </section>

      {/* Highlights strip */}
      <section className="relative z-10 border-y border-[#C9973B]/20 bg-gradient-to-r from-[#120E08] via-[#1A140B] to-[#120E08]">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 lg:px-12 py-6 grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
          {[
            { Icon: Leaf, label: "Pure Veg" },
            { Icon: MapPin, label: "All Over India" },
            { Icon: Truck, label: "All India Delivery" },
            { Icon: Clock, label: "24×7 Service" },
          ].map(({ Icon, label }) => (
            <div key={label} className="flex items-center justify-center gap-3 text-[#E8DCC0]">
              <span className="w-10 h-10 rounded-full border border-[#C9973B]/50 flex items-center justify-center text-[#E0B45A] shrink-0">
                <Icon className="w-4.5 h-4.5" />
              </span>
              <span className="text-xs sm:text-sm font-medium tracking-wider uppercase">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Promise */}
      <section className="relative z-10 max-w-[1400px] mx-auto px-4 sm:px-8 lg:px-12 py-24 lg:py-32">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={fadeUp} className="text-center max-w-2xl mx-auto">
          <SectionLabel>The SOHR Promise</SectionLabel>
          <h2 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-bold text-[#F3E9D2] leading-tight" style={SERIF}>
            Cooked with <span className={GOLD_TEXT}>devotion</span>
          </h2>
          <Ornament className="mt-6" />
        </motion.div>

        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {PROMISES.map(({ Icon, title, desc }, i) => (
            <motion.div
              key={title}
              custom={i} initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-60px" }} variants={fadeUp}
              className="group relative rounded-3xl p-7 bg-gradient-to-b from-[#17120A] to-[#0E0B07] border border-[#C9973B]/20 hover:border-[#C9973B]/60 transition-colors"
            >
              <div className="w-14 h-14 rounded-full flex items-center justify-center bg-gradient-to-b from-[#FBE7A6] via-[#E0B45A] to-[#9C6E22] text-[#1A1206] shadow-[0_8px_30px_-8px_rgba(224,180,90,0.6)]">
                <Icon className="w-6 h-6" />
              </div>
              <h3 className="mt-6 text-xl font-semibold text-[#F3E9D2]" style={SERIF}>{title}</h3>
              <p className="mt-3 text-sm text-[#A8987A] leading-relaxed font-light">{desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Story / Vyas Ji */}
      <section className="relative z-10 bg-[#0E0B07] border-y border-[#C9973B]/15">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 lg:px-12 py-24 lg:py-32 grid lg:grid-cols-2 gap-14 items-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={fadeUp} className="relative mx-auto w-full max-w-[520px]">
            <div className="absolute -inset-3 rounded-[2.5rem] border border-[#C9973B]/30" />
            <div className="relative rounded-[2rem] overflow-hidden border border-[#C9973B]/40 shadow-[0_40px_100px_-30px_rgba(201,151,59,0.4)]">
              <img src="/sohr-logo.jpg" alt="Master Chef Vyas Ji" className="w-full aspect-square object-cover" />
            </div>
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:-right-6 bg-[#0A0806] border border-[#C9973B]/50 rounded-2xl px-5 py-4 flex items-center gap-3 shadow-2xl whitespace-nowrap">
              <ChefHat className="w-6 h-6 text-[#E0B45A]" />
              <div>
                <p className="text-[10px] tracking-[0.25em] text-[#A8987A] uppercase">Master Chef</p>
                <p className={`text-lg font-bold ${GOLD_TEXT}`} style={SERIF}>Vyas Ji</p>
              </div>
            </div>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={fadeUp} custom={1} className="text-center lg:text-left">
            <SectionLabel>Our Story</SectionLabel>
            <h2 className="mt-6 text-4xl sm:text-5xl font-bold leading-tight text-[#F3E9D2]" style={SERIF}>
              From the hills of <span className={GOLD_TEXT}>Rishikesh</span> to your table
            </h2>
            <p className="mt-6 text-[#BFB091] leading-relaxed font-light">
              SOHR began in Tapovan, Rishikesh, where the Ganga comes down from the mountains. Master Chef Vyas Ji brings the warmth of home-style vegetarian cooking to every plate, with simple, honest food made the way it has always been made.
            </p>
            <p className="mt-4 text-[#BFB091] leading-relaxed font-light">
              Now that taste travels across the country, cooked fresh for every order and delivered with the same care.
            </p>
            <div className="mt-10 grid grid-cols-3 gap-4 border-t border-[#C9973B]/20 pt-8">
              {[
                { k: "100%", v: "Pure Veg" },
                { k: "24×7", v: "Service" },
                { k: "All India", v: "Delivery" },
              ].map(({ k, v }) => (
                <div key={v}>
                  <p className={`text-2xl sm:text-3xl font-bold ${GOLD_TEXT}`} style={SERIF}>{k}</p>
                  <p className="mt-1 text-[10px] sm:text-xs tracking-[0.2em] uppercase text-[#A8987A]">{v}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-10 max-w-[1400px] mx-auto px-4 sm:px-8 lg:px-12 py-24 lg:py-32">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={fadeUp} className="text-center max-w-2xl mx-auto">
          <SectionLabel>How it works</SectionLabel>
          <h2 className="mt-6 text-4xl sm:text-5xl font-bold text-[#F3E9D2]" style={SERIF}>
            Fresh food, <span className={GOLD_TEXT}>three steps</span> away
          </h2>
          <Ornament className="mt-6" />
        </motion.div>

        <div className="mt-14 grid md:grid-cols-3 gap-5">
          {STEPS.map(({ num, title, desc }, i) => (
            <motion.div
              key={num}
              custom={i} initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-60px" }} variants={fadeUp}
              className="relative rounded-3xl p-8 border border-[#C9973B]/20 bg-white/[0.02]"
            >
              <p className={`text-6xl font-bold ${GOLD_TEXT} opacity-80`} style={SERIF}>{num}</p>
              <h3 className="mt-5 text-xl font-semibold text-[#F3E9D2]" style={SERIF}>{title}</h3>
              <p className="mt-3 text-sm text-[#A8987A] leading-relaxed font-light">{desc}</p>
            </motion.div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <a
            href="/food/user"
            className="group inline-flex items-center justify-center gap-2.5 rounded-full px-9 py-4 text-sm font-semibold text-[#1A1206] bg-gradient-to-b from-[#FBE7A6] via-[#E0B45A] to-[#B8862F] shadow-[0_10px_40px_-10px_rgba(224,180,90,0.7)] hover:brightness-110 transition"
          >
            Start your order <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </a>
        </div>
      </section>

      {/* Partner with us */}
      <section className="relative z-10 max-w-[1400px] mx-auto px-4 sm:px-8 lg:px-12 pb-24 lg:pb-32 grid md:grid-cols-2 gap-5">
        {[
          { Icon: Store, title: "Partner your kitchen", desc: "Bring your restaurant to SOHR and reach customers who love good vegetarian food.", cta: "Become a Restaurant Partner", onClick: onRestaurant },
          { Icon: Bike, title: "Deliver with SOHR", desc: "Join our delivery team, choose your own hours and earn on every order.", cta: "Become a Delivery Partner", onClick: onDelivery },
        ].map(({ Icon, title, desc, cta, onClick }, i) => (
          <motion.div
            key={title}
            custom={i} initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-60px" }} variants={fadeUp}
            className="relative overflow-hidden rounded-[2rem] p-8 sm:p-10 border border-[#C9973B]/30 bg-gradient-to-br from-[#1C150A] to-[#0E0B07]"
          >
            <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full bg-[#C9973B]/10 blur-3xl" />
            <Icon className="relative w-8 h-8 text-[#E0B45A]" />
            <h3 className="relative mt-6 text-2xl sm:text-3xl font-bold text-[#F3E9D2]" style={SERIF}>{title}</h3>
            <p className="relative mt-3 text-sm sm:text-base text-[#A8987A] font-light leading-relaxed max-w-md">{desc}</p>
            <button onClick={onClick} className="relative mt-8 inline-flex items-center gap-2 text-sm font-semibold text-[#FBE7A6] hover:gap-3 transition-all cursor-pointer">
              {cta} <ArrowRight className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </section>

      {/* Closing tagline */}
      <section className="relative z-10 border-t border-[#C9973B]/20 py-20 px-4 text-center">
        <Ornament />
        <p className="mt-8 text-2xl sm:text-4xl leading-snug text-[#F3E9D2]" style={HINDI}>
          स्वाद जो दिल को छू जाए,<br className="sm:hidden" /> <span className={GOLD_TEXT}>एहसास जो हमेशा याद रहे</span>
        </p>
        <Ornament className="mt-8" />
      </section>

      {/* Footer */}
      <footer className="relative z-10 bg-[#070504] border-t border-[#C9973B]/20 px-4 sm:px-8 lg:px-12 pt-16 pb-8">
        <div className="max-w-[1400px] mx-auto grid gap-12 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="flex items-center gap-3">
              <img src="/sohr-logo.jpg" alt="" className="w-14 h-14 rounded-full ring-1 ring-[#C9973B]/60 object-cover" />
              <div className="leading-none">
                <p className={`text-3xl font-bold ${GOLD_TEXT}`} style={SERIF}>SOHR</p>
                <p className="text-[10px] tracking-[0.35em] text-[#C9B48A] mt-1">BY VYAS JI</p>
              </div>
            </div>
            <p className="mt-5 text-sm text-[#A8987A] font-light leading-relaxed max-w-sm">
              Pure vegetarian food made by Master Chef Vyas Ji. Innovated from Tapovan, Rishikesh, and delivered across India.
            </p>
          </div>

          <div className="flex flex-col gap-3 text-sm">
            <h4 className="text-xs font-semibold tracking-[0.25em] uppercase text-[#E0B45A] mb-1">Company</h4>
            <a href="/food/user/profile/about" className="text-[#BFB091] hover:text-[#FBE7A6] transition-colors">About Us</a>
            <a href="/food/user/profile/help-content" className="text-[#BFB091] hover:text-[#FBE7A6] transition-colors">Support</a>
            <a href="/food/user/profile/privacy" className="text-[#BFB091] hover:text-[#FBE7A6] transition-colors">Privacy Policy</a>
            <a href="/food/user/profile/terms" className="text-[#BFB091] hover:text-[#FBE7A6] transition-colors">Terms of Service</a>
          </div>

          <div className="flex flex-col gap-3 text-sm">
            <h4 className="text-xs font-semibold tracking-[0.25em] uppercase text-[#E0B45A] mb-1">Contact</h4>
            <a href={`mailto:${supportContact.email}`} className="inline-flex items-center gap-2 text-[#BFB091] hover:text-[#FBE7A6] transition-colors break-all">
              <Mail className="w-4 h-4 shrink-0" /> {supportContact.email}
            </a>
            <a href={`tel:${supportContact.mobile}`} className="inline-flex items-center gap-2 text-[#BFB091] hover:text-[#FBE7A6] transition-colors">
              <Phone className="w-4 h-4 shrink-0" /> {supportContact.mobile}
            </a>
            <p className="inline-flex items-center gap-2 text-[#BFB091]"><MapPin className="w-4 h-4 shrink-0" /> Tapovan, Rishikesh</p>
          </div>
        </div>

        <div className="max-w-[1400px] mx-auto mt-14 pt-6 border-t border-[#C9973B]/15 text-xs text-[#7D6F55] text-center md:text-left">
          © {year} SOHR by Vyas Ji. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
