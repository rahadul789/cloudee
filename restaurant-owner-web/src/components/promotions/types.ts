export type VoucherMode = "auto" | "coupon"

export type VoucherType =
  | "flat"
  | "percentage"
  | "bogo"
  | "free-delivery"
  | "threshold-discount"

export type VoucherStatus = "Active" | "Draft"

export type VoucherApplicability = "all" | "categories" | "items"
export type VoucherCreatorType = "owner" | "admin" | "system"
export type VoucherFundingSource = "owner" | "platform" | "shared"
export type VoucherStackingRule = "exclusive" | "stackable"

export type VoucherAnalyticsPoint = {
  label: string
  uses: number
  discount: number
}

export type VoucherAnalytics = {
  totalUses: number
  uniqueUsers: number
  repeatUsage: number
  totalDiscountGiven: number
  totalOrdersUsingVoucher: number
  revenueGenerated: number
  remainingUsage: number | null
  totalDeliveryCostCovered: number
  points: VoucherAnalyticsPoint[]
}

export type Voucher = {
  id: string
  name: string
  code: string
  createdByType: VoucherCreatorType
  createdById: string
  fundedBy: VoucherFundingSource
  stackingRule: VoucherStackingRule
  priority: number
  mode: VoucherMode
  type: VoucherType
  discountValue: number | null
  minimumOrderAmount: number
  maxTotalUses: number | null
  maxUsesPerUser: number
  allowRepeatUsage: boolean
  status: VoucherStatus
  applicability: VoucherApplicability
  categoryIds: string[]
  itemIds: string[]
  startsAt: string
  endsAt: string
  createdAt: string
  updatedAt: string
  analytics: VoucherAnalytics
}

export type VoucherFormState = {
  name: string
  code: string
  mode: VoucherMode
  type: VoucherType
  discountValue: string
  minimumOrderAmount: string
  maxTotalUses: string
  maxUsesPerUser: string
  allowRepeatUsage: boolean
  status: VoucherStatus
  applicability: VoucherApplicability
  categoryIds: string[]
  itemIds: string[]
  startsAt: string
  endsAt: string
}

export type VoucherFormErrors = Record<string, string>

