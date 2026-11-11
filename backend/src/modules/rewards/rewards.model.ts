import { Schema, model } from "mongoose"

// "Bela Rewards" (stamp card).
//  - 1 STAMP per qualifying delivered order (+ spin bonus stamps + stamps bought with coins).
//    Stamps are a ledger: available = earned − consumed, so extras carry over to the next card.
//  - Every qualifying delivered order also gives a SPIN that unlocks after N hours (or right
//    away for coins). The prize is decided on the server against the admin's odds + budget.
//  - A full card (target stamps) is claimed for a MYSTERY BOX — auto, or after admin approval —
//    whose taka voucher is picked on the server and revealed in the app.

export const PRIZE_TYPES = ["coins", "bonus_stamp", "free_delivery", "discount", "fun"] as const
export type PrizeType = (typeof PRIZE_TYPES)[number]

const wheelSegmentSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    type: { type: String, enum: PRIZE_TYPES, required: true },
    label: { type: String, required: true, trim: true, maxlength: 40 },
    // Relative chance (weights, not %). 0 = off. Also the slice size on the wheel.
    weight: { type: Number, default: 0, min: 0 },
    // coins: how many coins; discount: taka off.
    amount: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
)

const boxPrizeSchema = new Schema(
  {
    amount: { type: Number, required: true, min: 1 },
    weight: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
)

const rewardSettingsSchema = new Schema(
  {
    key: { type: String, default: "default", unique: true },
    // Spins (per delivered order)
    scratchEnabled: { type: Boolean, default: false }, // kept name: "spins on"
    minOrderAmount: { type: Number, default: 150, min: 0 },
    spinUnlockHours: { type: Number, default: 24, min: 0, max: 168 },
    skipCoinCost: { type: Number, default: 30, min: 0 },
    cardExpiryDays: { type: Number, default: 7, min: 1, max: 60 }, // days AFTER unlocking
    prizeVoucherValidityDays: { type: Number, default: 7, min: 1, max: 60 },
    prizeVoucherMinOrder: { type: Number, default: 150, min: 0 },
    freeDeliveryCostEstimate: { type: Number, default: 25, min: 0 },
    monthlyBudget: { type: Number, default: 3000, min: 0 },
    prizes: {
      type: [wheelSegmentSchema],
      default: () => [
        { id: "c5", type: "coins", label: "5 coins", weight: 25, amount: 5 },
        { id: "c10", type: "coins", label: "10 coins", weight: 25, amount: 10 },
        { id: "c20", type: "coins", label: "20 coins", weight: 15, amount: 20 },
        { id: "c30", type: "coins", label: "30 coins", weight: 10, amount: 30 },
        { id: "c50", type: "coins", label: "50 coins", weight: 4, amount: 50 },
        { id: "stamp", type: "bonus_stamp", label: "+1 stamp", weight: 5, amount: 0 },
        { id: "fd", type: "free_delivery", label: "Free delivery", weight: 1, amount: 0 },
        { id: "luck", type: "fun", label: "Better luck", weight: 15, amount: 0 },
      ],
    },
    // Coins
    stampCoinPrice: { type: Number, default: 150, min: 1 },
    maxCoinStampsPerCycle: { type: Number, default: 2, min: 0, max: 10 },
    coinExpiryDays: { type: Number, default: 60, min: 1, max: 365 },
    // Mystery box (full card)
    boxPrizes: {
      type: [boxPrizeSchema],
      default: () => [
        // avg ≈ ৳11.3 (never below ৳10)
        { amount: 10, weight: 85 },
        { amount: 15, weight: 10 },
        { amount: 20, weight: 4 },
        { amount: 50, weight: 1 },
      ],
    },
    claimMode: { type: String, enum: ["auto", "approval"], default: "approval" },
    claimAmount: { type: Number, default: 20, min: 1 }, // legacy (old app copy); box decides now
    claimMinOrder: { type: Number, default: 0, min: 0 },
    claimValidityDays: { type: Number, default: 30, min: 1, max: 180 },
    // Notifications — all OFF by default (no reward spam).
    claimReminderEnabled: { type: Boolean, default: false },
    claimReminderAfterDays: { type: Number, default: 3, min: 1, max: 30 },
    claimReminderTitle: { type: String, default: "Your mystery box is waiting 🎁", trim: true },
    claimReminderBody: {
      type: String,
      default: "Your stamp card is full — open your mystery box now.",
      trim: true,
    },
    spinReadyLocalNotify: { type: Boolean, default: false },
    // Test mode: only these customers get instant-ish spins + admin test tools; their activity
    // is flagged isTest and kept out of budget, stats and winners.
    testModeEnabled: { type: Boolean, default: false },
    testerCustomerIds: { type: [String], default: [] },
    testSpinUnlockMinutes: { type: Number, default: 1, min: 0, max: 1440 },
  },
  { timestamps: true },
)

// One spin per qualifying delivered order (collection name kept from the scratch version).
const scratchCardSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true, unique: true },
    orderNumber: { type: String, default: "" },
    status: { type: String, enum: ["unscratched", "scratched", "expired"], default: "unscratched", index: true },
    unlocksAt: { type: Date, default: null },
    skippedWithCoins: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
    scratchedAt: { type: Date, default: null },
    prize: {
      id: { type: String, default: "" },
      type: { type: String, enum: [...PRIZE_TYPES, ""], default: "" },
      label: { type: String, default: "" },
      amount: { type: Number, default: 0 },
      cost: { type: Number, default: 0 },
      budgetCapped: { type: Boolean, default: false },
    },
    voucherId: { type: Schema.Types.ObjectId, ref: "Voucher", default: null },
    voucherCode: { type: String, default: "" },
    isTest: { type: Boolean, default: false },
  },
  { timestamps: true },
)
scratchCardSchema.index({ customerId: 1, status: 1, createdAt: -1 })
scratchCardSchema.index({ status: 1, scratchedAt: -1 })
scratchCardSchema.index({ status: 1, expiresAt: 1 })

