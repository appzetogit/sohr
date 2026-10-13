import React, { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import Lenis from "lenis";
import {
  ArrowRight, ArrowLeft, Search, ShoppingCart, Play, Apple,
  MapPin, Clock, Star, Facebook, Youtube, Instagram, Linkedin,
  Zap, Award, ShieldCheck, TrendingUp, ArrowUpRight, Map,
  Users, Percent, Heart, Sparkles, X, Home, Store, Bike, Loader2
} from "lucide-react";
import { APP_CONFIG } from "../config/constants"; // Adjust path if needed
import apiClient, { restaurantAPI } from "../services/api";
import SohrHome from "./SohrHome";

// --- Animation Variants for Cinematic Reveals ---
const textReveal = {
  hidden: { y: "120%" },
  visible: (i) => ({
    y: 0,
    transition: { duration: 1, ease: [0.16, 1, 0.3, 1], delay: i * 0.1 }
  })
};

const imageReveal = {
  hidden: { scale: 1.1, opacity: 0, clipPath: "inset(100% 0% 0% 0% round 2rem)" },
  visible: {
    scale: 1,
    opacity: 1,
    clipPath: "inset(0% 0% 0% 0% round 2rem)",
    transition: { duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.2 }
  }
};

const gridVariants = {
  hidden: { opacity: 0, y: 50 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: i * 0.15 }
  })
};