export const initialVouchers: Voucher[] = [
  {
    id: "voucher-01",
    name: "Lunch Rush 80tk Off",
    code: "",
    createdByType: "admin",
    createdById: "admin-foodbela",
    fundedBy: "platform",
    stackingRule: "exclusive",
    priority: 100,
    mode: "auto",
    type: "threshold-discount",
    discountValue: 80,
    minimumOrderAmount: 499,
    maxTotalUses: 500,
    maxUsesPerUser: 1,
    allowRepeatUsage: false,
    status: "Active",
    applicability: "all",
    categoryIds: [],
    itemIds: [],
    startsAt: "2026-04-01T00:00:00.000Z",
    endsAt: "2026-04-30T23:59:59.000Z",
    createdAt: "2026-03-28T09:00:00.000Z",
    updatedAt: "2026-04-09T14:00:00.000Z",
    analytics: {
      totalUses: 186,
      uniqueUsers: 171,
      repeatUsage: 15,
      totalDiscountGiven: 14880,
      totalOrdersUsingVoucher: 186,
      revenueGenerated: 126800,
      remainingUsage: 314,
      totalDeliveryCostCovered: 0,
      points: [
        { label: "Mon", uses: 20, discount: 1600 },
        { label: "Tue", uses: 24, discount: 1920 },
        { label: "Wed", uses: 30, discount: 2400 },
        { label: "Thu", uses: 27, discount: 2160 },
        { label: "Fri", uses: 34, discount: 2720 },
        { label: "Sat", uses: 29, discount: 2320 },
        { label: "Sun", uses: 22, discount: 1760 },
      ],
    },
  },
  {
    id: "voucher-02",
    name: "BKASH50",
    code: "BKASH50",
    createdByType: "owner",
    createdById: "owner-meet-point",
    fundedBy: "owner",
    stackingRule: "exclusive",
    priority: 60,
    mode: "coupon",
    type: "flat",
    discountValue: 50,
    minimumOrderAmount: 300,
    maxTotalUses: 300,
    maxUsesPerUser: 2,
    allowRepeatUsage: true,
    status: "Active",
    applicability: "categories",
    categoryIds: ["cat-01", "cat-05"],
    itemIds: [],
    startsAt: "2026-04-05T00:00:00.000Z",
    endsAt: "2026-05-05T23:59:59.000Z",
    createdAt: "2026-04-04T11:30:00.000Z",
    updatedAt: "2026-04-10T07:45:00.000Z",
    analytics: {
      totalUses: 92,
      uniqueUsers: 74,
      repeatUsage: 18,
      totalDiscountGiven: 4600,
      totalOrdersUsingVoucher: 92,
      revenueGenerated: 58800,
      remainingUsage: 208,
      totalDeliveryCostCovered: 0,
      points: [
        { label: "Mon", uses: 8, discount: 400 },
        { label: "Tue", uses: 12, discount: 600 },
        { label: "Wed", uses: 10, discount: 500 },
        { label: "Thu", uses: 15, discount: 750 },
        { label: "Fri", uses: 18, discount: 900 },
        { label: "Sat", uses: 16, discount: 800 },
        { label: "Sun", uses: 13, discount: 650 },
      ],
    },
  },
  {
    id: "voucher-03",
    name: "Free Delivery Weekend",
    code: "",
    createdByType: "admin",
    createdById: "admin-foodbela",
    fundedBy: "platform",
    stackingRule: "exclusive",
    priority: 90,
    mode: "auto",
    type: "free-delivery",
    discountValue: null,
    minimumOrderAmount: 399,
    maxTotalUses: 250,
    maxUsesPerUser: 1,
    allowRepeatUsage: false,
    status: "Active",
    applicability: "all",
    categoryIds: [],
    itemIds: [],
    startsAt: "2026-04-10T00:00:00.000Z",
    endsAt: "2026-04-20T23:59:59.000Z",
    createdAt: "2026-04-08T10:00:00.000Z",
    updatedAt: "2026-04-10T09:00:00.000Z",
    analytics: {
      totalUses: 41,
      uniqueUsers: 39,
      repeatUsage: 2,
      totalDiscountGiven: 1640,
      totalOrdersUsingVoucher: 41,
      revenueGenerated: 21400,
      remainingUsage: 209,
      totalDeliveryCostCovered: 1640,
      points: [
        { label: "Mon", uses: 3, discount: 120 },
        { label: "Tue", uses: 4, discount: 160 },
        { label: "Wed", uses: 6, discount: 240 },
        { label: "Thu", uses: 5, discount: 200 },
        { label: "Fri", uses: 7, discount: 280 },
        { label: "Sat", uses: 9, discount: 360 },
        { label: "Sun", uses: 7, discount: 280 },
      ],
    },
  },
  {
    id: "voucher-04",
    name: "Buy 1 Get 1 Burger",
    code: "B1G1BURGER",
    createdByType: "owner",
    createdById: "owner-meet-point",
    fundedBy: "owner",
    stackingRule: "exclusive",
    priority: 50,
    mode: "coupon",
    type: "bogo",
    discountValue: null,
    minimumOrderAmount: 0,
    maxTotalUses: 120,
    maxUsesPerUser: 1,
    allowRepeatUsage: false,
    status: "Draft",
    applicability: "items",
    categoryIds: [],
    itemIds: ["item-01", "item-02"],
    startsAt: "2026-04-20T00:00:00.000Z",
    endsAt: "2026-05-01T23:59:59.000Z",
    createdAt: "2026-04-09T17:00:00.000Z",
    updatedAt: "2026-04-10T08:20:00.000Z",
    analytics: {
      totalUses: 0,
      uniqueUsers: 0,
      repeatUsage: 0,
      totalDiscountGiven: 0,
      totalOrdersUsingVoucher: 0,
      revenueGenerated: 0,
      remainingUsage: 120,
      totalDeliveryCostCovered: 0,
      points: [
        { label: "Mon", uses: 0, discount: 0 },
        { label: "Tue", uses: 0, discount: 0 },
        { label: "Wed", uses: 0, discount: 0 },
        { label: "Thu", uses: 0, discount: 0 },
        { label: "Fri", uses: 0, discount: 0 },
        { label: "Sat", uses: 0, discount: 0 },
        { label: "Sun", uses: 0, discount: 0 },
      ],
    },
  },
]

