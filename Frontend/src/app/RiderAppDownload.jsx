import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import {
  ArrowLeft, Bell, Bike, CheckCircle2, Download, MapPin, ShieldCheck, Smartphone, Wallet,
} from "lucide-react"
import { GOLD_TEXT, SERIF, SohrFonts, Ornament } from "./sohrBrand"

// Published by the server next to the APK, so a new app version needs no code change:
// replace the APK in /var/www/downloads and update this file.
const INFO_URL = "/downloads/rider-app.json"
const FALLBACK = { version: "", file: "/downloads/sohr-rider.apk", sizeBytes: 0, sha256: "" }

const formatSize = (bytes) => (bytes ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : "")

const FEATURES = [
  { Icon: Bell, title: "Instant order alerts", text: "Get new delivery requests the moment they come in." },
  { Icon: MapPin, title: "Maps & customer location", text: "Open the customer's shared location in Google Maps." },
  { Icon: Wallet, title: "Cash or online collection", text: "Collect cash or show a UPI QR at the door." },
  { Icon: Bike, title: "Several orders at once", text: "Carry more than one order when the admin batches them." },
]

const STEPS = [
  "Tap Download app and wait for the file to finish downloading.",
  "Open the downloaded file (it's in your Downloads or the notification bar).",
  "If Android asks, allow \"Install unknown apps\" for your browser, then go back and tap Install.",
  "Open SOHR Rider, log in with your phone number, and finish your profile. The admin approves you before you can take orders.",
]

