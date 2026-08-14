import { useEffect, useMemo, useState } from "react"
import { Bike, Loader2, Search, Send } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@food/components/ui/dialog"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { Textarea } from "@food/components/ui/textarea"
import { adminAPI } from "@food/api"

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash on delivery" },
  { value: "razorpay_qr", label: "QR / UPI on delivery" },
  { value: "razorpay", label: "Paid online" },
  { value: "wallet", label: "Wallet" },
]

const emptyForm = {
  customerName: "",
  customerPhone: "",
  street: "",
  city: "",
  state: "",
  zipCode: "",
  amount: "",
  paymentMethod: "cash",
  riderEarning: "",
  deliveryInstructions: "",
}

/** Prefill from what the order already knows, so the admin only corrects what's wrong. */
function formFromOrder(order) {
  const address = order?.deliveryAddress || order?.address || {}
  return {
    customerName: order?.customerName === "N/A" ? "" : order?.customerName || "",
    customerPhone: order?.customerPhone === "N/A" ? "" : order?.customerPhone || "",
    street: address?.street || "",
    city: address?.city || "",
    state: address?.state || "",
    zipCode: address?.zipCode || "",
    amount:
      order?.pricing?.total != null
        ? String(order.pricing.total)
        : order?.totalAmount != null
          ? String(order.totalAmount)
          : "",
    paymentMethod: order?.payment?.method || "cash",
    riderEarning: order?.riderEarning != null ? String(order.riderEarning) : "",
    deliveryInstructions: order?.deliveryInstructions || "",
  }
}

function Field({ label, children, className = "" }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
        {label}
      </span>
      {children}
    </label>
  )
}

