import { useState, useEffect, useRef } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { motion, useReducedMotion } from "framer-motion"
import { adminAPI } from "@food/api"
import { setAuthData } from "@food/utils/auth"
import { loadBusinessSettings } from "@food/utils/businessSettings"
import { useCompanyName } from "@food/hooks/useCompanyName"
import { Eye, EyeOff, Shield, Loader2, Mail, Lock } from "lucide-react"
import quickSpicyLogo from "@food/assets/sohr-logo.jpg"
import { GOLD_TEXT, SohrFonts, Ornament, RotatingSeal } from "@/app/sohrBrand"

const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


export default function AdminLogin() {
  const navigate = useNavigate()
  const location = useLocation()
  const companyName = useCompanyName()
  const prefersReducedMotion = useReducedMotion()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [logoUrl, setLogoUrl] = useState(quickSpicyLogo)
  const submittingRef = useRef(false)

  useEffect(() => {
    const message = location.state?.message
    if (message) {
      setSuccessMessage(message)
      window.history.replaceState({}, document.title, location.pathname)
    }
  }, [location.state?.message, location.pathname])

  useEffect(() => {
    const applyLogo = async () => {
      try {
        const settings = await loadBusinessSettings()
        if (settings?.logo?.url) {
          setLogoUrl(settings.logo.url)
        }
      } catch (err) {
        debugWarn("Failed to load business settings:", err)
      }
    }
    applyLogo()
    window.addEventListener("businessSettingsUpdated", applyLogo)
    return () => window.removeEventListener("businessSettingsUpdated", applyLogo)
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")
    setSuccessMessage("")
    if (submittingRef.current) return

    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setError("Email is required")
      return
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(trimmedEmail)) {
      setError("Please enter a valid email address")
      return
    }
    if (!password) {
      setError("Password is required")
      return
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters")
      return
    }

    submittingRef.current = true
    setIsLoading(true)

    try {
      const response = await adminAPI.login(trimmedEmail, password)
      const data = response?.data?.data || response?.data || {}

      const accessToken = data.accessToken
      const adminUser = data.user || data.admin
      const refreshToken = data.refreshToken ?? null

      if (!accessToken || !adminUser) {
        throw new Error("Invalid response from server")
      }
      if (!refreshToken) {
        throw new Error("Invalid response from server: missing refresh token")
      }
      setAuthData("admin", accessToken, adminUser, refreshToken)
      navigate("/admin/food", { replace: true })
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Login failed. Please check your credentials."
      setError(message)
    } finally {
      setIsLoading(false)
      submittingRef.current = false
    }
  }

  const formMotion = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.35, ease: "easeOut" },
      }

  const inputClass =
    "h-12 w-full rounded-xl border border-[#C9973B]/25 bg-white/[0.03] pl-11 pr-4 text-sm text-[#F3E9D2] placeholder:text-[#7D6F55] outline-none transition focus:border-[#E0B45A] focus:bg-white/[0.05] focus:ring-2 focus:ring-[#E0B45A]/20 disabled:opacity-60"

  return (
    <div className="relative flex min-h-[100dvh] overflow-hidden bg-[#0A0806] text-[#F3E9D2]" style={{ fontFamily: "'Poppins', sans-serif" }}>
      <SohrFonts />

      {/* Left — brand panel */}
      <div className="relative hidden lg:flex lg:w-1/2 flex-col items-center justify-center overflow-hidden border-r border-[#C9973B]/15 bg-gradient-to-b from-[#120E08] to-[#0A0806] px-12">
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[700px] w-[700px] -translate-x-1/2 rounded-full bg-[#C9973B]/10 blur-[140px]" />
        <RotatingSeal className="w-[380px] h-[380px] xl:w-[440px] xl:h-[440px]" />
        <p className="sohr-hindi relative mt-10 text-center text-2xl text-[#F3E9D2]">
          व्यास जी के हाथों से बना हुआ <span className={`sohr-serif font-bold ${GOLD_TEXT}`}>Tasty</span> खाना
        </p>
        <Ornament className="relative mt-6" />
      </div>

      {/* Right — form */}
      <div className="relative flex w-full flex-col lg:w-1/2">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-[#C9973B]/10 blur-[120px] lg:hidden" />

        <div className="relative flex flex-1 items-center justify-center px-4 py-10 sm:px-10">
          <motion.div {...formMotion} className="w-full max-w-[400px]">
            {/* Header */}
            <div className="mb-8 text-center">
              <img
                src={logoUrl}
                alt={`${companyName} logo`}
                className="mx-auto h-20 w-20 rounded-full object-cover ring-2 ring-[#C9973B]/60 shadow-[0_10px_40px_-10px_rgba(224,180,90,0.6)]"
                onError={(e) => {
                  if (e.target.src !== quickSpicyLogo) {
                    e.target.src = quickSpicyLogo
                  }
                }}
              />
              <p className={`sohr-serif mt-5 text-4xl font-bold tracking-wide ${GOLD_TEXT}`}>SOHR</p>
              <p className="sohr-serif mt-1 text-[10px] tracking-[0.4em] text-[#C9B48A]">BY VYAS JI</p>
              <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#C9973B]/40 bg-[#C9973B]/10 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-[#E0B45A]">
                <Shield className="h-3.5 w-3.5" aria-hidden="true" /> Admin Portal
              </div>
              <h1 className="sohr-serif mt-5 text-2xl font-semibold text-[#F3E9D2]">Welcome back</h1>
              <p className="mt-1.5 text-sm text-[#A8987A]">Sign in to manage your kitchen and orders</p>
            </div>

            {/* Form card */}
            <div className="rounded-3xl border border-[#C9973B]/25 bg-gradient-to-b from-[#17120A] to-[#0E0B07] p-6 shadow-[0_30px_80px_-30px_rgba(201,151,59,0.35)] sm:p-8">
              <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                {successMessage && (
                  <div role="status" className="rounded-xl border border-[#C9973B]/30 bg-[#C9973B]/10 px-4 py-3 text-sm text-[#FBE7A6]">
                    {successMessage}
                  </div>
                )}
                {error && (
                  <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <label htmlFor="email" className="text-xs font-medium uppercase tracking-[0.2em] text-[#C9B48A]">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#C9973B]" aria-hidden="true" />
                    <input
                      id="email"
                      type="email"
                      placeholder="admin@sohr.in"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isLoading}
                      autoComplete="off"
                      required
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="password" className="text-xs font-medium uppercase tracking-[0.2em] text-[#C9B48A]">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#C9973B]" aria-hidden="true" />
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isLoading}
                      autoComplete="new-password"
                      required
                      className={`${inputClass} pr-12 [&::-ms-reveal]:hidden [&::-webkit-password-reveal-button]:hidden`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-[#A8987A] transition-colors hover:text-[#FBE7A6] focus-visible:outline-none"
                      disabled={isLoading}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => navigate("/admin/forgot-password")}
                    className="cursor-pointer text-sm font-medium text-[#E0B45A] transition-colors hover:text-[#FBE7A6] hover:underline focus-visible:outline-none"
                    disabled={isLoading}
                  >
                    Forgot password?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-gradient-to-b from-[#FBE7A6] via-[#E0B45A] to-[#B8862F] text-sm font-semibold text-[#1A1206] shadow-[0_10px_40px_-10px_rgba(224,180,90,0.7)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E0B45A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0806] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Signing in...
                    </>
                  ) : (
                    "Sign in"
                  )}
                </button>
              </form>
            </div>

            <p className="mt-6 text-center text-xs text-[#7D6F55]">
              Protected admin access &middot; SOHR by Vyas Ji
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
