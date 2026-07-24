export type PayoutStatus = "pending" | "processing" | "completed" | "failed"
export type PayoutMethodType = "bank" | "bkash"
export type TransactionType = "earning" | "payout" | "refund"
export type TransactionSettlementStatus = "pending" | "available" | "paid_out"

export type PayoutMethod = {
  id: string
  type: PayoutMethodType
  accountName: string
  accountNumber: string
  bankName?: string
  branchName?: string
  isVerified?: boolean
  verifiedAt?: string | null
  pendingAccountName?: string
  pendingAccountNumber?: string
  pendingVerificationStatus?: "otp_pending" | "admin_pending" | "rejected" | null
  pendingVerifiedAt?: string | null
  pendingAdminNote?: string
  verificationSource?: "onboarding" | "settings" | "payouts" | null
}

export type Payout = {
  id: string
  amount: number
  status: PayoutStatus
  method: PayoutMethodType
  batchReference?: string
  transactionId: string
  providerReference?: string
  providerPayoutId?: string
  paymentProofUrl?: string
  processingNote?: string
  createdAt: string
  processedAt: string | null
  failureReason?: string | null
}

export type EarningTransaction = {
  id: string
  orderId: string
  orderNumber: string
  type: TransactionType
  payoutId?: string | null
  ledgerGroupId?: string
  orderStatus?: string
  paymentMethod?: string
  paymentStatus?: string
  grossAmount: number
  commission: number
  discountCost: number
  deliveryCost: number
  netAmount: number
  status: TransactionSettlementStatus
  adjustmentType?: "earning" | "refund" | "payout"
  createdAt: string
  deliveredAt?: string | null
  settlementAvailableAt: string
}

export const settlementDelayDays = 3

export function formatPayoutMoney(amount: number) {
  return `${Math.round(amount).toLocaleString()}tk`
}

export function getPayoutStatusLabel(status: PayoutStatus) {
  if (status === "pending") return "Pending"
  if (status === "processing") return "Processing"
  if (status === "completed") return "Completed"
  return "Failed"
}

export function getTransactionTypeLabel(type: TransactionType) {
  if (type === "earning") return "Earning"
  if (type === "payout") return "Payout"
  return "Refund"
}

export const initialPayoutMethod: PayoutMethod = {
  id: "method-01",
  type: "bkash",
  accountName: "Meet Point",
  accountNumber: "01712345678",
  bankName: "",
  branchName: "",
  isVerified: true,
  verifiedAt: "2026-03-01T11:00:00.000Z",
  pendingAccountName: "",
  pendingAccountNumber: "",
  pendingVerificationStatus: null,
  pendingVerifiedAt: null,
  pendingAdminNote: "",
  verificationSource: null,
}

export const initialPayouts: Payout[] = [
  {
    id: "payout-01",
    amount: 15240,
    status: "completed",
    method: "bank",
    batchReference: "BATCH-2026-04-03-01",
    transactionId: "TXN-783451",
    createdAt: "2026-04-03T10:15:00.000Z",
    processedAt: "2026-04-03T16:45:00.000Z",
  },
  {
    id: "payout-02",
    amount: 12850,
    status: "completed",
    method: "bkash",
    batchReference: "BATCH-2026-03-27-01",
    transactionId: "TXN-772209",
    createdAt: "2026-03-27T09:45:00.000Z",
    processedAt: "2026-03-27T12:35:00.000Z",
  },
  {
    id: "payout-03",
    amount: 9200,
    status: "processing",
    method: "bank",
    batchReference: "BATCH-2026-04-10-01",
    transactionId: "TXN-790110",
    createdAt: "2026-04-10T08:20:00.000Z",
    processedAt: null,
  },
  {
    id: "payout-04",
    amount: 6100,
    status: "failed",
    method: "bkash",
    batchReference: "BATCH-2026-03-18-01",
    transactionId: "TXN-761004",
    createdAt: "2026-03-18T11:00:00.000Z",
    processedAt: null,
    failureReason: "Recipient wallet name did not match the registered account details.",
  },
]

