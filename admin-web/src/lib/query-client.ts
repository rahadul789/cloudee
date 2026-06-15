import { QueryClient } from "@tanstack/react-query"

const listLikeQueryRoots = new Set([
  "admin-activity-logs",
  "admin-customer-group-member-candidates",
  "admin-customer-group-members",
  "admin-customer-groups",
  "admin-customer-analytics-customers",
  "admin-customer-analytics-funnels",
  "admin-customer-analytics-overview",
  "admin-customer-analytics-payments",
  "admin-customers",
  "admin-dashboard-orders",
  "admin-dashboard-reports",
  "admin-dashboard-restaurants",
  "admin-dashboard-riders",
  "admin-dispatch-logs",
  "admin-finance-ledger",
  "admin-finance-payouts",
  "admin-finance-refunds",
  "admin-food-categories",
  "admin-media-assets",
  "admin-notification-recipients",
  "admin-notifications",
  "admin-operational-health",
  "admin-orders",
  "admin-orders-monitor",
  "admin-otp-security",
  "admin-payments",
  "admin-referrals",
  "admin-reports",
  "admin-restaurants",
  "admin-review-cases",
  "admin-reviews",
  "admin-rider-candidates",
  "admin-rider-payroll",
  "admin-riders",
  "admin-sessions",
  "admin-support-cases",
  "admin-vouchers",
])

function keepPreviousListData<TData>(
  previousData: TData | undefined,
  previousQuery: { queryKey: readonly unknown[] } | undefined
) {
  const rootKey = String(previousQuery?.queryKey?.[0] ?? "")
  return listLikeQueryRoots.has(rootKey) ? previousData : undefined
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: false,
      refetchOnWindowFocus: false,
      placeholderData: keepPreviousListData,
    },
    mutations: {
      retry: false
    }
  }
})