function getLocalDateTimeValue(date = new Date()) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return offsetDate.toISOString().slice(0, 16)
}

export function getInitialVoucherFormState(): VoucherFormState {
  const startsAt = new Date()
  const endsAt = new Date(startsAt.getTime() + 7 * 24 * 60 * 60 * 1000)

  return {
    name: "",
    code: "",
    mode: "coupon",
    type: "flat",
    discountValue: "",
    minimumOrderAmount: "",
    maxTotalUses: "",
    maxUsesPerUser: "1",
    allowRepeatUsage: false,
    status: "Active",
    applicability: "all",
    categoryIds: [],
    itemIds: [],
    startsAt: getLocalDateTimeValue(startsAt),
    endsAt: getLocalDateTimeValue(endsAt),
  }
}

export function getVoucherFormStateFromVoucher(
  voucher: Voucher
): VoucherFormState {
  return {
    name: voucher.name,
    code: voucher.code,
    mode: voucher.mode,
    type: voucher.type,
    discountValue:
      voucher.discountValue === null ? "" : String(voucher.discountValue),
    minimumOrderAmount: String(voucher.minimumOrderAmount),
    maxTotalUses:
      voucher.maxTotalUses === null ? "" : String(voucher.maxTotalUses),
    maxUsesPerUser: String(voucher.maxUsesPerUser),
    allowRepeatUsage: voucher.allowRepeatUsage,
    status: voucher.status,
    applicability: voucher.applicability,
    categoryIds: voucher.categoryIds,
    itemIds: voucher.itemIds,
    startsAt: voucher.startsAt.slice(0, 16),
    endsAt: voucher.endsAt.slice(0, 16),
  }
}

export function getVoucherLifecycleStatus(voucher: Voucher) {
  if (voucher.status === "Draft") return "Draft"

  const now = Date.now()
  const startsAt = new Date(voucher.startsAt).getTime()
  const endsAt = new Date(voucher.endsAt).getTime()

  if (now < startsAt) return "Scheduled"
  if (now > endsAt) return "Expired"
  return "Active"
}

export function getVoucherTypeLabel(type: VoucherType) {
  switch (type) {
    case "flat":
      return "Flat Discount"
    case "percentage":
      return "Percentage Discount"
    case "bogo":
      return "Buy One Get One"
    case "free-delivery":
      return "Free Delivery"
    default:
      return "Threshold Discount"
  }
}

export function getVoucherModeLabel(mode: VoucherMode) {
  return mode === "auto" ? "Auto Applied" : "Coupon Code"
}

export function getVoucherFundingLabel(fundedBy: VoucherFundingSource) {
  if (fundedBy === "platform") return "Platform funded"
  if (fundedBy === "shared") return "Shared funding"
  return "Owner funded"
}

export function formatVoucherDiscount(voucher: Pick<Voucher, "type" | "discountValue">) {
  if (voucher.type === "free-delivery") return "Delivery fee waived"
  if (voucher.type === "bogo") return "BOGO"
  if (voucher.type === "percentage") return `${voucher.discountValue ?? 0}% off`
  return `${Math.round(voucher.discountValue ?? 0).toLocaleString()}tk off`
}
