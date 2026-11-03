import { useEffect, useState } from "react"
import { CheckCircle2, Copy, CreditCard, Eye, EyeOff, Loader2, Save, ShieldCheck, Wifi, XCircle } from "lucide-react"
import { toast } from "sonner"
import { adminAPI } from "@food/api"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"

const APP_ID_RE = /^[A-Za-z0-9]{16,64}$/

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
 * Cashfree keys for collecting payment at the door (rider shows a QR) and for online
 * payments in the app. Super admin only. Secrets are write-only: the page only shows
 * whether one is saved.
 */
export default function PaymentGateway() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [settings, setSettings] = useState(null)
  const [form, setForm] = useState({ enabled: false, appId: "", secretKey: "" })
  const [error, setError] = useState("")

  const load = async () => {
    setLoading(true)
    try {
      const res = await adminAPI.getPaymentGatewaySettings()
      const data = res?.data?.data || {}
      setSettings(data)
      setForm({ enabled: Boolean(data.enabled), appId: data.appId || "", secretKey: "" })
    } catch (err) {
      setError(err?.response?.status === 403 ? "Only a super admin can manage payment settings." : "Could not load payment settings.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const appIdError = form.appId && !APP_ID_RE.test(form.appId) ? "App ID looks wrong. Copy it from Cashfree Dashboard → Developers → API Keys" : ""
  const mode = !form.appId ? "" : form.appId.startsWith("TEST") ? "test" : "live"

  const save = async () => {
    setError("")
    if (appIdError) return setError(appIdError)
    if (form.enabled && (!form.appId || (!form.secretKey && !settings?.hasSecretKey)))
      return setError("Enter the App ID and Secret Key before turning Cashfree on")
    setSaving(true)
    try {
      const res = await adminAPI.savePaymentGatewaySettings({
        enabled: form.enabled,
        appId: form.appId,
        ...(form.secretKey ? { secretKey: form.secretKey } : {}),
      })
      const data = res?.data?.data || {}
      setSettings(data)
      setForm({ enabled: Boolean(data.enabled), appId: data.appId || "", secretKey: "" })
      toast.success("Payment settings saved")
    } catch (err) {
      setError(err?.response?.data?.message || "Could not save")
    } finally {
      setSaving(false)
    }
  }

  const testConnection = async () => {
    setError("")
    if (appIdError) return setError(appIdError)
    setTesting(true)
    try {
      const res = await adminAPI.testPaymentGatewaySettings({
        appId: form.appId,
        ...(form.secretKey ? { secretKey: form.secretKey } : {}),
      })
      toast.success(`Connected to Cashfree (${res?.data?.data?.mode || mode} mode)`)
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
            Cashfree keys used when a rider collects payment online at the door (QR) and for online payments in
            the app. Money goes straight to this Cashfree account.
          </p>
        </div>
      </div>

      {settings && (
        <div
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
            settings.enabled || settings.usingServerEnvKeys ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {settings.enabled || settings.usingServerEnvKeys ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {settings.enabled || settings.usingServerEnvKeys
            ? settings.usingServerEnvKeys
              ? `Using keys from the server configuration (${settings.mode} mode, app ID ${settings.appIdMasked}). Save keys here to manage them from the panel.`
              : `Online payments are ON (${settings.mode || "?"} mode, app ID ${settings.appIdMasked}).`
            : "Online payments are OFF. Riders can only collect cash."}
        </div>
      )}

      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <label className="flex cursor-pointer items-center justify-between gap-4">
          <span>
            <span className="block font-semibold text-slate-900">Enable Cashfree</span>
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
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">App ID</span>
          <Input
            value={form.appId}
            onChange={(e) => setForm((f) => ({ ...f, appId: e.target.value.trim() }))}
            placeholder="From Cashfree Dashboard → Developers → API Keys"
            className={`h-10 font-mono ${appIdError ? "border-red-400" : ""}`}
          />
          {appIdError ? (
            <span className="text-xs font-medium text-red-600">{appIdError}</span>
          ) : (
            mode && (
              <span className={`text-xs font-semibold ${mode === "live" ? "text-emerald-700" : "text-amber-700"}`}>
                {mode === "live" ? "Live mode: real money" : "Test mode: no real money moves"}
              </span>
            )
          )}
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Secret Key</span>
          <SecretInput
            value={form.secretKey}
            onChange={(v) => setForm((f) => ({ ...f, secretKey: v }))}
            placeholder="From Cashfree Dashboard → Developers → API Keys"
            saved={settings?.hasSecretKey}
          />
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
            <ShieldCheck className="h-4 w-4" /> Cashfree webhook
          </h2>
          <p className="text-slate-600">
            Payments made here already tell Cashfree to report to this URL, and reports are checked using the Secret Key
            above, so nothing more is needed. You can also add it under Cashfree Dashboard → Developers → Webhooks.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs">
              {settings.webhookUrl}
            </code>
            <Button variant="outline" size="sm" onClick={() => copy(settings.webhookUrl)}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}
