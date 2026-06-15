import type { EarningTransaction, Payout } from "@/components/payouts/types"

export type EarningsSummary = {
  gross: number
  net: number
  commission: number
  discountCost: number
  deliveryCost: number
  available: number
  pending: number
  paidOutBalance: number
  totalPayouts: number
  lifetimeEarnings: number
  availableSoon: number
}

export function calculateEarningsSummary(
  transactions: EarningTransaction[],
  payouts: Payout[]
): EarningsSummary {
  const earningTransactions = transactions.filter(
    (transaction) => transaction.type === "earning"
  )
  const walletTransactions = transactions.filter(
    (transaction) => transaction.type !== "payout"
  )

  const gross = earningTransactions.reduce(
    (sum, transaction) => sum + transaction.grossAmount,
    0
  )
  const net = earningTransactions.reduce(
    (sum, transaction) => sum + transaction.netAmount,
    0
  )
  const commission = earningTransactions.reduce(
    (sum, transaction) => sum + transaction.commission,
    0
  )
  const discountCost = earningTransactions.reduce(
    (sum, transaction) => sum + transaction.discountCost,
    0
  )
  const deliveryCost = earningTransactions.reduce(
    (sum, transaction) => sum + transaction.deliveryCost,
    0
  )
  const available = walletTransactions
    .filter((transaction) => transaction.status === "available")
    .reduce((sum, transaction) => sum + transaction.netAmount, 0)
  const pending = walletTransactions
    .filter((transaction) => transaction.status === "pending")
    .reduce((sum, transaction) => sum + transaction.netAmount, 0)
  const paidOutBalance = walletTransactions
    .filter((transaction) => transaction.status === "paid_out")
    .reduce((sum, transaction) => sum + transaction.netAmount, 0)
  const totalPayouts = payouts
    .filter((payout) => payout.status === "completed")
    .reduce((sum, payout) => sum + payout.amount, 0)

  return {
    gross,
    net,
    commission,
    discountCost,
    deliveryCost,
    available,
    pending,
    paidOutBalance,
    totalPayouts,
    lifetimeEarnings: net,
    availableSoon: pending,
  }
}