export default function LandingPage() {
  const containerRef = useRef(null);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isRestaurantOpen, setIsRestaurantOpen] = useState(false);
  const [isDeliveryOpen, setIsDeliveryOpen] = useState(false);
  const [supportContact, setSupportContact] = useState({
    email: "support@sohr.in",
    mobile: "1-800-123-4567"
  });
  const [leadForm, setLeadForm] = useState({
    ownerName: "",
    restaurantName: "",
    mobileNumber: "",
    emailId: "",
    location: "",
  });
  const [submittingLead, setSubmittingLead] = useState(false);
  const [leadSuccess, setLeadSuccess] = useState(false);
  const [activeCraving, setActiveCraving] = useState(0);

  useEffect(() => {
    async function fetchSupportInfo() {
      try {
        const response = await apiClient.get("/food/pages/support", {
          params: { module: "USER" }
        });
        const data = response?.data?.data || response?.data;
        if (data && (data.email || data.mobile)) {
          setSupportContact({
            email: data.email || "support@sohr.in",
            mobile: data.mobile || "1-800-123-4567"
          });
        }
      } catch (err) {
        console.error("Error fetching support contact for footer:", err);
      }
    }
    fetchSupportInfo();
  }, []);

  const [mapRotate, setMapRotate] = useState({ x: 0, y: 0 });
  const handleMapMouseMove = (e) => {
    const card = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - card.left - card.width / 2;
    const y = e.clientY - card.top - card.height / 2;
    setMapRotate({ x: -y / 15, y: x / 15 });
  };
  const handleMapMouseLeave = () => {
    setMapRotate({ x: 0, y: 0 });
  };

  const handleLeadSubmit = async (e) => {
    e.preventDefault();
    if (!leadForm.ownerName || !leadForm.restaurantName || !leadForm.mobileNumber || !leadForm.emailId || !leadForm.location) {
      alert("Please fill all the details to register.");
      return;
    }
    try {
      setSubmittingLead(true);
      await restaurantAPI.createUnregisteredRestaurant(leadForm);
      setLeadSuccess(true);
      setLeadForm({
        ownerName: "",
        restaurantName: "",
        mobileNumber: "",
        emailId: "",
        location: "",
      });
    } catch (err) {
      console.error("Error submitting lead:", err);
      alert(err.response?.data?.message || "Failed to submit. Please try again later.");
    } finally {
      setSubmittingLead(false);
    }
  };
  const lenisRef = useRef(null);

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smooth: true,
      mouseMultiplier: 1,
    });
    lenisRef.current = lenis;

    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    return () => lenis.destroy();
  }, []);

  useEffect(() => {
    if (isAboutOpen || isRestaurantOpen || isDeliveryOpen) {
      if (lenisRef.current) lenisRef.current.stop();
      document.body.style.overflow = "hidden";
    } else {
      if (lenisRef.current) lenisRef.current.start();
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isAboutOpen, isRestaurantOpen, isDeliveryOpen]);

  // Handle browser back button (popstate) to close overlays instead of navigating away
  useEffect(() => {
    const handlePopState = (event) => {
      setIsAboutOpen(false);
      setIsRestaurantOpen(false);
      setIsDeliveryOpen(false);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  // Sync React states to browser history stack
  useEffect(() => {
    const isAnyOpen = isAboutOpen || isRestaurantOpen || isDeliveryOpen;
    
    if (isAnyOpen) {
      if (!window.history.state?.modalOpen) {
        window.history.pushState({ modalOpen: true }, "");
      }
    } else {
      if (window.history.state?.modalOpen) {
        window.history.back();
      }
    }
  }, [isAboutOpen, isRestaurantOpen, isDeliveryOpen]);

  // Global Scroll Progress Hook
  const { scrollYProgress } = useScroll({ target: containerRef });

  // Hero Parallax (Mapping to the top 15% of the page scroll)
  const heroY = useTransform(scrollYProgress, [0, 0.15], ["0%", "50%"]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);
  const imageParallax = useTransform(scrollYProgress, [0, 0.15], ["0%", "20%"]);

  // Phone Mockup Parallax
  const scalePhone = useTransform(scrollYProgress, [0.2, 0.4], [0.85, 1]);
  const rotatePhone = useTransform(scrollYProgress, [0.2, 0.4], [10, 0]);

  return (
    <div ref={containerRef} className="bg-[#0A0806] min-h-screen w-full max-w-full selection:bg-[#C9973B] selection:text-black overflow-x-hidden relative">
      <SohrHome
        onAbout={() => setIsAboutOpen(true)}
        onRestaurant={() => setIsRestaurantOpen(true)}
        onDelivery={() => setIsDeliveryOpen(true)}
        supportContact={supportContact}
      />

      {/* --- Full-Screen Interactive About Page --- */}
      <AnimatePresence>
        {isAboutOpen && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 220 }}
            data-lenis-prevent
            className="fixed inset-0 z-[100] w-screen h-screen bg-[#FBF6EA] overflow-y-auto flex flex-col selection:bg-[#B8862F] selection:text-white"
          >
            {/* Ambient Background Lights */}
            <div className="absolute top-0 right-0 w-[50vw] h-[50vw] bg-amber-500/10 rounded-full blur-[140px] pointer-events-none z-0" />
            <div className="absolute bottom-0 left-0 w-[40vw] h-[40vw] bg-orange-400/5 rounded-full blur-[120px] pointer-events-none z-0" />

            {/* Sticky Header */}
            <header className="sticky top-0 w-full z-50 px-6 py-6 md:px-12 lg:px-20 flex items-center justify-between bg-[#FBF6EA]/80 backdrop-blur-md border-b border-slate-200/40 shrink-0">
              <div className="text-2xl font-black text-slate-900 tracking-tighter">
                <span className="flex items-center gap-2.5"><img src="/sohr-logo.jpg" alt="" className="w-9 h-9 rounded-full object-cover ring-1 ring-[#B8862F]/60" /><span style={{ fontFamily: "'Cinzel', serif" }}>SOHR</span></span>
              </div>
              <button
                onClick={() => setIsAboutOpen(false)}
                className="group flex items-center gap-2 bg-slate-900 text-white px-5 py-2.5 rounded-full text-xs font-bold hover:bg-[#B8862F] transition-all duration-300 shadow-md hover:shadow-lg shadow-slate-900/10 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                Back to Home
              </button>
            </header>

            {/* Page Content Container */}
            <main className="flex-1 relative z-10 w-full max-w-[1400px] mx-auto px-6 py-12 md:py-20 lg:px-20 flex flex-col gap-12 md:gap-20">

              {/* Cinematic Page Title */}
              <div className="max-w-3xl space-y-6">
                <span className="inline-flex items-center gap-2 text-[#B8862F] font-bold tracking-widest uppercase text-xs bg-[#B8862F]/10 px-4 py-2 rounded-full">
                  <Sparkles className="w-4 h-4" /> The Movement
                </span>
                <h1 className="text-5xl md:text-7xl font-black leading-[1.05] tracking-tight text-slate-900">
                  Reclaiming Fairness <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-br from-slate-900 to-slate-500 italic font-light">in the Food Ecosystem.</span>
                </h1>
                <p className="text-xl text-slate-600 font-light leading-relaxed">
                  SOHR is built with a mission to create a sustainable, transparent, and balanced environment for both food merchants and consumers across India.
                </p>
              </div>

              {/* Central Blockquote Quote Banner */}
              <div className="bg-slate-900 text-white rounded-[2.5rem] p-8 md:p-14 relative overflow-hidden shadow-2xl shrink-0">
                <div className="absolute top-[-50%] right-[-10%] w-[350px] h-[350px] bg-[#B8862F]/20 rounded-full blur-[90px] pointer-events-none" />
                <div className="relative z-10 space-y-6">
                  <p className="text-2xl md:text-3xl lg:text-4xl font-light leading-relaxed italic text-slate-100 max-w-4xl">
                    "SOHR isn’t just a food delivery app—it’s a movement towards fair business, trust, and transparency."
                  </p>
                  <div className="w-16 h-1 bg-[#B8862F] rounded-full" />
                  <p className="text-xs uppercase tracking-widest font-bold text-slate-400">Our Core Philosophy</p>
                </div>
              </div>

              {/* Dynamic Value Story Grid */}
              <div className="grid md:grid-cols-2 gap-8 lg:gap-12 shrink-0">

                {/* Story Card 1: 0% Commission */}
                <div className="group bg-white border border-slate-200/60 rounded-[2rem] p-8 lg:p-10 hover:shadow-2xl hover:shadow-amber-500/5 hover:-translate-y-1 transition-all duration-500 flex flex-col justify-between">
                  <div>
                    <div className="w-14 h-14 rounded-2xl bg-[#B8862F]/10 flex items-center justify-center text-[#B8862F] mb-6 group-hover:scale-110 transition-transform">
                      <Percent className="w-7 h-7" />
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">Lifetime 0% Commission</h3>
                    <p className="text-slate-600 font-light leading-relaxed">
                      We operate on a lifetime 0% commission model. This ensures that our restaurant partners keep every hard-earned penny of their revenue, giving them the financial breathing room to grow, sustain jobs, and thrive in a digital economy.
                    </p>
                  </div>
                  <div className="mt-8 pt-6 border-t border-slate-100 flex items-center gap-3">
                    <Zap className="w-4 h-4 text-[#B8862F]" />
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">No Hidden Partner Fees</span>
                  </div>
                </div>

                {/* Story Card 2: Transparent Pricing */}
                <div className="group bg-white border border-slate-200/60 rounded-[2rem] p-8 lg:p-10 hover:shadow-2xl hover:shadow-amber-500/5 hover:-translate-y-1 transition-all duration-500 flex flex-col justify-between">
                  <div>
                    <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-500 mb-6 group-hover:scale-110 transition-transform">
                      <Heart className="w-7 h-7" />
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">Trust & Transparent Pricing</h3>
                    <p className="text-slate-600 font-light leading-relaxed">
                      By offering transparent pricing, SOHR ensures customers pay genuine prices without hidden markups. We are building long-term relationships of trust with both restaurants and consumers.
                    </p>
                  </div>
                  <div className="mt-8 pt-6 border-t border-slate-100 flex items-center gap-3">
                    <ShieldCheck className="w-4 h-4 text-orange-500" />
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Honest Pricing Guarantee</span>
                  </div>
                </div>

                {/* Story Card 3: Geographical Expansion */}
                <div className="group bg-white border border-slate-200/60 rounded-[2rem] p-8 lg:p-10 hover:shadow-2xl hover:shadow-amber-500/5 hover:-translate-y-1 transition-all duration-500 flex flex-col justify-between">
                  <div>
                    <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 mb-6 group-hover:scale-110 transition-transform">
                      <MapPin className="w-7 h-7" />
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">Telangana to Tier 2 & 3 Cities</h3>
                    <p className="text-slate-600 font-light leading-relaxed">
                      SOHR is starting its journey from Telangana, with a strategic focus on expanding across Tier 2 and Tier 3 cities in India. We aim to empower local businesses in these growing regions and integrate them into the digital market.
                    </p>
                  </div>
                  <div className="mt-8 pt-6 border-t border-slate-100 flex items-center gap-3">
                    <Map className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Empowering Local Communities</span>
                  </div>
                </div>

                {/* Story Card 4: Two Young Founders */}
                <div className="group bg-white border border-slate-200/60 rounded-[2rem] p-8 lg:p-10 hover:shadow-2xl hover:shadow-amber-500/5 hover:-translate-y-1 transition-all duration-500 flex flex-col justify-between">
                  <div>
                    <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 mb-6 group-hover:scale-110 transition-transform">
                      <Users className="w-7 h-7" />
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">Founded by Visionaries</h3>
                    <p className="text-slate-600 font-light leading-relaxed">
                      SOHR was founded by two passionate 23-year-old entrepreneurs driven by a vision to revolutionize the food delivery industry and create a more balanced, fair, and growth-oriented platform for all stakeholders.
                    </p>
                  </div>
                  <div className="mt-8 pt-6 border-t border-slate-100 flex items-center gap-3">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Innovation Led By Youth</span>
                  </div>
                </div>

              </div>

              {/* Bottom Call to Action */}
              <div className="text-center py-12 md:py-20 border-t border-slate-200/60 flex flex-col items-center gap-6 shrink-0">
                <h3 className="text-3xl md:text-4xl font-black text-slate-900">Be Part of the Movement</h3>
                <p className="text-slate-500 max-w-lg font-light">
                  Support your local neighborhood restaurants. Join SOHR today as a customer or partner and help us create a fair ecosystem.
                </p>
                <div className="flex gap-4 mt-2">
                  <button
                    onClick={() => setIsAboutOpen(false)}
                    className="bg-slate-900 text-white hover:bg-[#B8862F] px-8 py-4 rounded-full font-bold text-sm transition-all duration-300 shadow-md shadow-slate-900/10 cursor-pointer"
                  >
                    Return to Homepage
                  </button>
                </div>
              </div>

            </main>

            {/* Simple Footer */}
            <footer className="bg-slate-50 border-t border-slate-200/50 py-8 text-center text-xs text-slate-400 font-medium shrink-0">
              <p>© {new Date().getFullYear()} SOHR by Vyas Ji. All rights reserved.</p>
            </footer>
          </motion.div>
        )}

        {isRestaurantOpen && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 220 }}
            data-lenis-prevent
            className="fixed inset-0 z-[100] w-screen h-screen bg-[#FAF7F2] overflow-y-auto flex flex-col selection:bg-[#B8862F] selection:text-white"
          >
            {/* Ambient Background Lights - Signature Pink and Warm Amber */}
            <div className="absolute top-0 right-0 w-[50vw] h-[50vw] bg-[#B8862F]/5 rounded-full blur-[140px] pointer-events-none z-0" />
            <div className="absolute bottom-0 left-0 w-[40vw] h-[40vw] bg-orange-400/5 rounded-full blur-[120px] pointer-events-none z-0" />

            {/* Sticky Header */}
            <header className="sticky top-0 w-full z-50 px-4 py-4 md:px-12 lg:px-20 flex items-center justify-between bg-[#FAF7F2]/90 backdrop-blur-md border-b border-slate-200/40 shrink-0">
              <div className="text-xl md:text-2xl font-black text-slate-900 tracking-tighter">
                <span className="flex items-center gap-2.5"><img src="/sohr-logo.jpg" alt="" className="w-9 h-9 rounded-full object-cover ring-1 ring-[#B8862F]/60" /><span style={{ fontFamily: "'Cinzel', serif" }}>SOHR</span></span>
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  onClick={() => document.getElementById("partner-lead-form")?.scrollIntoView({ behavior: "smooth" })}
                  className="group flex items-center gap-1.5 sm:gap-2 bg-[#B8862F]/10 hover:bg-[#B8862F] text-[#B8862F] hover:text-white px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-full text-xs font-bold transition-all duration-300 border border-[#B8862F]/20 cursor-pointer shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Become a Partner</span>
                  <span className="sm:hidden">Join</span>
                </button>
                <button
                  onClick={() => setIsRestaurantOpen(false)}
                  className="group flex items-center gap-1.5 sm:gap-2 bg-slate-900 text-white px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-full text-xs font-bold hover:bg-[#B8862F] transition-all duration-300 shadow-md hover:shadow-lg cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                  <span className="hidden sm:inline">Back to Home</span>
                  <span className="sm:hidden">Back</span>
                </button>
              </div>
            </header>

            {/* Page Content Container */}
            <main className="flex-1 relative z-10 w-full max-w-[1400px] mx-auto px-6 py-12 md:py-20 lg:px-20 flex flex-col gap-12 md:gap-20">

              {/* Cinematic Page Title - Centered Elegant Culinary Accent */}
              <div className="max-w-4xl space-y-6 text-center mx-auto mb-4">
                <span className="inline-flex items-center gap-2 text-[#B8862F] font-black tracking-widest uppercase text-xs bg-[#B8862F]/10 border border-[#B8862F]/20 px-4 py-2 rounded-full">
                  <Store className="w-4 h-4 text-[#B8862F]" /> Restaurant Empowerment Initiative
                </span>
                <h1 className="text-5xl md:text-7xl font-black leading-[1.05] tracking-tight text-slate-900">
                  Earn Commission-Free. <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-br from-[#B8862F] to-[#E02477] font-extrabold italic font-light">Reclaim 100% of Your Revenue.</span>
                </h1>
                <p className="text-xl text-slate-700 font-light leading-relaxed max-w-3xl mx-auto">
                  Say goodbye to standard 25%-30% commissions that wipe out restaurant profit margins. With SOHR, you gain access to a powerful digital ordering system on a <strong>lifetime 0% commission model</strong>.
                </p>
              </div>

              {/* Download CTA Block - Customized as a POS Tablet Terminal Layout */}
              <div className="bg-slate-900 text-white rounded-[2.5rem] p-8 md:p-14 relative overflow-hidden shadow-2xl shrink-0 flex flex-col lg:flex-row items-center gap-12 border border-slate-800">
                <div className="absolute top-[-50%] right-[-10%] w-[350px] h-[350px] bg-[#B8862F]/10 rounded-full blur-[90px] pointer-events-none" />

                <div className="flex-1 space-y-6 relative z-10">
                  <div className="inline-block text-[10px] uppercase tracking-widest font-black text-amber-500 bg-[#B8862F]/10 border border-[#B8862F]/20 px-3 py-1.5 rounded-full">
                    Active Operations: Telangana Region
                  </div>
                  <h2 className="text-3xl md:text-4xl font-black leading-tight tracking-tight">Setup Your Live Digital Kitchen</h2>
                  <p className="text-slate-400 font-light max-w-xl leading-relaxed text-sm md:text-base">
                    Register your business profile, customize your digital menu, and start receiving commission-free orders directly on your phone or tablet in minutes.
                  </p>

                  <div className="flex flex-col sm:flex-row gap-4 pt-2">
                    <a
                      href="https://apps.apple.com/in/app/switcheats-partner/id6766466794"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-3 bg-white text-slate-950 hover:bg-[#B8862F] hover:text-white px-8 py-4 rounded-2xl font-bold transition-all duration-300 text-sm shadow-md cursor-pointer text-center"
                    >
                      <Apple className="w-5 h-5" /> iOS App Store
                    </a>
                    <a
                      href="https://play.google.com/store/apps/details?id=com.switcheats.restaurant1"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-3 bg-slate-800 border border-slate-700 text-white hover:bg-[#B8862F] hover:border-[#B8862F] px-8 py-4 rounded-2xl font-bold transition-all duration-300 text-sm shadow-md cursor-pointer text-center"
                    >
                      <Play className="w-5 h-5" /> Android Play Store
                    </a>
                  </div>
                </div>

                {/* Conceptual POS Tablet Mockup Graphic */}
                <div className="w-full lg:w-[420px] shrink-0 flex justify-center relative z-10">
                  <div className="w-full max-w-[380px] h-[250px] bg-slate-900 border-4 border-slate-700 rounded-2xl shadow-2xl p-4 flex flex-col justify-between relative overflow-hidden">
                    {/* Tablet Top Notch and bezel look */}
                    <div className="absolute top-1 left-1/2 -translate-x-1/2 w-16 h-2 bg-slate-700 rounded-full" />

                    {/* POS Header */}
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2 shrink-0 mt-1">
                      <div className="flex items-center gap-2">
                        <Store className="w-4 h-4 text-[#B8862F]" />
                        <span className="text-[10px] text-white font-bold tracking-wider uppercase">Live POS Terminal</span>
                      </div>
                      <span className="text-[8px] bg-amber-500/10 text-[#B8862F] px-2 py-0.5 rounded-full font-bold uppercase">Online</span>
                    </div>

                    {/* Middle: Comparison metric */}
                    <div className="grid grid-cols-2 gap-3 py-2 flex-1 items-center">
                      <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-center">
                        <div className="text-[8px] text-slate-500 font-bold uppercase tracking-wider">With SOHR</div>
                        <div className="text-sm font-black text-[#B8862F] mt-0.5">₹18,450.00</div>
                        <div className="text-[7px] text-slate-400 mt-0.5">0% Commission Paid</div>
                      </div>
                      <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-center relative opacity-80">
                        <div className="text-[8px] text-slate-500 font-bold uppercase tracking-wider">Traditional Apps</div>
                        <div className="text-sm font-black text-slate-400 mt-0.5 line-through">₹12,915.00</div>
                        <div className="text-[7px] text-[#B8862F] mt-0.5 font-bold">30% Aggregator Cut</div>
                      </div>
                    </div>

                    {/* POS Footer bar */}
                    <div className="bg-[#B8862F] text-white text-[9px] font-black text-center py-2 rounded-lg uppercase tracking-widest shrink-0">
                      Saving ₹5,535.00 Today
                    </div>
                  </div>
                </div>
              </div>

              {/* Partner Benefits 2x2 Grid - Styled with Elegant Champagne Glassmorphism */}
              <div className="grid md:grid-cols-2 gap-8 lg:gap-12 shrink-0">

                {/* Benefit 1 */}
                <div className="group bg-white/80 border border-slate-200/40 rounded-[2rem] p-8 lg:p-10 hover:shadow-2xl hover:shadow-[#B8862F]/5 hover:-translate-y-1 transition-all duration-500 flex flex-col justify-between shadow-sm">
                  <div>
                    <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-[#B8862F] mb-6 group-hover:scale-110 transition-transform">
                      <Percent className="w-7 h-7" />
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">Lifetime 0% Commission</h3>
                    <p className="text-slate-600 font-light leading-relaxed">
                      Every order processed through our platform incurs exactly 0% commission. You keep 100% of your earnings to scale your business, hire culinary talents, and maintain operational margins.
                    </p>
                  </div>
                  <div className="mt-8 pt-6 border-t border-slate-200/50 flex items-center gap-3">
                    <Zap className="w-4 h-4 text-[#B8862F]" />
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Empowering Culinary Businesses</span>
                  </div>
                </div>

                {/* Benefit 2 */}
                <div className="group bg-white/80 border border-slate-200/40 rounded-[2rem] p-8 lg:p-10 hover:shadow-2xl hover:shadow-[#B8862F]/5 hover:-translate-y-1 transition-all duration-500 flex flex-col justify-between shadow-sm">
                  <div>
                    <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-[#B8862F] mb-6 group-hover:scale-110 transition-transform">
                      <Clock className="w-7 h-7" />
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">Instant Daily Settlements</h3>
                    <p className="text-slate-600 font-light leading-relaxed">
                      Say goodbye to frustrating weekly payout cycles that lock up your operating capital. SOHR processes bank settlements daily, keeping your cash flow running smoothly.
                    </p>
                  </div>
                  <div className="mt-8 pt-6 border-t border-slate-200/50 flex items-center gap-3">
                    <ShieldCheck className="w-4 h-4 text-[#B8862F]" />
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Fast Cash Flow Cycle</span>
                  </div>
                </div>

                {/* Benefit 3 */}
                <div className="group bg-white/80 border border-slate-200/40 rounded-[2rem] p-8 lg:p-10 hover:shadow-2xl hover:shadow-[#B8862F]/5 hover:-translate-y-1 transition-all duration-500 flex flex-col justify-between shadow-sm">
                  <div>
                    <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-[#B8862F] mb-6 group-hover:scale-110 transition-transform">
                      <Sparkles className="w-7 h-7" />
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">Live Menu & Pricing Control</h3>
                    <p className="text-slate-600 font-light leading-relaxed">
                      Easily adjust your digital menu in real-time. Switch items on or off, edit prices directly to protect your margins, customize add-ons, and roll out special promotional offers instantly.
                    </p>
                  </div>
                  <div className="mt-8 pt-6 border-t border-slate-200/50 flex items-center gap-3">
                    <Map className="w-4 h-4 text-[#B8862F]" />
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Zero Lag Adjustments</span>
                  </div>
                </div>

                {/* Benefit 4 */}
                <div className="group bg-white/80 border border-slate-200/40 rounded-[2rem] p-8 lg:p-10 hover:shadow-2xl hover:shadow-[#B8862F]/5 hover:-translate-y-1 transition-all duration-500 flex flex-col justify-between shadow-sm">
                  <div>
                    <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-[#B8862F] mb-6 group-hover:scale-110 transition-transform">
                      <TrendingUp className="w-7 h-7" />
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">Deep Customer Analytics</h3>
                    <p className="text-slate-600 font-light leading-relaxed">
                      Know exactly what your customers love. Access user ratings, review order history patterns, track peak delivery hours, and use rich data points to optimize your offerings.
                    </p>
                  </div>
                  <div className="mt-8 pt-6 border-t border-slate-200/50 flex items-center gap-3">
                    <Users className="w-4 h-4 text-[#B8862F]" />
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Data-Driven Growth</span>
                  </div>
                </div>

              </div>

              {/* Bottom Call to Action and Lead Form */}
              <div id="partner-lead-form" className="py-12 md:py-20 border-t border-slate-200/40 shrink-0 max-w-3xl mx-auto w-full">
                <div className="text-center mb-10">
                  <h3 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">Become a Restaurant Partner</h3>
                  <p className="text-slate-600 max-w-lg font-light text-sm md:text-base mx-auto mt-3">
                    Fill out the form below to register your interest, and our onboarding team will contact you to set up your restaurant on SOHR.
                  </p>
                </div>

                {leadSuccess ? (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-[#B8862F]/5 border border-[#B8862F]/20 rounded-3xl p-8 text-center space-y-4"
                  >
                    <div className="w-16 h-16 bg-[#B8862F]/10 rounded-full flex items-center justify-center mx-auto text-[#B8862F]">
                      <Sparkles className="w-8 h-8" />
                    </div>
                    <h4 className="text-xl font-bold text-slate-900">Application Submitted Successfully!</h4>
                    <p className="text-sm text-slate-600 max-w-md mx-auto">
                      Thank you for choosing SOHR. Our onboarding representative will get in touch with you shortly to finalize your registration.
                    </p>
                    <button
                      onClick={() => setLeadSuccess(false)}
                      className="px-6 py-2.5 text-xs font-bold text-[#B8862F] bg-[#B8862F]/10 hover:bg-[#B8862F]/20 transition-all rounded-full"
                    >
                      Submit Another Inquiry
                    </button>
                  </motion.div>
                ) : (
                  <form onSubmit={handleLeadSubmit} className="space-y-5 bg-white border border-slate-200/60 p-6 md:p-10 rounded-[2.5rem] shadow-xl shadow-slate-900/5">
                    <div className="grid md:grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Owner Name</label>
                        <input
                          type="text"
                          required
                          placeholder="Ex: John Doe"
                          value={leadForm.ownerName}
                          onChange={(e) => setLeadForm({ ...leadForm, ownerName: e.target.value })}
                          className="w-full px-5 py-3.5 text-sm rounded-2xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-[#B8862F]/20 focus:border-[#B8862F] transition-all text-slate-800"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Restaurant Name</label>
                        <input
                          type="text"
                          required
                          placeholder="Ex: The Culinary Hub"
                          value={leadForm.restaurantName}
                          onChange={(e) => setLeadForm({ ...leadForm, restaurantName: e.target.value })}
                          className="w-full px-5 py-3.5 text-sm rounded-2xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-[#B8862F]/20 focus:border-[#B8862F] transition-all text-slate-800"
                        />
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Mobile Number</label>
                        <input
                          type="tel"
                          required
                          placeholder="Ex: +91 98765 43210"
                          value={leadForm.mobileNumber}
                          onChange={(e) => setLeadForm({ ...leadForm, mobileNumber: e.target.value })}
                          className="w-full px-5 py-3.5 text-sm rounded-2xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-[#B8862F]/20 focus:border-[#B8862F] transition-all text-slate-800"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Mail ID</label>
                        <input
                          type="email"
                          required
                          placeholder="Ex: partner@domain.com"
                          value={leadForm.emailId}
                          onChange={(e) => setLeadForm({ ...leadForm, emailId: e.target.value })}
                          className="w-full px-5 py-3.5 text-sm rounded-2xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-[#B8862F]/20 focus:border-[#B8862F] transition-all text-slate-800"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Location / Address</label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: Madhapur, Hyderabad, Telangana"
                        value={leadForm.location}
                        onChange={(e) => setLeadForm({ ...leadForm, location: e.target.value })}
                        className="w-full px-5 py-3.5 text-sm rounded-2xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-[#B8862F]/20 focus:border-[#B8862F] transition-all text-slate-800"
                      />
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 pt-4">
                      <button
                        type="submit"
                        disabled={submittingLead}
                        className="flex-1 bg-slate-900 text-white hover:bg-[#B8862F] px-8 py-4 rounded-2xl font-bold text-sm transition-all duration-300 shadow-md cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {submittingLead ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-white" />
                            Registering Your Lead...
                          </>
                        ) : (
                          "Submit Registration Request"
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsRestaurantOpen(false)}
                        className="sm:flex-initial bg-slate-100 hover:bg-slate-200 text-slate-700 px-8 py-4 rounded-2xl font-bold text-sm transition-all duration-300 text-center cursor-pointer"
                      >
                        Return to Homepage
                      </button>
                    </div>
                  </form>
                )}
              </div>

            </main>

            {/* Simple Footer */}
            <footer className="bg-slate-50 border-t border-slate-200/50 py-8 text-center text-xs text-slate-400 font-medium shrink-0">
              <p>© {new Date().getFullYear()} SOHR by Vyas Ji. All rights reserved.</p>
            </footer>
          </motion.div>
        )}

        {isDeliveryOpen && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 220 }}
            data-lenis-prevent
            className="fixed inset-0 z-[100] w-screen h-screen bg-[#07080B] text-slate-100 overflow-y-auto flex flex-col selection:bg-[#B8862F] selection:text-white"
          >
            {/* Ambient Cyberpunk Background Lights - Electric Purple/Indigo and Hot Pink */}
            <div className="absolute top-0 right-0 w-[50vw] h-[50vw] bg-[#B8862F]/5 rounded-full blur-[140px] pointer-events-none z-0" />
            <div className="absolute bottom-0 left-0 w-[40vw] h-[40vw] bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none z-0" />

            {/* Sticky Cyber Header */}
            <header className="sticky top-0 w-full z-50 px-6 py-6 md:px-12 lg:px-20 flex items-center justify-between bg-[#07080B]/90 backdrop-blur-md border-b border-slate-800/80 shrink-0">
              <div className="text-2xl font-black text-white tracking-tighter">
                <span className="flex items-center gap-2.5"><img src="/sohr-logo.jpg" alt="" className="w-9 h-9 rounded-full object-cover ring-1 ring-[#B8862F]/60" /><span style={{ fontFamily: "'Cinzel', serif" }}>SOHR</span></span>
              </div>
              <button
                onClick={() => setIsDeliveryOpen(false)}
                className="group flex items-center gap-2 bg-slate-900 border border-slate-800 text-white px-5 py-2.5 rounded-full text-xs font-bold hover:bg-[#B8862F] hover:border-[#B8862F] transition-all duration-300 shadow-md hover:shadow-lg cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                Back to Home
              </button>
            </header>

            {/* Page Content Container */}
            <main className="flex-1 relative z-10 w-full max-w-[1400px] mx-auto px-6 py-12 md:py-20 lg:px-20 flex flex-col gap-12 md:gap-20">

              {/* Cinematic Page Title - Cyber Centered HUD Accent */}
              <div className="max-w-4xl space-y-6 text-center mx-auto mb-4">
                <span className="inline-flex items-center gap-2 text-[#B8862F] font-black tracking-widest uppercase text-xs bg-[#B8862F]/15 border border-[#B8862F]/30 px-4 py-2 rounded-full animate-pulse">
                  <Bike className="w-4 h-4 text-[#B8862F]" /> Active Captain HUD Dashboard
                </span>
                <h1 className="text-5xl md:text-7xl font-black leading-[1.05] tracking-tight text-white">
                  Drive on Your Terms. <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-br from-[#B8862F] to-indigo-400 font-extrabold italic font-light">Earn More & Cash Out Faster.</span>
                </h1>
                <p className="text-xl text-slate-400 font-light leading-relaxed max-w-3xl mx-auto">
                  Join the elite squad of SOHR Captains. Secure the most competitive distance-based payout structure, absolute route clarity, weekly settlements, and <strong>keep 100% of your customer tips</strong>.
                </p>
              </div>

              {/* Download CTA Block - Customized as a Cyberpunk Navigator Map UI */}
              <div className="bg-slate-950 text-white rounded-[2.5rem] p-8 md:p-14 relative overflow-hidden shadow-2xl shrink-0 flex flex-col lg:flex-row items-center gap-12 border border-slate-900">
                {/* Grid Overlay */}
                <div className="absolute inset-0 bg-[radial-gradient(#ffffff04_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none z-0" />
                <div className="absolute top-[-50%] right-[-10%] w-[350px] h-[350px] bg-indigo-500/10 rounded-full blur-[90px] pointer-events-none" />

                <div className="flex-1 space-y-6 relative z-10">
                  <div className="inline-block text-[10px] uppercase tracking-widest font-black text-[#B8862F] bg-[#B8862F]/10 border border-[#B8862F]/20 px-3 py-1.5 rounded-full">
                    Squad Expanding: Telangana Core Hubs
                  </div>
                  <h2 className="text-3xl md:text-4xl font-black leading-tight tracking-tight">Join the active delivery crew</h2>
                  <p className="text-slate-400 font-light max-w-xl leading-relaxed text-sm md:text-base">
                    Quick onboarding. Setup your profile, upload identification documents, and start accepting dispatch requests with zero hidden deductions.
                  </p>

                  <div className="flex flex-col sm:flex-row gap-4 pt-2">
                    <a
                      href="https://apps.apple.com/in/app/switcheats-captain/id6766778164"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-3 bg-white text-slate-950 hover:bg-[#B8862F] hover:text-white px-8 py-4 rounded-2xl font-bold transition-all duration-300 text-sm shadow-md cursor-pointer text-center"
                    >
                      <Apple className="w-5 h-5" /> iOS App Store
                    </a>
                    <a
                      href="https://play.google.com/store/apps/details?id=com.switcheats.delivery1"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-3 bg-slate-800 border border-slate-800 text-white hover:bg-[#B8862F] hover:border-[#B8862F] px-8 py-4 rounded-2xl font-bold transition-all duration-300 text-sm shadow-md cursor-pointer text-center"
                    >
                      <Play className="w-5 h-5" /> Android Play Store
                    </a>
                  </div>
                </div>

                {/* Conceptual Live Route HUD Mockup */}
                <div className="w-full lg:w-[350px] shrink-0 flex justify-center relative z-10">
                  <div className="w-[260px] h-[340px] bg-slate-900 border-4 border-slate-800 rounded-[2.5rem] shadow-2xl p-4 flex flex-col justify-between relative overflow-hidden">
                    {/* Top Speaker bezel */}
                    <div className="absolute top-1 left-1/2 -translate-x-1/2 w-20 h-3 bg-slate-800 rounded-full" />

                    {/* Active State Header */}
                    <div className="flex items-center justify-between mt-2 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Captain On-Duty</span>
                      </div>
                      <span className="text-[8px] text-[#B8862F] font-black tracking-widest bg-[#B8862F]/15 px-2 py-0.5 rounded border border-[#B8862F]/30">GPS Active</span>
                    </div>

                    {/* Compass/GPS HUD Area */}
                    <div className="bg-slate-950/80 border border-slate-850 rounded-xl p-3 my-2 flex-1 flex flex-col justify-between relative overflow-hidden">
                      <div className="flex items-center justify-between text-[8px] text-slate-400 uppercase tracking-widest">
                        <span>Target Node</span>
                        <span className="text-white font-bold">1.2 km away</span>
                      </div>

                      {/* Fake GPS Path Indicator */}
                      <div className="flex-1 flex items-center justify-center relative my-2">
                        <svg className="w-full h-16" viewBox="0 0 100 40">
                          {/* Dotted target path */}
                          <motion.path
                            d="M10,20 C40,5 60,35 90,20"
                            fill="none"
                            stroke="#B8862F"
                            strokeWidth="2"
                            strokeDasharray="4 4"
                            animate={{ strokeDashoffset: [0, -20] }}
                            transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                          />
                          {/* Point A */}
                          <circle cx="10" cy="20" r="3.5" fill="#4F46E5" />
                          {/* Point B */}
                          <circle cx="90" cy="20" r="3.5" fill="#B8862F" className="animate-pulse" />
                        </svg>
                      </div>

                      <div className="flex items-center justify-between text-[9px]">
                        <span className="text-slate-500 font-medium">Earned This Trip</span>
                        <span className="text-white font-black">₹185.00 + ₹40 Tip</span>
                      </div>
                    </div>

                    {/* Accept Request button */}
                    <div className="bg-gradient-to-r from-[#B8862F] to-indigo-600 text-white text-[10px] font-black text-center py-2.5 rounded-xl uppercase tracking-wider shrink-0 cursor-pointer shadow-lg shadow-amber-500/20">
                      Deliver Order
                    </div>
                  </div>
                </div>
              </div>

              {/* Captain Benefits 2x2 Grid - Cyberpunk Dark Glass cards */}
              <div className="grid md:grid-cols-2 gap-8 lg:gap-12 shrink-0">

                {/* Benefit 1 */}
                <div className="group bg-slate-900/40 border border-slate-800/80 rounded-[2rem] p-8 lg:p-10 hover:shadow-2xl hover:shadow-amber-500/5 hover:border-amber-500/30 hover:-translate-y-1 transition-all duration-500 flex flex-col justify-between">
                  <div>
                    <div className="w-14 h-14 rounded-2xl bg-[#B8862F]/10 border border-[#B8862F]/20 flex items-center justify-center text-[#B8862F] mb-6 group-hover:scale-110 transition-transform">
                      <Heart className="w-7 h-7" />
                    </div>
                    <h3 className="text-2xl font-black text-white mb-3 tracking-tight">Keep 100% Customer Tips</h3>
                    <p className="text-slate-400 font-light leading-relaxed">
                      Every single rupee that a grateful customer tips you belongs entirely to you. SOHR takes zero cuts from your extra rewards. Honest payouts, guaranteed.
                    </p>
                  </div>
                  <div className="mt-8 pt-6 border-t border-slate-800/60 flex items-center gap-3">
                    <Zap className="w-4 h-4 text-[#B8862F]" />
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Respecting Captain Labor</span>
                  </div>
                </div>

                {/* Benefit 2 */}
                <div className="group bg-slate-900/40 border border-slate-800/80 rounded-[2rem] p-8 lg:p-10 hover:shadow-2xl hover:shadow-amber-500/5 hover:border-amber-500/30 hover:-translate-y-1 transition-all duration-500 flex flex-col justify-between">
                  <div>
                    <div className="w-14 h-14 rounded-2xl bg-[#B8862F]/10 border border-[#B8862F]/20 flex items-center justify-center text-[#B8862F] mb-6 group-hover:scale-110 transition-transform">
                      <Clock className="w-7 h-7" />
                    </div>
                    <h3 className="text-2xl font-black text-white mb-3 tracking-tight">Absolute Schedule Freedom</h3>
                    <p className="text-slate-400 font-light leading-relaxed">
                      Work when you want, where you want. No rigid shift systems, no penalty zones. Set your status to active whenever you are ready to earn, and switch off seamlessly.
                    </p>
                  </div>
                  <div className="mt-8 pt-6 border-t border-slate-800/60 flex items-center gap-3">
                    <ShieldCheck className="w-4 h-4 text-[#B8862F]" />
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Flexible Lifestyle First</span>
                  </div>
                </div>

                {/* Benefit 3 */}
                <div className="group bg-slate-900/40 border border-slate-800/80 rounded-[2rem] p-8 lg:p-10 hover:shadow-2xl hover:shadow-amber-500/5 hover:border-amber-500/30 hover:-translate-y-1 transition-all duration-500 flex flex-col justify-between">
                  <div>
                    <div className="w-14 h-14 rounded-2xl bg-[#B8862F]/10 border border-[#B8862F]/20 flex items-center justify-center text-[#B8862F] mb-6 group-hover:scale-110 transition-transform">
                      <TrendingUp className="w-7 h-7" />
                    </div>
                    <h3 className="text-2xl font-black text-white mb-3 tracking-tight">Fast Weekly Wallet Payouts</h3>
                    <p className="text-slate-400 font-light leading-relaxed">
                      Never wait weeks to enjoy your hard-earned rewards. SOHR settles your total earnings straight into your active digital wallet every single week, cleanly and securely.
                    </p>
                  </div>
                  <div className="mt-8 pt-6 border-t border-slate-800/60 flex items-center gap-3">
                    <Map className="w-4 h-4 text-[#B8862F]" />
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Consistent Financial Flow</span>
                  </div>
                </div>

                {/* Benefit 4 */}
                <div className="group bg-slate-900/40 border border-slate-800/80 rounded-[2rem] p-8 lg:p-10 hover:shadow-2xl hover:shadow-amber-500/5 hover:border-amber-500/30 hover:-translate-y-1 transition-all duration-500 flex flex-col justify-between">
                  <div>
                    <div className="w-14 h-14 rounded-2xl bg-[#B8862F]/10 border border-[#B8862F]/20 flex items-center justify-center text-[#B8862F] mb-6 group-hover:scale-110 transition-transform">
                      <Users className="w-7 h-7" />
                    </div>
                    <h3 className="text-2xl font-black text-white mb-3 tracking-tight">Dedicated Captain Care</h3>
                    <p className="text-slate-400 font-light leading-relaxed">
                      Access 24/7 priority support over chat and phone. Our physical hubs across active regions ensure you always have a dedicated, physical place to resolve any concerns.
                    </p>
                  </div>
                  <div className="mt-8 pt-6 border-t border-slate-800/60 flex items-center gap-3">
                    <Users className="w-4 h-4 text-[#B8862F]" />
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Supported Every Mile</span>
                  </div>
                </div>

              </div>

              {/* Bottom Call to Action */}
              <div className="text-center py-12 md:py-20 border-t border-slate-800/80 flex flex-col items-center gap-6 shrink-0">
                <h3 className="text-3xl md:text-4xl font-black text-white">Start Earning with SOHR</h3>
                <p className="text-slate-400 max-w-lg font-light text-sm md:text-base">
                  Get on the road and empower the local neighborhood restaurant ecosystem while securing premium distance-based earnings.
                </p>
                <div className="flex gap-4 mt-2">
                  <button
                    onClick={() => setIsDeliveryOpen(false)}
                    className="bg-slate-900 hover:bg-[#B8862F] text-white border border-slate-800 hover:border-[#B8862F] px-8 py-4 rounded-full font-bold text-sm transition-all duration-300 shadow-md cursor-pointer"
                  >
                    Return to Homepage
                  </button>
                </div>
              </div>

            </main>

            {/* Simple Footer */}
            <footer className="bg-slate-950 border-t border-slate-900 py-8 text-center text-xs text-slate-505 font-medium shrink-0">
              <p>© {new Date().getFullYear()} SOHR by Vyas Ji. All rights reserved.</p>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}