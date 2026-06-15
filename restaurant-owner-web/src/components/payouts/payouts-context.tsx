import * as React from "react"
import { useLocation } from "react-router-dom"

import {
  mapOwnerPayoutMethod,
  type OwnerPayoutSummaryResponse,
} from "@/lib/backend-mappers"
import type { PayoutMethod } from "@/components/payouts/types"
import { useOwnerPayoutSummaryQuery } from "@/hooks/use-owner-api"
import { useAppStore } from "@/store/app-store"

export function PayoutsProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const ownerAccount = useAppStore((state) => state.ownerAccount)
  const setPayoutMethod = useAppStore((state) => state.setPayoutMethod)
  const location = useLocation()
  const shouldLoadPayoutSummary =
    location.pathname === "/" || location.pathname === "/analytics"

  const payoutSummaryQuery = useOwnerPayoutSummaryQuery(
    ownerAccount.isAuthenticated && shouldLoadPayoutSummary
  )

  const isSamePayoutMethod = React.useCallback(
    (left: PayoutMethod, right: PayoutMethod) => {
      return (
        left.id === right.id &&
        left.type === right.type &&
        left.accountName === right.accountName &&
        left.accountNumber === right.accountNumber &&
        left.bankName === right.bankName &&
        left.branchName === right.branchName &&
        left.isVerified === right.isVerified &&
        left.verifiedAt === right.verifiedAt &&
        left.pendingAccountName === right.pendingAccountName &&
        left.pendingAccountNumber === right.pendingAccountNumber &&
        left.pendingVerificationStatus === right.pendingVerificationStatus &&
        left.pendingVerifiedAt === right.pendingVerifiedAt &&
        left.pendingAdminNote === right.pendingAdminNote &&
        left.verificationSource === right.verificationSource
      )
    },
    []
  )

  React.useEffect(() => {
    if (!payoutSummaryQuery.data) return

    const payload = payoutSummaryQuery.data as OwnerPayoutSummaryResponse
    const payoutMethodResponse = payload.payoutMethod
    if (payoutMethodResponse) {
      setPayoutMethod((current) => {
        const next = mapOwnerPayoutMethod(payoutMethodResponse, current)
        return isSamePayoutMethod(current, next) ? current : next
      })
    }
  }, [isSamePayoutMethod, payoutSummaryQuery.data, setPayoutMethod])

  return <>{children}</>
}

export function usePayouts() {
  const payouts = useAppStore((state) => state.payouts)
  const setPayouts = useAppStore((state) => state.setPayouts)
  const payoutTransactions = useAppStore((state) => state.payoutTransactions)
  const setPayoutTransactions = useAppStore(
    (state) => state.setPayoutTransactions
  )
  const payoutMethod = useAppStore((state) => state.payoutMethod)
  const setPayoutMethod = useAppStore((state) => state.setPayoutMethod)

  return {
    payouts,
    setPayouts,
    payoutTransactions,
    setPayoutTransactions,
    payoutMethod,
    setPayoutMethod,
  }
}
