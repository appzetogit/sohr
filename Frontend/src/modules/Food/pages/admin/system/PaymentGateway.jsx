import { useEffect, useState } from "react"
import { CheckCircle2, Copy, CreditCard, Eye, EyeOff, Loader2, Save, ShieldCheck, Wifi, XCircle } from "lucide-react"
import { toast } from "sonner"
import { adminAPI } from "@food/api"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"

const KEY_ID_RE = /^rzp_(test|live)_[A-Za-z0-9]{8,32}$/

function SecretInput({ value, onChange, placeholder, saved }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        placeholder={saved ? "Saved — leave blank to keep it" : placeholder}
        autoComplete="new-password"
        className="h-10 pr-10 font-mono"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
        aria-label={show ? "Hide" : "Show"}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

/**
 * Razorpay keys for collecting payment at the door (rider shows a UPI QR) and for
 * online payments in the app. Super admin only. Secrets are write-only: the page only
 * shows whether one is saved.
 */
export default function PaymentGateway() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [settings, setSettings] = useState(null)
  const [form, setForm] = useState({ enabled: false, keyId: "", keySecret: "", webhookSecret: "" })
  const [error, setError] = useState("")

  const load = async () => {
    setLoading(true)
    try {
      const res = await adminAPI.getPaymentGatewaySettings()
      const data = res?.data?.data || {}
      setSettings(data)
      setForm({ enabled: Boolean(data.enabled), keyId: data.keyId || "", keySecret: "", webhookSecret: "" })
    } catch (err) {
      setError(err?.response?.status === 403 ? "Only a super admin can manage payment settings." : "Could not load payment settings.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const keyIdError = form.keyId && !KEY_ID_RE.test(form.keyId) ? "Key ID starts with rzp_test_ or rzp_live_" : ""
  const mode = form.keyId.startsWith("rzp_live_") ? "live" : form.keyId.startsWith("rzp_test_") ? "test" : ""

  const save = async () => {
    setError("")
    if (keyIdError) return setError(keyIdError)
    if (form.enabled && (!form.keyId || (!form.keySecret && !settings?.hasKeySecret)))
      return setError("Enter the Key ID and Key Secret before turning Razorpay on")
    setSaving(true)
    try {
      const res = await adminAPI.savePaymentGatewaySettings({
        enabled: form.enabled,
        keyId: form.keyId,
        ...(form.keySecret ? { keySecret: form.keySecret } : {}),
        ...(form.webhookSecret ? { webhookSecret: form.webhookSecret } : {}),
      })
      const data = res?.data?.data || {}
      setSettings(data)
      setForm({ enabled: Boolean(data.enabled), keyId: data.keyId || "", keySecret: "", webhookSecret: "" })
      toast.success("Payment settings saved")
    } catch (err) {
      setError(err?.response?.data?.message || "Could not save")
    } finally {
      setSaving(false)
    }
  }

  const testConnection = async () => {
    setError("")
    if (keyIdError) return setError(keyIdError)
    setTesting(true)
    try {
      const res = await adminAPI.testPaymentGatewaySettings({
        keyId: form.keyId,
        ...(form.keySecret ? { keySecret: form.keySecret } : {}),
      })
      toast.success(`Connected to Razorpay (${res?.data?.data?.mode || mode} mode)`)
    } catch (err) {
      toast.error(err?.response?.data?.message || "Connection failed")
    } finally {
      setTesting(false)
    }
  }

  const copy = (text) => {
    navigator.clipboard?.writeText(text).then(() => toast.success("Copied"))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-16 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading…
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <CreditCard className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Payment Gateway</h1>
          <p className="text-sm text-slate-600">
            Razorpay keys used when a rider collects payment online at the door (UPI QR) and for online payments in
            the app. Money goes straight to this Razorpay account.
          </p>
        </div>
      </div>

      {settings && (
        <div
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
            settings.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {settings.enabled ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {settings.enabled
            ? `Online payments are ON (${settings.mode || "?"} mode, key ${settings.keyIdMasked}).`
            : settings.usingServerEnvKeys
              ? "Using keys from the server configuration. Save keys here to manage them from the panel."
              : "Online payments are OFF. Riders can only collect cash."}
        </div>
      )}

      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <label className="flex cursor-pointer items-center justify-between gap-4">
          <span>
            <span className="block font-semibold text-slate-900">Enable Razorpay</span>
            <span className="block text-xs text-slate-500">When off, riders see only the cash option.</span>
          </span>
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
            className="h-5 w-5 accent-emerald-600"
          />
        </label>

        <div className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Key ID</span>
          <Input
            value={form.keyId}
            onChange={(e) => setForm((f) => ({ ...f, keyId: e.target.value.trim() }))}
            placeholder="rzp_live_xxxxxxxxxxxxxx"
            className={`h-10 font-mono ${keyIdError ? "border-red-400" : ""}`}
          />
          {keyIdError ? (
            <span className="text-xs font-medium text-red-600">{keyIdError}</span>
          ) : (
            mode && (
              <span className={`text-xs font-semibold ${mode === "live" ? "text-emerald-700" : "text-amber-700"}`}>
                {mode === "live" ? "Live mode: real money" : "Test mode: no real money moves"}
              </span>
            )
          )}
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Key Secret</span>
          <SecretInput
            value={form.keySecret}
            onChange={(v) => setForm((f) => ({ ...f, keySecret: v }))}
            placeholder="From Razorpay Dashboard → Settings → API Keys"
            saved={settings?.hasKeySecret}
          />
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Webhook secret</span>
          <SecretInput
            value={form.webhookSecret}
            onChange={(v) => setForm((f) => ({ ...f, webhookSecret: v }))}
            placeholder="The secret you set when creating the webhook"
            saved={settings?.hasWebhookSecret}
          />
          <span className="text-[11px] text-slate-500">
            Lets Razorpay confirm payments even if the rider&apos;s app is closed.
          </span>
        </div>

        {error && <p className="text-sm font-medium text-red-600">{error}</p>}

        <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-4">
          <Button variant="outline" onClick={testConnection} disabled={testing || saving}>
            {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wifi className="mr-2 h-4 w-4" />}
            Test connection
          </Button>
          <Button onClick={save} disabled={saving} className="bg-emerald-600 text-white hover:bg-emerald-700">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
        </div>
      </section>

      {settings?.webhookUrl && (
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm sm:p-6">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <ShieldCheck className="h-4 w-4" /> Razorpay webhook setup
          </h2>
          <p className="text-slate-600">
            In Razorpay Dashboard → Settings → Webhooks, add a webhook with this URL, choose a secret, and paste the same
            secret above.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs">
              {settings.webhookUrl}
            </code>
            <Button variant="outline" size="sm" onClick={() => copy(settings.webhookUrl)}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-slate-600">
            Events to tick: <span className="font-mono text-xs">{(settings.webhookEvents || []).join(", ")}</span>
          </p>
          <p className="text-xs text-slate-500">
            For the UPI QR at the door, the QR Codes product must be enabled on your Razorpay account. If it isn&apos;t,
            riders get a Razorpay payment link QR instead, which works the same way for the customer.
          </p>
        </section>
      )}
    </div>
  )
}