export default function RiderAppDownload() {
  const [info, setInfo] = useState(FALLBACK)
  const [isAndroid, setIsAndroid] = useState(true)

  useEffect(() => {
    setIsAndroid(/android/i.test(navigator.userAgent) || !/iphone|ipad|ipod/i.test(navigator.userAgent))
    let cancelled = false
    fetch(INFO_URL, { cache: "no-cache" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.file) setInfo({ ...FALLBACK, ...data })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    document.title = "Download SOHR Rider app"
  }, [])

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#0A0806] text-[#F3E9D2]" style={{ fontFamily: "'Poppins', sans-serif" }}>
      <SohrFonts />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[700px] w-[700px] max-w-[150vw] -translate-x-1/2 rounded-full bg-[#C9973B]/10 blur-[140px]" />

      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-5 sm:px-8">
        <a href="/" className="flex items-center gap-3">
          <img src="/sohr-logo.jpg" alt="" className="h-11 w-11 rounded-full object-cover ring-1 ring-[#C9973B]/60" />
          <div className="leading-none">
            <p className={`sohr-serif text-2xl font-bold tracking-wide ${GOLD_TEXT}`}>SOHR</p>
            <p className="mt-1 text-[9px] tracking-[0.35em] text-[#C9B48A]">BY VYAS JI</p>
          </div>
        </a>
        <a href="/" className="inline-flex items-center gap-1.5 text-sm text-[#C9B48A] hover:text-[#FBE7A6]">
          <ArrowLeft className="h-4 w-4" /> Home
        </a>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-4 pb-20 sm:px-8">
        <section className="grid items-center gap-10 pt-6 lg:grid-cols-2 lg:pt-12">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="text-center lg:text-left">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#C9973B]/40 bg-[#C9973B]/10 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-[#E0B45A]">
              <Bike className="h-3.5 w-3.5" /> For delivery partners
            </span>
            <h1 className="sohr-serif mt-6 text-4xl font-bold leading-tight sm:text-5xl">
              Deliver with <span className={GOLD_TEXT}>SOHR</span>
            </h1>
            <p className="mx-auto mt-4 max-w-md text-[#BFB091] lg:mx-0">
              Download the SOHR Rider app to receive delivery requests, navigate to customers and collect payments.
            </p>

            <div className="mt-8 flex flex-col items-center gap-3 lg:items-start">
              <a
                href={info.file}
                download
                className="group inline-flex w-full max-w-xs items-center justify-center gap-3 rounded-full bg-gradient-to-b from-[#FBE7A6] via-[#E0B45A] to-[#B8862F] px-8 py-4 text-base font-semibold text-[#1A1206] shadow-[0_10px_40px_-10px_rgba(224,180,90,0.7)] transition hover:brightness-110"
              >
                <Download className="h-5 w-5 transition-transform group-hover:translate-y-0.5" />
                Download app
              </a>
              <p className="text-xs text-[#A8987A]">
                Android app (APK)
                {info.version && <> · Version {info.version}</>}
                {info.sizeBytes ? <> · {formatSize(info.sizeBytes)}</> : null}
              </p>
              {!isAndroid && (
                <p className="max-w-xs rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  This app is for Android phones. Open this page on your Android phone to install it.
                </p>
              )}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
            className="mx-auto flex w-full max-w-sm flex-col items-center rounded-[2rem] border border-[#C9973B]/30 bg-gradient-to-b from-[#17120A] to-[#0E0B07] p-8 text-center shadow-[0_30px_80px_-30px_rgba(201,151,59,0.4)]"
          >
            <img src="/sohr-logo.jpg" alt="SOHR Rider app" className="h-28 w-28 rounded-3xl object-cover ring-2 ring-[#C9973B]/60" />
            <p className={`sohr-serif mt-5 text-2xl font-bold ${GOLD_TEXT}`}>SOHR Rider</p>
            <p className="mt-1 text-xs tracking-[0.25em] text-[#A8987A]">DELIVERY PARTNER APP</p>
            <div className="mt-6 grid w-full grid-cols-2 gap-3 text-left">
              {FEATURES.map(({ Icon, title }) => (
                <div key={title} className="rounded-xl border border-[#C9973B]/15 bg-white/[0.02] p-3">
                  <Icon className="h-4 w-4 text-[#E0B45A]" />
                  <p className="mt-2 text-xs font-medium leading-snug text-[#E8DCC0]">{title}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </section>

        <section className="mt-20">
          <div className="text-center">
            <h2 className="sohr-serif text-3xl font-bold">
              How to <span className={GOLD_TEXT}>install</span>
            </h2>
            <Ornament className="mt-5" />
          </div>
          <ol className="mx-auto mt-10 grid max-w-3xl gap-4">
            {STEPS.map((step, i) => (
              <li key={i} className="flex gap-4 rounded-2xl border border-[#C9973B]/20 bg-white/[0.02] p-5">
                <span className={`sohr-serif text-3xl font-bold leading-none ${GOLD_TEXT}`}>{i + 1}</span>
                <span className="pt-1 text-sm leading-relaxed text-[#E8DCC0]">{step}</span>
              </li>
            ))}
          </ol>
          <p className="mx-auto mt-6 flex max-w-3xl items-start gap-2 text-xs text-[#A8987A]">
            <Smartphone className="mt-0.5 h-4 w-4 shrink-0" />
            Android warns about apps that don&apos;t come from the Play Store. That&apos;s expected for this app; only
            download it from this page (sohr.in).
          </p>
        </section>

        <section className="mx-auto mt-14 grid max-w-3xl gap-4 sm:grid-cols-2">
          {FEATURES.map(({ Icon, title, text }) => (
            <div key={title} className="flex gap-3 rounded-2xl border border-[#C9973B]/15 bg-white/[0.02] p-5">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#E0B45A]" />
              <div>
                <p className="font-semibold text-[#F3E9D2]">{title}</p>
                <p className="mt-1 text-sm text-[#A8987A]">{text}</p>
              </div>
            </div>
          ))}
        </section>

        {info.sha256 && (
          <section className="mx-auto mt-14 max-w-3xl rounded-2xl border border-[#C9973B]/15 bg-black/30 p-5 text-xs text-[#A8987A]">
            <p className="flex items-center gap-2 font-semibold text-[#C9B48A]">
              <ShieldCheck className="h-4 w-4" /> File check
            </p>
            <p className="mt-2">
              Package <span className="font-mono text-[#E8DCC0]">{info.packageName || "com.sohr.delivery"}</span>
              {info.version && <> · version {info.version}</>}
            </p>
            <p className="mt-1 break-all">
              SHA-256 <span className="font-mono text-[#E8DCC0]">{info.sha256}</span>
            </p>
          </section>
        )}

        <p className="mt-14 flex items-center justify-center gap-2 text-center text-xs text-[#7D6F55]">
          <CheckCircle2 className="h-3.5 w-3.5" /> Questions? Contact the SOHR team before installing.
        </p>
      </main>
    </div>
  )
}