export default function AssignDeliveryModal({
  isOpen,
  onOpenChange,
  order,
  onAssign,
  isSubmitting = false,
}) {
  const [form, setForm] = useState(emptyForm)
  const [partners, setPartners] = useState([])
  const [isLoadingPartners, setIsLoadingPartners] = useState(false)
  const [partnerSearch, setPartnerSearch] = useState("")
  const [selectedPartnerId, setSelectedPartnerId] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    if (!isOpen || !order) return
    setForm(formFromOrder(order))
    setSelectedPartnerId("")
    setPartnerSearch("")
    setError("")
  }, [isOpen, order])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false

    const loadPartners = async () => {
      setIsLoadingPartners(true)
      try {
        const response = await adminAPI.getDeliveryPartners({ limit: 1000, page: 1 })
        const rows =
          response?.data?.data?.deliveryPartners ||
          response?.data?.deliveryPartners ||
          []
        if (!cancelled) setPartners(Array.isArray(rows) ? rows : [])
      } catch {
        if (!cancelled) setPartners([])
      } finally {
        if (!cancelled) setIsLoadingPartners(false)
      }
    }

    loadPartners()
    return () => {
      cancelled = true
    }
  }, [isOpen])

  // Online riders first: an offline rider can still be assigned (the push wakes them)
  // but is the worse pick, so it should never be the one sitting at the top.
  const visiblePartners = useMemo(() => {
    const term = partnerSearch.trim().toLowerCase()
    return partners
      .filter((partner) => {
        if (!term) return true
        return [partner.name, partner.phone, partner.zone, partner.deliveryId]
          .map((value) => String(value || "").toLowerCase())
          .some((value) => value.includes(term))
      })
      .sort((a, b) => Number(Boolean(b.isOnline)) - Number(Boolean(a.isOnline)))
  }, [partners, partnerSearch])

  const setField = (key) => (event) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }))

  const handleSubmit = () => {
    if (!selectedPartnerId) {
      setError("Select a delivery partner to assign this order to")
      return
    }
    if (!String(form.customerPhone).trim()) {
      setError("Customer phone is required — the rider has to be able to call")
      return
    }
    if (!String(form.street).trim()) {
      setError("Delivery address is required")
      return
    }

    setError("")
    onAssign({
      deliveryPartnerId: selectedPartnerId,
      orderDetails: {
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        address: {
          street: form.street,
          city: form.city,
          state: form.state,
          zipCode: form.zipCode,
        },
        amount: form.amount === "" ? undefined : form.amount,
        paymentMethod: form.paymentMethod,
        riderEarning: form.riderEarning === "" ? undefined : form.riderEarning,
        deliveryInstructions: form.deliveryInstructions,
      },
    })
  }

  if (!order) return null

  return (
    <Dialog open={isOpen} onOpenChange={(next) => !isSubmitting && onOpenChange(next)}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Bike className="w-5 h-5 text-emerald-600" />
            Assign delivery partner
          </DialogTitle>
          <DialogDescription className="text-slate-600">
            Order <span className="font-semibold">{order.orderId}</span> — check the
            details, then pick who delivers it. The request goes straight to that
            partner.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-slate-800">Order details</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Customer name">
                <Input value={form.customerName} onChange={setField("customerName")} />
              </Field>
              <Field label="Customer phone">
                <Input value={form.customerPhone} onChange={setField("customerPhone")} />
              </Field>
              <Field label="Delivery address" className="sm:col-span-2">
                <Input value={form.street} onChange={setField("street")} />
              </Field>
              <Field label="City">
                <Input value={form.city} onChange={setField("city")} />
              </Field>
              <Field label="State">
                <Input value={form.state} onChange={setField("state")} />
              </Field>
              <Field label="Amount to collect (₹)">
                <Input
                  type="number"
                  min="0"
                  value={form.amount}
                  onChange={setField("amount")}
                />
              </Field>
              <Field label="Payment method">
                <select
                  value={form.paymentMethod}
                  onChange={setField("paymentMethod")}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-neutral-900"
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method.value} value={method.value}>
                      {method.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Rider payout (₹)">
                <Input
                  type="number"
                  min="0"
                  value={form.riderEarning}
                  onChange={setField("riderEarning")}
                  placeholder="Auto"
                />
              </Field>
              <Field label="Instructions for the rider" className="sm:col-span-2">
                <Textarea
                  rows={2}
                  value={form.deliveryInstructions}
                  onChange={setField("deliveryInstructions")}
                  placeholder="Landmark, gate number, call before arriving…"
                />
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-800">
                Delivery partners
                {visiblePartners.length > 0 && (
                  <span className="ml-2 text-xs font-medium text-slate-500">
                    {visiblePartners.filter((p) => p.isOnline).length} online
                  </span>
                )}
              </h3>
              <div className="relative w-56">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={partnerSearch}
                  onChange={(event) => setPartnerSearch(event.target.value)}
                  placeholder="Search name or phone"
                  className="pl-8"
                />
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
              {isLoadingPartners ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading partners…
                </div>
              ) : visiblePartners.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-500">
                  No approved delivery partners found.
                </div>
              ) : (
                visiblePartners.map((partner) => {
                  const id = String(partner._id || partner.id)
                  const isSelected = selectedPartnerId === id
                  return (
                    <label
                      key={id}
                      className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors ${
                        isSelected ? "bg-emerald-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="delivery-partner"
                        value={id}
                        checked={isSelected}
                        onChange={() => setSelectedPartnerId(id)}
                        className="h-4 w-4 accent-emerald-600"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-slate-800">
                            {partner.name || "Unnamed partner"}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              partner.isOnline
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {partner.isOnline ? "Online" : "Offline"}
                          </span>
                          {/* A rider with no push token cannot be woken — dispatch is
                              blind to them, so say it here rather than in the logs. */}
                          {partner.hasPushToken === false && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">
                              No app alerts
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-500">
                          {[partner.phone, partner.vehicleType, partner.zone]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>
                    </label>
                  )
                })
              )}
            </div>
          </section>

          {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedPartnerId}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Assign &amp; send request
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