export const initialEarningTransactions: EarningTransaction[] = [
  {
    id: "txn-01",
    orderId: "order-01",
    orderNumber: "FB-2401",
    type: "earning",
    grossAmount: 505,
    ledgerGroupId: "ledger-order-01",
    commission: 75,
    discountCost: 10,
    deliveryCost: 0,
    netAmount: 420,
    status: "pending",
    adjustmentType: "earning",
    createdAt: "2026-04-11T08:05:00.000Z",
    settlementAvailableAt: "2026-04-14T00:00:00.000Z",
  },
  {
    id: "txn-02",
    orderId: "order-02",
    orderNumber: "FB-2402",
    type: "earning",
    grossAmount: 390,
    ledgerGroupId: "ledger-order-02",
    commission: 58,
    discountCost: 0,
    deliveryCost: 0,
    netAmount: 332,
    status: "pending",
    adjustmentType: "earning",
    createdAt: "2026-04-11T07:58:00.000Z",
    settlementAvailableAt: "2026-04-14T00:00:00.000Z",
  },
  {
    id: "txn-03",
    orderId: "order-06",
    orderNumber: "FB-2399",
    type: "earning",
    grossAmount: 550,
    ledgerGroupId: "ledger-order-06",
    commission: 82,
    discountCost: 15,
    deliveryCost: 0,
    netAmount: 453,
    status: "available",
    adjustmentType: "earning",
    createdAt: "2026-04-08T05:50:00.000Z",
    settlementAvailableAt: "2026-04-11T00:00:00.000Z",
  },
  {
    id: "txn-04",
    orderId: "order-08",
    orderNumber: "FB-2397",
    type: "refund",
    grossAmount: 300,
    ledgerGroupId: "ledger-order-08",
    commission: 0,
    discountCost: 10,
    deliveryCost: 0,
    netAmount: -290,
    status: "paid_out",
    adjustmentType: "refund",
    createdAt: "2026-04-08T04:50:00.000Z",
    settlementAvailableAt: "2026-04-08T04:50:00.000Z",
  },
  {
    id: "txn-05",
    orderId: "order-05",
    orderNumber: "FB-2405",
    type: "earning",
    grossAmount: 775,
    ledgerGroupId: "ledger-order-05",
    commission: 116,
    discountCost: 25,
    deliveryCost: 12,
    netAmount: 622,
    status: "available",
    adjustmentType: "earning",
    createdAt: "2026-04-07T06:55:00.000Z",
    settlementAvailableAt: "2026-04-10T00:00:00.000Z",
  },
  {
    id: "txn-06",
    orderId: "order-04",
    orderNumber: "FB-2404",
    type: "earning",
    grossAmount: 420,
    ledgerGroupId: "ledger-order-04",
    commission: 63,
    discountCost: 0,
    deliveryCost: 0,
    netAmount: 357,
    status: "paid_out",
    adjustmentType: "earning",
    payoutId: "payout-01",
    createdAt: "2026-04-07T07:10:00.000Z",
    settlementAvailableAt: "2026-04-10T00:00:00.000Z",
  },
  {
    id: "txn-07",
    orderId: "order-10",
    orderNumber: "FB-2393",
    type: "earning",
    grossAmount: 680,
    ledgerGroupId: "ledger-order-10",
    commission: 102,
    discountCost: 40,
    deliveryCost: 0,
    netAmount: 538,
    status: "paid_out",
    adjustmentType: "earning",
    payoutId: "payout-02",
    createdAt: "2026-04-05T18:12:00.000Z",
    settlementAvailableAt: "2026-04-08T00:00:00.000Z",
  },
  {
    id: "txn-08",
    orderId: "payout-order-01",
    orderNumber: "PAYOUT-03",
    type: "payout",
    grossAmount: 9200,
    ledgerGroupId: "ledger-payout-03",
    payoutId: "payout-03",
    commission: 0,
    discountCost: 0,
    deliveryCost: 0,
    netAmount: -9200,
    status: "paid_out",
    adjustmentType: "payout",
    createdAt: "2026-04-10T08:20:00.000Z",
    settlementAvailableAt: "2026-04-10T08:20:00.000Z",
  },
]
