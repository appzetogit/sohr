import { useEffect, useMemo, useState } from "react"
import { Download, Loader2, RefreshCw, Search, Users } from "lucide-react"
import { adminAPI } from "@food/api"
import { toast } from "sonner"

// Marketing buckets, matching the server's riderReport.service.js.
const SEGMENTS = [
  { key: "all", label: "All riders" },
  { key: "active", label: "Active (delivered in last 7 days)" },
  { key: "inactive", label: "Inactive (no delivery in 7 days)" },
  { key: "never", label: "Approved, never delivered" },
  { key: "pending", label: "Waiting for approval" },
  { key: "blocked", label: "Rejected / deactivated" },
]

const SEGMENT_BADGE = {
  active: "bg-emerald-100 text-emerald-700",
  inactive: "bg-amber-100 text-amber-700",
  never: "bg-slate-100 text-slate-600",
  pending: "bg-sky-100 text-sky-700",
  blocked: "bg-red-100 text-red-700",
}

const SEGMENT_LABEL = {
  active: "Active",
  inactive: "Inactive",
  never: "Never delivered",
  pending: "Pending approval",
  blocked: "Blocked",
}

const formatDate = (value) => {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
}

function downloadCsv(rows) {
  const header = ["Name", "Phone", "City", "Status", "Segment", "Online", "Registered", "Last seen", "Last delivery", "Deliveries 7d", "Deliveries 30d", "Total deliveries"]
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`
  const lines = rows.map((r) =>
    [r.name, r.phone, r.city, r.status, SEGMENT_LABEL[r.segment] || r.segment, r.online ? "Yes" : "No", r.registeredAt, r.lastSeenAt, r.lastDeliveredAt, r.deliveries7d, r.deliveries30d, r.totalDeliveries]
      .map(esc)
      .join(","),
  )
  const blob = new Blob([[header.map(esc).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `sohr-riders-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function StatCard({ label, value, hint, onClick, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-4 text-left transition-colors ${
        active ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"
      }`}
    >
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </button>
  )
}

export default function RidersReport() {
  // Blank = every rider. Riders type their own city at sign-up, so a filter can miss
  // someone who left it empty or misspelt it.
  const [city, setCity] = useState("")
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [segment, setSegment] = useState("all")
  const [search, setSearch] = useState("")

  const load = async (cityName = city) => {
    setLoading(true)
    try {
      const res = await adminAPI.getRiderReport(cityName.trim() ? { city: cityName.trim() } : {})
      setReport(res?.data?.data || null)
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load the riders report")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows = useMemo(() => {
    const all = report?.riders || []
    const term = search.trim().toLowerCase()
    return all.filter(
      (r) =>
        (segment === "all" || r.segment === segment) &&
        (!term || [r.name, r.phone].some((v) => String(v || "").toLowerCase().includes(term))),
    )
  }, [report, segment, search])

  const s = report?.summary || {}

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Users className="h-5 w-5 text-emerald-600" /> Riders Report
          </h1>
          <p className="text-sm text-slate-500">
            Who is registered, who is delivering and who has stopped. Use it to plan rider ads and follow-ups.
          </p>
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            load(city)
          }}
        >
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City (blank = all)"
            className="h-10 w-44 rounded-lg border border-slate-300 px-3 text-sm"
          />
          <button type="submit" className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-sm font-medium text-white">
            <RefreshCw className="h-4 w-4" /> Load
          </button>
          <button
            type="button"
            onClick={() => downloadCsv(rows)}
            disabled={!rows.length}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> CSV
          </button>
        </form>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            <StatCard label="Registered" value={s.totalRegistered ?? 0} hint={report?.city ? `in ${report.city}` : "all cities"} onClick={() => setSegment("all")} active={segment === "all"} />
            <StatCard label="Online now" value={s.onlineNow ?? 0} />
            <StatCard label="Active 7d" value={s.active7d ?? 0} onClick={() => setSegment("active")} active={segment === "active"} />
            <StatCard label="Inactive" value={s.inactive ?? 0} hint="no delivery in 7 days" onClick={() => setSegment("inactive")} active={segment === "inactive"} />
            <StatCard label="Never delivered" value={s.neverDelivered ?? 0} onClick={() => setSegment("never")} active={segment === "never"} />
            <StatCard label="Pending approval" value={s.pendingApproval ?? 0} onClick={() => setSegment("pending")} active={segment === "pending"} />
            <StatCard label="Blocked" value={s.blocked ?? 0} onClick={() => setSegment("blocked")} active={segment === "blocked"} />
            <StatCard label="Joined 7d" value={s.joinedLast7d ?? 0} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={segment}
              onChange={(e) => setSegment(e.target.value)}
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              {SEGMENTS.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or phone"
                className="h-10 w-56 rounded-lg border border-slate-300 pl-9 pr-3 text-sm"
              />
            </div>
            <span className="text-sm text-slate-500">{rows.length} rider{rows.length === 1 ? "" : "s"}</span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Rider</th>
                  <th className="px-4 py-3">City</th>
                  <th className="px-4 py-3">Segment</th>
                  <th className="px-4 py-3">Registered</th>
                  <th className="px-4 py-3">Last seen</th>
                  <th className="px-4 py-3">Last delivery</th>
                  <th className="px-4 py-3 text-right">7d</th>
                  <th className="px-4 py-3 text-right">30d</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                      No riders in this group.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${r.online ? "bg-emerald-500" : "bg-slate-300"}`} title={r.online ? "Online" : "Offline"} />
                          <div>
                            <p className="font-semibold text-slate-900">{r.name || "Unnamed"}</p>
                            <a href={`tel:${r.phone}`} className="text-xs text-slate-500 hover:underline">
                              {r.phone}
                            </a>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{r.city || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${SEGMENT_BADGE[r.segment] || ""}`}>
                          {SEGMENT_LABEL[r.segment] || r.segment}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(r.registeredAt)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(r.lastSeenAt)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(r.lastDeliveredAt)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.deliveries7d}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.deliveries30d}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">{r.totalDeliveries}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
