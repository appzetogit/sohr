// Run: node --test src/modules/Food/components/admin/orders/manualOrderValidation.test.js
import test from "node:test"
import assert from "node:assert/strict"
import { validateManualOrder, normalizeIndianMobile } from "./manualOrderValidation.js"

const validForm = {
  restaurantId: "6ace26279233758a365aeb1f",
  customerName: "Om Parteki",
  customerPhone: "98765 43210",
  street: "12 Tashkent Marg, Civil Lines",
  city: "Prayagraj",
  state: "Uttar Pradesh",
  zipCode: "211001",
  deliveryInstructions: "",
  amount: "198",
  riderEarning: "",
}
const validCart = [{ key: "a", name: "Stuffed Kulcha", qty: 2, price: 99 }]

test("a complete order has no errors", () => {
  assert.deepEqual(validateManualOrder(validForm, validCart), {})
})

test("every required field is reported, not just the first", () => {
  const errors = validateManualOrder({ amount: "" }, [])
  for (const key of ["restaurantId", "customerName", "customerPhone", "street", "city", "state", "items", "amount"]) {
    assert.ok(errors[key], `${key} should be flagged`)
  }
})

test("phone: Indian mobiles in common formats pass, the rest fail", () => {
  for (const ok of ["9876543210", "+91 98765 43210", "091-9876543210", "09876543210"]) {
    assert.equal(normalizeIndianMobile(ok), "9876543210", ok)
  }
  for (const bad of ["12345", "5876543210", "2929392939292929239", "abc"]) {
    assert.ok(validateManualOrder({ ...validForm, customerPhone: bad }, validCart).customerPhone, bad)
  }
})

test("names, city, state, address and pin code are checked", () => {
  const check = (patch, key) => assert.ok(validateManualOrder({ ...validForm, ...patch }, validCart)[key], key)
  check({ customerName: "A" }, "customerName")
  check({ customerName: "fgdsuigui1" }, "customerName")
  check({ city: "34235" }, "city")
  check({ state: "" }, "state")
  check({ street: "abc" }, "street")
  check({ zipCode: "34235" }, "zipCode")
  check({ zipCode: "012345" }, "zipCode")
  assert.deepEqual(validateManualOrder({ ...validForm, zipCode: "" }, validCart), {}, "pin code is optional")
  assert.deepEqual(validateManualOrder({ ...validForm, customerName: "व्यास जी" }, validCart), {})
})

test("item lines: quantity 1-99 and custom items need a price", () => {
  const errors = validateManualOrder(validForm, [
    { key: "a", name: "Naan", qty: 0, price: 79 },
    { key: "b", name: "Extra chutney", qty: 1, price: null },
    { key: "c", name: "Dal", qty: 2, price: 199 },
  ])
  assert.ok(errors["item:a"])
  assert.ok(errors["item:b"])
  assert.equal(errors["item:c"], undefined)
  assert.ok(errors.items)
})

test("amount must be positive and payout sensible", () => {
  assert.ok(validateManualOrder({ ...validForm, amount: "0" }, validCart).amount)
  assert.ok(validateManualOrder({ ...validForm, amount: "-5" }, validCart).amount)
  assert.ok(validateManualOrder({ ...validForm, riderEarning: "-1" }, validCart).riderEarning)
  assert.ok(validateManualOrder({ ...validForm, riderEarning: "9000" }, validCart).riderEarning)
  assert.deepEqual(validateManualOrder({ ...validForm, riderEarning: "40" }, validCart), {})
})

test("location link: optional, but must be a Google Maps link", async () => {
  const { isGoogleMapsLink } = await import("./manualOrderValidation.js")
  assert.deepEqual(validateManualOrder({ ...validForm, locationLink: "" }, validCart), {})
  for (const ok of ["https://maps.app.goo.gl/AbC123", "https://maps.google.com/?q=25.45,81.83", "https://www.google.com/maps/@25.4,81.8,17z"]) {
    assert.equal(isGoogleMapsLink(ok), true, ok)
    assert.deepEqual(validateManualOrder({ ...validForm, locationLink: ok }, validCart), {})
  }
  for (const bad of ["https://evil.example/maps", "https://www.google.com/search?q=x", "hello", "javascript:alert(1)"]) {
    assert.ok(validateManualOrder({ ...validForm, locationLink: bad }, validCart).locationLink, bad)
  }
})
