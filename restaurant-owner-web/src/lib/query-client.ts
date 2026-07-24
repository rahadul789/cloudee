import { QueryClient } from "@tanstack/react-query"

function keepPreviousOwnerListData<TData>(
  previousData: TData | undefined,
  previousQuery: { queryKey: readonly unknown[] } | undefined
) {
  const [scope, section, subsection] = previousQuery?.queryKey ?? []

  if (scope === "public" && section === "platform-content") {
    return previousData
  }

  if (scope !== "owner") {
    return undefined
  }

  if (
    section === "analytics" ||
    section === "categories" ||
    section === "dashboard" ||
    section === "menu-items" ||
    section === "notifications" ||
    section === "orders" ||
    section === "payouts" ||
    section === "reviews" ||
    section === "sidebar-summary" ||
    section === "support-cases" ||
    section === "vouchers"
  ) {
    return previousData
  }

  if (section === "riders" && subsection === "assignment-options") {
    return previousData
  }

  return undefined
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
      placeholderData: keepPreviousOwnerListData,
    },
    mutations: {
      retry: 0,
    },
  },
})
