import React from "react";
import { motion } from "framer-motion";

// Brand palette taken from the SOHR logo: warm black, antique gold, cream.
export const GOLD_TEXT = "text-transparent bg-clip-text bg-gradient-to-b from-[#FBE7A6] via-[#E0B45A] to-[#9C6E22]";
export const SERIF = { fontFamily: "'Cinzel', 'Playfair Display', serif" };
export const HINDI = { fontFamily: "'Tiro Devanagari Hindi', 'Noto Serif Devanagari', serif" };

// The app's theme script forces a font on "#root *" with !important; this
// selector is specific enough to keep the logo serif on SOHR pages.
export function SohrFonts() {
  return (
    <style>{"#root .sohr-serif{font-family:'Cinzel','Playfair Display',serif !important}#root .sohr-hindi{font-family:'Tiro Devanagari Hindi','Noto Serif Devanagari',serif !important}"}</style>
  );
}

export function Ornament({ className = "" }) {
  return (
    <div className={`flex items-center justify-center gap-3 ${className}`} aria-hidden="true">
      <span className="h-px w-12 sm:w-20 bg-gradient-to-r from-transparent to-[#C9973B]" />
      <span className="w-2 h-2 rotate-45 border border-[#E0B45A]" />
      <span className="h-px w-12 sm:w-20 bg-gradient-to-l from-transparent to-[#C9973B]" />
    </div>
  );
}

export function RotatingSeal({ className = "w-[300px] h-[300px] sm:w-[420px] sm:h-[420px] lg:w-[520px] lg:h-[520px]" }) {
  return (
    <div className={`relative ${className}`}>
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