// Coin wallet: balance + consumedTotal (spent + expired). Spends are a single guarded $inc.
const coinWalletSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, unique: true },
    balance: { type: Number, default: 0, min: 0 },
    earnedTotal: { type: Number, default: 0 },
    consumedTotal: { type: Number, default: 0 },
  },
  { timestamps: true },
)

// Coin ledger. Credits are "lots" (FIFO, expire); debits are spends/expiries.
const coinTxnSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    amount: { type: Number, required: true }, // + credit, − debit
    reason: { type: String, enum: ["spin", "buy_stamp", "skip_spin", "expire", "admin"], required: true },
    refId: { type: String, default: "" },
    // credits only
    expiresAt: { type: Date, default: null },
    expired: { type: Boolean, default: false },
    isTest: { type: Boolean, default: false },
  },
  { timestamps: true },
)
coinTxnSchema.index({ customerId: 1, createdAt: 1 })
coinTxnSchema.index({ customerId: 1, reason: 1, createdAt: -1 })
coinTxnSchema.index({ expired: 1, expiresAt: 1 })

// Mystery box for a full stamp card.
const mysteryBoxSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    status: { type: String, enum: ["requested", "ready", "opened", "rejected"], default: "requested", index: true },
    stampsUsed: { type: Number, default: 0 },
    requestedCode: { type: String, default: "" },
    prizeAmount: { type: Number, default: 0 },
    voucherId: { type: Schema.Types.ObjectId, ref: "Voucher", default: null },
    voucherCode: { type: String, default: "" },
    readyAt: { type: Date, default: null },
    openedAt: { type: Date, default: null },
    decidedBy: { type: String, default: "" }, // "auto" | admin id
    rejectReason: { type: String, default: "" },
    isTest: { type: Boolean, default: false },
  },
  { timestamps: true },
)
mysteryBoxSchema.index({ status: 1, createdAt: -1 })

export const RewardSettingsModel = model("RewardSettings", rewardSettingsSchema)
export const ScratchCardModel = model("ScratchCard", scratchCardSchema)
export const CoinWalletModel = model("CoinWallet", coinWalletSchema)
export const CoinTxnModel = model("CoinTxn", coinTxnSchema)
export const MysteryBoxModel = model("MysteryBox", mysteryBoxSchema)
