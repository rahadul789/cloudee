import * as React from "react"

import { endOfDay, format, subDays } from "date-fns"
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Columns3,
  CreditCard,
  Download,
  Landmark,
  LoaderCircle,
  ReceiptText,
  RotateCcw,
  Search,
  Wallet,
  WalletCards,
} from "lucide-react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useQueryClient } from "@tanstack/react-query"
import { useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { useDebouncedValue } from "@/hooks/use-debounced-value"

import {
  buildOrderDateFilterQuery,
  defaultOrderDateFilter,
  OrderDateFilter,
  type OrderDateFilterValue,
} from "@/components/orders/order-date-filter"
import { PayoutDetailsDrawer } from "@/components/payouts/payout-details-drawer"
import { PayoutMethodDrawer } from "@/components/payouts/payout-method-drawer"
import { TransactionDetailsDrawer } from "@/components/payouts/transaction-details-drawer"
import { usePayouts } from "@/components/payouts/payouts-context"
import {
  formatPayoutMoney,
  getPayoutStatusLabel,
  settlementDelayDays as fallbackSettlementDelayDays,
  type EarningTransaction,
  type Payout,
  type PayoutStatus,
  type TransactionType,
} from "@/components/payouts/types"
import { calculateEarningsSummary } from "@/domain/financials"
import {
  mapOwnerPayout,
  mapOwnerPayoutMethod,
  mapOwnerPayoutTransaction,
  type OwnerListResponse,
  type OwnerPayoutHistoryResponse,
  type OwnerPayoutTransactionResponse,
} from "@/lib/backend-mappers"
import { resolveOtpResendSeconds } from "@/lib/otp-timing"
import {
  useOwnerDashboardSummaryQuery,
  useOwnerPayoutHistoryQuery,
  useOwnerPayoutSummaryQuery,
  useOwnerPayoutTransactionsQuery,
  useUpdateOwnerPayoutMethodMutation,
} from "@/hooks/use-owner-api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAppStore } from "@/store/app-store"

type SortKey = "latest" | "oldest" | "highestNet"
type CombinedStatusFilter = "all" | PayoutStatus
type CombinedTypeFilter = "all" | TransactionType
type PayoutTab = "history" | "transactions"

type PayoutColumnKey =
  | "amount"
  | "status"
  | "notes"
  | "transaction"
  | "method"
  | "date"

type TransactionColumnKey =
  | "type"
  | "gross"
  | "commission"
  | "discount"
  | "net"
  | "settlement"
  | "created"
  | "available"

const pageSizeOptions = [5, 10, 20]

const payoutColumnLabels: Record<PayoutColumnKey, string> = {
  amount: "Amount",
  status: "Status",
  notes: "Notes",
  transaction: "Transaction ID",
  method: "Method",
  date: "Date",
}

const transactionColumnLabels: Record<TransactionColumnKey, string> = {
  type: "Type",
  gross: "Food Sales",
  commission: "Commission",
  discount: "Owner Discount",
  net: "Owner Earning",
  settlement: "Settlement",
  created: "Created",
  available: "Available",
}

function getPayoutBadge(status: PayoutStatus) {
  if (status === "completed") {
    return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Completed</Badge>
  }
  if (status === "processing") {
    return <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">Processing</Badge>
  }
  if (status === "pending") {
    return <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Pending</Badge>
  }
  return <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">Failed</Badge>
}

function getTransactionBadge(type: TransactionType) {
  if (type === "earning") {
    return <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Earning</Badge>
  }
  if (type === "payout") {
    return <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">Payout</Badge>
  }
  return <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">Refund</Badge>
}

function getSettlementBadge(status: EarningTransaction["status"]) {
  if (status === "available") {
    return <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Available</Badge>
  }
  if (status === "paid_out") {
    return <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-700">Paid Out</Badge>
  }
  return <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Pending</Badge>
}

function PayoutsSkeleton() {
  return (
    <div className="space-y-4 px-4 lg:px-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-32 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row">
          <Skeleton className="h-10 w-full lg:max-w-xs" />
          <Skeleton className="h-10 w-full lg:w-44" />
          <Skeleton className="h-10 w-full lg:w-44" />
          <Skeleton className="h-10 w-full lg:w-52" />
          <Skeleton className="h-10 w-full lg:w-36" />
          <Skeleton className="h-10 w-full lg:w-28" />
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card p-4 shadow-sm">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className={`w-full ${index === 0 ? "mb-4 h-12" : "mb-3 h-14 last:mb-0"}`} />
        ))}
      </div>
    </div>
  )
}

export function PayoutsPage() {
  const {
    payouts,
    payoutTransactions,
    payoutMethod,
    setPayoutMethod,
  } = usePayouts()
  const ownerAccount = useAppStore((state) => state.ownerAccount)
  const storeSettings = useAppStore((state) => state.storeSettings)
  const verificationModalOpen = useAppStore(
    (state) => state.verificationModalOpen
  )
  const setVerificationModalOpen = useAppStore(
    (state) => state.setVerificationModalOpen
  )
  const setVerificationRequest = useAppStore(
    (state) => state.setVerificationRequest
  )

  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const [activeTab, setActiveTab] = React.useState<PayoutTab>("history")
  const [search, setSearch] = React.useState("")
  const [dateFilter, setDateFilter] = React.useState<OrderDateFilterValue>({
    ...defaultOrderDateFilter,
    preset: "last7Days",
  })
  const [statusFilter, setStatusFilter] = React.useState<CombinedStatusFilter>("all")
  const [typeFilter, setTypeFilter] = React.useState<CombinedTypeFilter>("all")
  const [sortBy, setSortBy] = React.useState<SortKey>("latest")
  const [payoutPageSize, setPayoutPageSize] = React.useState(10)
  const [transactionPageSize, setTransactionPageSize] = React.useState(10)
  const [payoutPageIndex, setPayoutPageIndex] = React.useState(0)
  const [transactionPageIndex, setTransactionPageIndex] = React.useState(0)
  const [viewingPayout, setViewingPayout] = React.useState<Payout | null>(null)
  const [viewingTransaction, setViewingTransaction] = React.useState<EarningTransaction | null>(null)
  const [awaitingPayoutVerification, setAwaitingPayoutVerification] =
    React.useState(false)
  const debouncedSearch = useDebouncedValue(search)
  const [isMethodOpen, setIsMethodOpen] = React.useState(false)
  const [payoutColumnVisibility, setPayoutColumnVisibility] = React.useState<Record<PayoutColumnKey, boolean>>({
    amount: true,
    status: true,
    notes: true,
    transaction: true,
    method: true,
    date: true,
  })
  const [transactionColumnVisibility, setTransactionColumnVisibility] = React.useState<Record<TransactionColumnKey, boolean>>({
    type: true,
    gross: true,
    commission: true,
    discount: true,
    net: true,
    settlement: true,
    created: true,
    available: true,
  })

  const payoutSummaryQuery = useOwnerPayoutSummaryQuery(ownerAccount.isAuthenticated)
  const payoutHistoryQuery = useOwnerPayoutHistoryQuery(ownerAccount.isAuthenticated, {
    search: debouncedSearch.trim() || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    sortBy,
    ...buildOrderDateFilterQuery(dateFilter),
    page: payoutPageIndex + 1,
    pageSize: payoutPageSize,
  })
  const payoutTransactionsQuery = useOwnerPayoutTransactionsQuery(ownerAccount.isAuthenticated, {
    search: debouncedSearch.trim() || undefined,
    type: typeFilter !== "all" ? typeFilter : undefined,
    sortBy,
    ...buildOrderDateFilterQuery(dateFilter),
    page: transactionPageIndex + 1,
    pageSize: transactionPageSize,
  })
  const payoutStatementTransactionsQuery = useOwnerPayoutTransactionsQuery(
    ownerAccount.isAuthenticated && Boolean(viewingPayout?.id),
    {
      payoutId: viewingPayout?.id,
      sortBy: "oldest",
      page: 1,
      pageSize: 2000,
    }
  )
  const updatePayoutMethodMutation = useUpdateOwnerPayoutMethodMutation()
  // Today's best sellers — used inside the downloadable/printable statement.
  const dashboardSummaryQuery = useOwnerDashboardSummaryQuery(true)
  const topSellingItems = (dashboardSummaryQuery.data?.topItems ?? []).slice(0, 5)
  const hasPayoutData =
    Boolean(payoutSummaryQuery.data) ||
    Boolean(payoutHistoryQuery.data) ||
    Boolean(payoutTransactionsQuery.data) ||
    payouts.length > 0 ||
    payoutTransactions.length > 0
  const initialLoading =
    !hasPayoutData &&
    (payoutSummaryQuery.isPending ||
      payoutHistoryQuery.isPending ||
      payoutTransactionsQuery.isPending)

  const earningsSummary = React.useMemo(
    () => calculateEarningsSummary(payoutTransactions, payouts),
    [payoutTransactions, payouts]
  )
  const summaryBalances = payoutSummaryQuery.data
    ? {
        available: payoutSummaryQuery.data.availableBalance,
        pending: payoutSummaryQuery.data.pendingBalance,
        paidOut: payoutSummaryQuery.data.paidOutBalance,
        requested: payoutSummaryQuery.data.requestedPayoutBalance,
        gross: payoutSummaryQuery.data.lifetimeGrossAmount,
        net: payoutSummaryQuery.data.lifetimeNetEarnings,
        commission: payoutSummaryQuery.data.lifetimeCommission,
        discountCost: payoutSummaryQuery.data.lifetimeDiscountCost,
        settlementDelayDays:
          payoutSummaryQuery.data.settlementDelayDays ?? fallbackSettlementDelayDays,
      }
    : null
  const summaryLastPayout = payoutSummaryQuery.data?.lastPayout
    ? mapOwnerPayout(
        {
          ...payoutSummaryQuery.data.lastPayout,
          createdAt: payoutSummaryQuery.data.lastPayout.requestedAt,
          updatedAt:
            payoutSummaryQuery.data.lastPayout.processedAt ??
            payoutSummaryQuery.data.lastPayout.requestedAt,
        },
        payoutMethod.type
      )
    : null
  const lifetimeEarnings = summaryBalances?.net ?? earningsSummary.lifetimeEarnings
  const availableBalance = summaryBalances?.available ?? earningsSummary.available
  const pendingBalance = summaryBalances?.pending ?? earningsSummary.pending
  const paidOutBalance = summaryBalances?.paidOut ?? earningsSummary.totalPayouts
  const requestedPayoutBalance = summaryBalances?.requested ?? 0
  const settlementDelayDays =
    summaryBalances?.settlementDelayDays ?? fallbackSettlementDelayDays

  const lastCompletedPayout = React.useMemo(
    () =>
      summaryLastPayout && summaryLastPayout.status === "completed"
        ? summaryLastPayout
        : [...payouts]
            .filter((payout) => payout.status === "completed")
            .sort(
              (a, b) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            )[0] ?? null,
    [payouts, summaryLastPayout]
  )

  const nextSettlementAvailableAt = payoutSummaryQuery.data?.nextSettlementAvailableAt
  const nextPayoutDate = nextSettlementAvailableAt
    ? format(new Date(nextSettlementAvailableAt), "dd MMM yyyy")
    : lastCompletedPayout
      ? format(
          endOfDay(subDays(new Date(lastCompletedPayout.createdAt), -settlementDelayDays)),
          "dd MMM yyyy"
        )
      : "--"

  const filteredPayouts = React.useMemo(() => {
    if (!payoutHistoryQuery.data) return payouts
    return (
      payoutHistoryQuery.data as OwnerListResponse<OwnerPayoutHistoryResponse>
    ).items.map((entry) => mapOwnerPayout(entry, payoutMethod.type))
  }, [payoutHistoryQuery.data, payoutMethod.type, payouts])

  const filteredTransactions = React.useMemo(() => {
    if (!payoutTransactionsQuery.data) return payoutTransactions
    return (
      payoutTransactionsQuery.data as OwnerListResponse<OwnerPayoutTransactionResponse>
    ).items.map(mapOwnerPayoutTransaction)
  }, [payoutTransactions, payoutTransactionsQuery.data])

  const payoutStatementTransactions = React.useMemo(() => {
    if (!viewingPayout) return []
    if (payoutStatementTransactionsQuery.data) {
      return (
        payoutStatementTransactionsQuery.data as OwnerListResponse<OwnerPayoutTransactionResponse>
      ).items.map(mapOwnerPayoutTransaction)
    }

    return filteredTransactions.filter(
      (transaction) => transaction.payoutId === viewingPayout.id
    )
  }, [
    filteredTransactions,
    payoutStatementTransactionsQuery.data,
    viewingPayout,
  ])

  React.useEffect(() => {
    const queryTab = searchParams.get("tab")
    if (queryTab === "history" || queryTab === "transactions") {
      setActiveTab(queryTab)
    }
  }, [searchParams])

  React.useEffect(() => {
    const payoutId = searchParams.get("payout")
    if (!payoutId) return

    const matchedPayout = filteredPayouts.find((payout) => payout.id === payoutId)
    if (matchedPayout) {
      setActiveTab("history")
      setViewingPayout(matchedPayout)
    }
  }, [filteredPayouts, searchParams])

  React.useEffect(() => {
    const transactionId = searchParams.get("transaction")
    if (!transactionId) return

    const matchedTransaction = filteredTransactions.find(
      (transaction) => transaction.id === transactionId
    )
    if (matchedTransaction) {
      setActiveTab("transactions")
      setViewingTransaction(matchedTransaction)
    }
  }, [filteredTransactions, searchParams])

  React.useEffect(() => {
    setPayoutPageIndex(0)
    setTransactionPageIndex(0)
  }, [activeTab, debouncedSearch, dateFilter, statusFilter, typeFilter, sortBy])

  React.useEffect(() => {
    setPayoutPageIndex(0)
  }, [payoutPageSize])

  React.useEffect(() => {
    setTransactionPageIndex(0)
  }, [transactionPageSize])

  React.useEffect(() => {
    if (!awaitingPayoutVerification) return
    if (verificationModalOpen) return
    if (payoutMethod.pendingAccountNumber) return
    if (!payoutMethod.isVerified) return

    setIsMethodOpen(false)
    setAwaitingPayoutVerification(false)
  }, [
    awaitingPayoutVerification,
    payoutMethod.isVerified,
    payoutMethod.pendingAccountNumber,
    verificationModalOpen,
  ])

  React.useEffect(() => {
    if (!isMethodOpen) {
      setAwaitingPayoutVerification(false)
    }
  }, [isMethodOpen])

  const payoutTotal =
    (payoutHistoryQuery.data as OwnerListResponse<OwnerPayoutHistoryResponse> | undefined)
      ?.total ?? filteredPayouts.length
  const payoutPageCount = Math.max(1, Math.ceil(payoutTotal / payoutPageSize))
  const safePayoutPageIndex = Math.min(payoutPageIndex, payoutPageCount - 1)
  const paginatedPayouts = React.useMemo(() => {
    return filteredPayouts
  }, [filteredPayouts])

  const transactionTotal =
    (
      payoutTransactionsQuery.data as
        | OwnerListResponse<OwnerPayoutTransactionResponse>
        | undefined
    )?.total ?? filteredTransactions.length
  const transactionPageCount = Math.max(
    1,
    Math.ceil(transactionTotal / transactionPageSize)
  )
  const safeTransactionPageIndex = Math.min(
    transactionPageIndex,
    transactionPageCount - 1
  )
  const paginatedTransactions = React.useMemo(() => {
    return filteredTransactions
  }, [filteredTransactions])

  const payoutChartData = React.useMemo(
    () =>
      filteredPayouts.slice(0, 8).reverse().map((payout) => ({
        label: format(new Date(payout.createdAt), "dd MMM"),
        primary: payout.amount,
        secondary: payout.status === "completed" ? payout.amount : 0,
      })),
    [filteredPayouts]
  )

  const transactionChartData = React.useMemo(
    () =>
      filteredTransactions
        .filter((transaction) => transaction.type !== "payout")
        .slice(0, 8)
        .reverse()
        .map((transaction) => ({
          label: format(new Date(transaction.createdAt), "dd MMM"),
          primary: transaction.grossAmount,
          secondary: transaction.netAmount,
        })),
    [filteredTransactions]
  )

  const activeChartData =
    activeTab === "history" ? payoutChartData : transactionChartData

  const activeChartMeta =
    activeTab === "history"
      ? {
          title: "Payout Trend",
          primaryStroke: "#1d4ed8",
          primaryFill: "#dbeafe",
          secondaryStroke: "#047857",
          secondaryFill: "#d1fae5",
        }
      : {
          title: "Earnings Trend",
          primaryStroke: "#1d4ed8",
          primaryFill: "#dbeafe",
          secondaryStroke: "#047857",
          secondaryFill: "#d1fae5",
        }

  const resetDisabled =
    !search &&
    dateFilter.preset === "last7Days" &&
    !dateFilter.range &&
    statusFilter === "all" &&
    typeFilter === "all" &&
    sortBy === "latest"
  function resetFilters() {
    setSearch("")
    setDateFilter({ ...defaultOrderDateFilter, preset: "last7Days" })
    setStatusFilter("all")
    setTypeFilter("all")
    setSortBy("latest")
  }

  function handleDownloadReport() {
    const rows = [
      [
        "transactionId",
        "orderNumber",
        "type",
        "grossAmount",
        "commission",
        "discountCost",
        "netAmount",
        "status",
        "createdAt",
      ].join(","),
      ...filteredTransactions.map((transaction) =>
        [
          transaction.id,
          transaction.orderNumber,
          transaction.type,
          transaction.grossAmount,
          transaction.commission,
          transaction.discountCost,
          transaction.netAmount,
          transaction.status,
          transaction.createdAt,
        ].join(",")
      ),
    ]

    const blob = new Blob([rows.join("\n")], {
      type: "text/csv;charset=utf-8;",
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "payout-transactions.csv"
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function handleDownloadPayoutHistory() {
    const rows = [
      [
        "payoutId",
        "amount",
        "status",
        "transactionId",
        "method",
        "createdAt",
        "processedAt",
        "failureReason",
      ].join(","),
      ...filteredPayouts.map((payout) =>
        [
          payout.id,
          payout.amount,
          payout.status,
          payout.transactionId,
          payout.method,
          payout.createdAt,
          payout.processedAt ?? "",
          `"${(payout.failureReason ?? "").replaceAll('"', '""')}"`,
        ].join(",")
      ),
    ]

    const blob = new Blob([rows.join("\n")], {
      type: "text/csv;charset=utf-8;",
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "payout-history.csv"
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function escapeHtml(value: unknown) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;")
  }

  function openPrintableStatement(title: string, body: string) {
    const html = `
      <!doctype html>
      <html>
        <head>
          <title>${escapeHtml(title)}</title>
          <style>
            body { font-family: Inter, Arial, sans-serif; margin: 32px; color: #111827; }
            .shell { max-width: 820px; margin: 0 auto; }
            .header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 1px solid #e5e7eb; padding-bottom: 20px; }
            h1 { margin: 0; font-size: 26px; }
            h2 { margin: 28px 0 12px; font-size: 16px; }
            .muted { color: #6b7280; font-size: 13px; }
            .amount { font-size: 32px; font-weight: 700; margin-top: 8px; }
            .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
            .box { border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px; }
            table { border-collapse: collapse; width: 100%; margin-top: 8px; }
            th, td { border-bottom: 1px solid #e5e7eb; padding: 10px 8px; text-align: left; font-size: 13px; }
            th { color: #6b7280; font-weight: 600; }
            .right { text-align: right; }
            @media print { body { margin: 18mm; } button { display: none; } }
          </style>
        </head>
        <body>
          <div class="shell">${body}</div>
        </body>
      </html>
    `
    const frame = document.createElement("iframe")
    const objectUrl = URL.createObjectURL(
      new Blob([html], { type: "text/html;charset=utf-8" })
    )
    let cleanupTimer: number | undefined
    let didCleanup = false

    const cleanup = () => {
      if (didCleanup) return
      didCleanup = true
      if (cleanupTimer) window.clearTimeout(cleanupTimer)
      URL.revokeObjectURL(objectUrl)
      frame.remove()
    }

    frame.title = title
    frame.setAttribute("aria-hidden", "true")
    frame.style.position = "fixed"
    frame.style.right = "0"
    frame.style.bottom = "0"
    frame.style.width = "0"
    frame.style.height = "0"
    frame.style.border = "0"

    frame.onload = () => {
      const printWindow = frame.contentWindow
      if (!printWindow) {
        toast.error("Unable to prepare the statement for printing.")
        cleanup()
        return
      }

      printWindow.addEventListener("afterprint", cleanup, { once: true })
      cleanupTimer = window.setTimeout(cleanup, 120_000)

      try {
        printWindow.focus()
        printWindow.print()
      } catch {
        toast.error("Unable to open the print dialog.")
        cleanup()
      }
    }
    frame.onerror = () => {
      toast.error("Unable to prepare the statement for printing.")
      cleanup()
    }
    frame.src = objectUrl
    document.body.appendChild(frame)
  }

  function handlePrintPayoutStatement(
    payout: Payout,
    statementTransactions: EarningTransaction[]
  ) {
    const orderTransactions = statementTransactions.filter(
      (transaction) => transaction.type !== "payout"
    )
    const payoutLedgerRows = statementTransactions.filter(
      (transaction) => transaction.type === "payout"
    )
    const statementTotals = orderTransactions.reduce(
      (totals, transaction) => ({
        grossAmount: totals.grossAmount + transaction.grossAmount,
        commission: totals.commission + transaction.commission,
        discountCost: totals.discountCost + transaction.discountCost,
        deliveryCost: totals.deliveryCost + transaction.deliveryCost,
        netAmount: totals.netAmount + transaction.netAmount,
      }),
      {
        grossAmount: 0,
        commission: 0,
        discountCost: 0,
        deliveryCost: 0,
        netAmount: 0,
      }
    )
    const transactionRows = orderTransactions.length
      ? orderTransactions
          .map(
            (transaction) => `
              <tr>
                <td>${escapeHtml(transaction.orderNumber)}</td>
                <td>${escapeHtml(transaction.type)}</td>
                <td>${escapeHtml(transaction.paymentMethod || "--")}</td>
                <td>${escapeHtml(transaction.deliveredAt ? format(new Date(transaction.deliveredAt), "dd MMM yyyy") : "--")}</td>
                <td class="right">${escapeHtml(formatPayoutMoney(transaction.grossAmount))}</td>
                <td class="right">${escapeHtml(formatPayoutMoney(transaction.commission))}</td>
                <td class="right">${escapeHtml(formatPayoutMoney(transaction.discountCost))}</td>
                <td class="right">${escapeHtml(formatPayoutMoney(transaction.deliveryCost))}</td>
                <td class="right">${escapeHtml(formatPayoutMoney(transaction.netAmount))}</td>
              </tr>
            `
          )
          .join("")
      : `<tr><td colspan="9" class="muted">No included order transaction rows were found for this payout.</td></tr>`
    const payoutRows = payoutLedgerRows.length
      ? payoutLedgerRows
          .map(
            (transaction) => `
              <tr>
                <td>${escapeHtml(transaction.id)}</td>
                <td>${escapeHtml(transaction.type)}</td>
                <td>${escapeHtml(format(new Date(transaction.createdAt), "dd MMM yyyy, hh:mm a"))}</td>
                <td class="right">${escapeHtml(formatPayoutMoney(transaction.netAmount))}</td>
              </tr>
            `
          )
          .join("")
      : `<tr><td colspan="4" class="muted">No payout debit row was returned for this statement.</td></tr>`
    const body = `
      <div class="header">
        <div>
          <div class="muted">Foodbela Restaurant Payout</div>
          <h1>${escapeHtml(storeSettings.name || "Restaurant payout statement")}</h1>
          <div class="muted">Owner: ${escapeHtml(ownerAccount.ownerName || "Restaurant owner")}</div>
        </div>
        <div>
          <div class="muted">Payout ID</div>
          <strong>${escapeHtml(payout.id)}</strong>
          <div class="amount">${escapeHtml(formatPayoutMoney(payout.amount))}</div>
        </div>
      </div>
      <h2>Summary</h2>
      <div class="grid">
        <div class="box"><div class="muted">Status</div><strong>${escapeHtml(getPayoutStatusLabel(payout.status))}</strong></div>
        <div class="box"><div class="muted">Method</div><strong>${escapeHtml(payout.method === "bank" ? "Bank" : "bKash")}</strong></div>
        <div class="box"><div class="muted">Requested at</div><strong>${escapeHtml(format(new Date(payout.createdAt), "dd MMM yyyy, hh:mm a"))}</strong></div>
        <div class="box"><div class="muted">Processed at</div><strong>${escapeHtml(payout.processedAt ? format(new Date(payout.processedAt), "dd MMM yyyy, hh:mm a") : "Not processed yet")}</strong></div>
        <div class="box"><div class="muted">Reference</div><strong>${escapeHtml(payout.providerReference || payout.providerPayoutId || payout.transactionId || "--")}</strong></div>
        <div class="box"><div class="muted">Batch</div><strong>${escapeHtml(payout.batchReference || "--")}</strong></div>
        <div class="box"><div class="muted">Included orders</div><strong>${escapeHtml(orderTransactions.length)}</strong></div>
        <div class="box"><div class="muted">Net from orders</div><strong>${escapeHtml(formatPayoutMoney(statementTotals.netAmount))}</strong></div>
      </div>
      <h2>Included order transactions</h2>
      <table>
        <thead>
          <tr>
            <th>Order</th>
            <th>Type</th>
            <th>Payment</th>
            <th>Delivered</th>
            <th class="right">Food sales</th>
            <th class="right">Commission</th>
            <th class="right">Owner discount</th>
            <th class="right">Delivery cost</th>
            <th class="right">Owner earning</th>
          </tr>
        </thead>
        <tbody>${transactionRows}</tbody>
        <tfoot>
          <tr>
            <th colspan="4">Total</th>
            <th class="right">${escapeHtml(formatPayoutMoney(statementTotals.grossAmount))}</th>
            <th class="right">${escapeHtml(formatPayoutMoney(statementTotals.commission))}</th>
            <th class="right">${escapeHtml(formatPayoutMoney(statementTotals.discountCost))}</th>
            <th class="right">${escapeHtml(formatPayoutMoney(statementTotals.deliveryCost))}</th>
            <th class="right">${escapeHtml(formatPayoutMoney(statementTotals.netAmount))}</th>
          </tr>
        </tfoot>
      </table>
      <h2>Payout ledger movement</h2>
      <table>
        <thead>
          <tr>
            <th>Ledger row</th>
            <th>Type</th>
            <th>Created</th>
            <th class="right">Net movement</th>
          </tr>
        </thead>
        <tbody>${payoutRows}</tbody>
      </table>
      <p class="muted">Generated ${escapeHtml(format(new Date(), "dd MMM yyyy, hh:mm a"))}. Settlement rule: T+${settlementDelayDays} days. Admin sends payout when eligible balance is available.</p>
    `

    openPrintableStatement(`Payout ${payout.id}`, body)
  }

  function handlePrintCurrentReport() {
    const isHistory = activeTab === "history"
    const rows = isHistory
      ? filteredPayouts
          .map(
            (payout) => `
              <tr>
                <td>${escapeHtml(payout.id)}</td>
                <td>${escapeHtml(getPayoutStatusLabel(payout.status))}</td>
                <td class="right">${escapeHtml(formatPayoutMoney(payout.amount))}</td>
                <td>${escapeHtml(payout.method === "bank" ? "Bank" : "bKash")}</td>
                <td>${escapeHtml(format(new Date(payout.createdAt), "dd MMM yyyy"))}</td>
              </tr>
            `
          )
          .join("")
      : filteredTransactions
          .map(
            (transaction) => `
              <tr>
                <td>${escapeHtml(transaction.orderNumber)}</td>
                <td>${escapeHtml(transaction.type)}</td>
                <td class="right">${escapeHtml(formatPayoutMoney(transaction.grossAmount))}</td>
                <td class="right">${escapeHtml(formatPayoutMoney(transaction.commission))}</td>
                <td class="right">${escapeHtml(formatPayoutMoney(transaction.discountCost))}</td>
                <td class="right">${escapeHtml(formatPayoutMoney(transaction.netAmount))}</td>
              </tr>
            `
          )
          .join("")
    const body = `
      <div class="header">
        <div>
          <div class="muted">Foodbela Restaurant Finance</div>
          <h1>${escapeHtml(isHistory ? "Payout history" : "Transaction breakdown")}</h1>
          <div class="muted">${escapeHtml(storeSettings.name || "Restaurant")} | ${escapeHtml(ownerAccount.ownerName || "Owner")}</div>
        </div>
        <div>
          <div class="muted">Available balance</div>
          <div class="amount">${escapeHtml(formatPayoutMoney(availableBalance))}</div>
        </div>
      </div>
      <h2>Summary</h2>
      <div class="grid">
        <div class="box"><div class="muted">Pending settlement</div><strong>${escapeHtml(formatPayoutMoney(pendingBalance))}</strong></div>
        <div class="box"><div class="muted">In payout</div><strong>${escapeHtml(formatPayoutMoney(requestedPayoutBalance))}</strong></div>
        <div class="box"><div class="muted">Paid out</div><strong>${escapeHtml(formatPayoutMoney(paidOutBalance))}</strong></div>
        <div class="box"><div class="muted">Lifetime net</div><strong>${escapeHtml(formatPayoutMoney(lifetimeEarnings))}</strong></div>
      </div>
      ${
        topSellingItems.length
          ? `<h2>Top selling items (today)</h2>
      <table>
        <thead><tr><th>#</th><th>Item</th><th class="right">Sold</th><th class="right">Revenue</th></tr></thead>
        <tbody>${topSellingItems
          .map(
            (item, index) => `
              <tr>
                <td>${index + 1}</td>
                <td>${escapeHtml(item.name)}</td>
                <td class="right">${escapeHtml(String(item.quantity))}</td>
                <td class="right">${escapeHtml(formatPayoutMoney(item.revenue))}</td>
              </tr>
            `
          )
          .join("")}</tbody>
      </table>`
          : ""
      }
      <h2>${escapeHtml(isHistory ? "Payout rows" : "Transaction rows")}</h2>
      <table>
        <thead>
          ${isHistory
            ? "<tr><th>Payout ID</th><th>Status</th><th class=\"right\">Amount</th><th>Method</th><th>Date</th></tr>"
            : "<tr><th>Order</th><th>Type</th><th class=\"right\">Food sales</th><th class=\"right\">Commission</th><th class=\"right\">Owner discount</th><th class=\"right\">Owner earning</th></tr>"
          }
        </thead>
        <tbody>${rows || `<tr><td colspan="${isHistory ? 5 : 6}" class="muted">No rows in current filter.</td></tr>`}</tbody>
      </table>
      <p class="muted">Generated ${escapeHtml(format(new Date(), "dd MMM yyyy, hh:mm a"))}. Use browser print dialog to save as PDF.</p>
    `

    openPrintableStatement(
      isHistory ? "Payout history PDF" : "Payout transactions PDF",
      body
    )
  }

  if (initialLoading) {
    return <PayoutsSkeleton />
  }

  return (
    <div className="space-y-4 px-4 lg:px-6">
      <PayoutDetailsDrawer
        payout={viewingPayout}
        open={!!viewingPayout}
        onPrintStatement={handlePrintPayoutStatement}
        transactions={payoutStatementTransactions}
        isTransactionsLoading={
          payoutStatementTransactionsQuery.isPending ||
          payoutStatementTransactionsQuery.isFetching
        }
        onOpenChange={(open) => {
          if (!open) {
            setViewingPayout(null)
            if (searchParams.get("payout")) {
              setSearchParams((current) => {
                const next = new URLSearchParams(current)
                next.delete("payout")
                return next
              })
            }
          }
        }}
      />
      <PayoutMethodDrawer
        open={isMethodOpen}
        onOpenChange={setIsMethodOpen}
        method={payoutMethod}
        showVerificationHint="If the bKash number is different from your owner account number, we will ask for OTP verification before activating it."
        onSave={async (method) => {
          try {
            const response = await updatePayoutMethodMutation.mutateAsync(
              method.type === "bkash"
                ? {
                    type: "bkash",
                    accountName: method.accountName.trim(),
                    accountNumber: method.accountNumber.trim(),
                  }
                : {
                    type: "bank",
                    accountName: method.accountName.trim(),
                    accountNumber: method.accountNumber.trim(),
                    bankName: method.bankName?.trim() ?? "",
                    branchName: method.branchName?.trim() ?? "",
                  }
            )
            const nextMethod = {
              ...mapOwnerPayoutMethod(response.payoutMethod, payoutMethod),
              pendingAccountName: response.verificationSessionId
                ? method.accountName
                : "",
            }
            setPayoutMethod(nextMethod)
            void queryClient.invalidateQueries({ queryKey: ["owner", "payouts", "summary"] })
            void queryClient.invalidateQueries({ queryKey: ["owner", "payouts", "history"] })

            if (response.verificationSessionId) {
              setAwaitingPayoutVerification(true)
              setVerificationRequest({
                verificationSessionId: response.verificationSessionId,
                purpose: "owner_payout_verify",
                phone: nextMethod.pendingAccountNumber || nextMethod.accountNumber,
                referenceId: response.payoutMethod._id,
                pendingPassword: "",
                resendAvailableInSeconds: resolveOtpResendSeconds(response.resendAvailableInSeconds),
              })
              setVerificationModalOpen(true)
              toast.info("Verify your bKash number to activate this payout method.", {
                description:
                  "The drawer is closed. Complete OTP verification to activate the new number.",
              })
              return true
            }

            toast.success("Payout method updated successfully.")
            return true
          } catch (error) {
            toast.error("Unable to update payout method.", {
              description:
                error instanceof Error ? error.message : "Please try again.",
            })
            return false
          }
        }}
        isSaving={updatePayoutMethodMutation.isPending}
      />
      <TransactionDetailsDrawer
        transaction={viewingTransaction}
        open={!!viewingTransaction}
        onOpenChange={(open) => {
          if (!open) {
            setViewingTransaction(null)
            if (searchParams.get("transaction")) {
              setSearchParams((current) => {
                const next = new URLSearchParams(current)
                next.delete("transaction")
                return next
              })
            }
          }
        }}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Available to Withdraw</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-emerald-700">{formatPayoutMoney(availableBalance)}</div>
            <div className="mt-2 text-sm text-muted-foreground">Ready for payout now</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Settlement</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-amber-700">{formatPayoutMoney(pendingBalance)}</div>
            <div className="mt-2 text-sm text-muted-foreground">Recent earnings inside T+{settlementDelayDays} hold</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">In Payout</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-slate-700">{formatPayoutMoney(requestedPayoutBalance)}</div>
            <div className="mt-2 text-sm text-muted-foreground">Reserved for admin processing</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Paid Out</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{formatPayoutMoney(paidOutBalance)}</div>
            <div className="mt-2 text-sm text-muted-foreground">Completed payouts sent to owner</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Lifetime Net Earnings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{formatPayoutMoney(lifetimeEarnings)}</div>
            <div className="mt-2 text-sm text-muted-foreground">After commission and owner discounts</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">{activeChartMeta.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activeChartData}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="primary"
                    stroke={activeChartMeta.primaryStroke}
                    fill={activeChartMeta.primaryFill}
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="secondary"
                    stroke={activeChartMeta.secondaryStroke}
                    fill={activeChartMeta.secondaryFill}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base">Payout Method & Rules</CardTitle>
            </div>
            <Button variant="outline" onClick={() => setIsMethodOpen(true)}>
              {updatePayoutMethodMutation.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : payoutMethod.type === "bank" ? (
                <Landmark className="size-4" />
              ) : (
                <WalletCards className="size-4" />
              )}
              {updatePayoutMethodMutation.isPending ? "Saving..." : "Update Method"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border bg-muted/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">
                    {payoutMethod.type === "bank" ? "Bank Account" : "bKash Wallet"}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {payoutMethod.accountName} |{" "}
                    {payoutMethod.accountNumber}
                  </div>
                  {payoutMethod.type === "bank" ? (
                    <div className="mt-1 text-sm text-muted-foreground">
                      {payoutMethod.bankName} | {payoutMethod.branchName}
                    </div>
                  ) : null}
                  {payoutMethod.pendingAccountNumber ? (
                    <div className="mt-1 text-sm text-amber-700">
                      Pending change for {payoutMethod.pendingAccountNumber}
                    </div>
                  ) : null}
                  <div className="mt-2">
                    {payoutMethod.isVerified ? (
                      <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                        Verified
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-amber-200 bg-amber-50 text-amber-700"
                      >
                        Verification Pending
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  {payoutMethod.type === "bank" ? <CreditCard className="size-5" /> : <Wallet className="size-5" />}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-muted/20 p-4 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <CalendarClock className="size-4 text-muted-foreground" />
                Settlement Rules
              </div>
              <p className="mt-2 text-muted-foreground">
                Available balance includes delivered order earnings after T+{settlementDelayDays} days.
                Commission and owner-funded discounts are already deducted before money reaches your wallet.
              </p>
              <div className="mt-3 grid gap-2 text-muted-foreground sm:grid-cols-2">
                <div>Last payout: {lastCompletedPayout ? formatPayoutMoney(lastCompletedPayout.amount) : "--"}</div>
                <div>Next settlement: {nextPayoutDate}</div>
                <div>Payout: settled by Foodbela finance</div>
                <div>You receive: available balance, paid automatically</div>
              </div>
            </div>

            {summaryBalances ? (
              <div className="rounded-2xl border bg-muted/20 p-4 text-sm">
                <div className="font-medium">Lifetime pricing breakdown</div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Food sales</div>
                    <div className="font-semibold">{formatPayoutMoney(summaryBalances.gross)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Foodbela commission</div>
                    <div className="font-semibold text-rose-700">-{formatPayoutMoney(summaryBalances.commission)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Owner discounts</div>
                    <div className="font-semibold text-rose-700">-{formatPayoutMoney(summaryBalances.discountCost)}</div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={
                  activeTab === "history"
                    ? handleDownloadPayoutHistory
                    : handleDownloadReport
                }
              >
                <Download className="size-4" />
                {activeTab === "history" ? "Export History" : "Download Report"}
              </Button>
              <Button variant="outline" onClick={handlePrintCurrentReport}>
                <ReceiptText className="size-4" />
                PDF / Print
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Payouts are settled and completed by Foodbela finance — your available balance is
              paid out automatically, no request needed.
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as PayoutTab)}>
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <TabsList className="w-full justify-start lg:w-fit">
            <TabsTrigger value="history">
              Payout History
              <span className="ml-1 text-xs text-muted-foreground">
                {filteredPayouts.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="transactions">
              Transaction Breakdown
              <span className="ml-1 text-xs text-muted-foreground">
                {filteredTransactions.length}
              </span>
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-4">
            <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:flex-wrap">
              <div className="relative w-full lg:max-w-xs">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={
                    activeTab === "history"
                      ? "Search payout ID, transaction, notes"
                      : "Search order or transaction"
                  }
                  className="pl-9"
                />
              </div>

              {activeTab === "history" ? (
                <Select
                  value={statusFilter}
                  onValueChange={(value) =>
                    setStatusFilter(value as CombinedStatusFilter)
                  }
                >
                  <SelectTrigger className="w-full lg:w-44">
                    <SelectValue placeholder="Payout status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Payout Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Select
                  value={typeFilter}
                  onValueChange={(value) =>
                    setTypeFilter(value as CombinedTypeFilter)
                  }
                >
                  <SelectTrigger className="w-full lg:w-44">
                    <SelectValue placeholder="Transaction type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Transaction Types</SelectItem>
                    <SelectItem value="earning">Earning</SelectItem>
                    <SelectItem value="payout">Payout</SelectItem>
                    <SelectItem value="refund">Refund</SelectItem>
                  </SelectContent>
                </Select>
              )}

              <OrderDateFilter
                value={dateFilter}
                onChange={setDateFilter}
              />

              <Select
                value={sortBy}
                onValueChange={(value) => setSortBy(value as SortKey)}
              >
                <SelectTrigger className="w-full lg:w-44">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="latest">Latest First</SelectItem>
                  <SelectItem value="oldest">Oldest First</SelectItem>
                  <SelectItem value="highestNet">
                    {activeTab === "history" ? "Highest Amount" : "Highest Net"}
                  </SelectItem>
                </SelectContent>
              </Select>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="justify-between lg:w-40">
                    <span className="inline-flex items-center gap-2">
                      <Columns3 className="size-4" />
                      Columns
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {activeTab === "history"
                    ? (Object.keys(payoutColumnVisibility) as PayoutColumnKey[]).map(
                        (key) => (
                          <DropdownMenuCheckboxItem
                            key={key}
                            checked={payoutColumnVisibility[key]}
                            onCheckedChange={(checked) =>
                              setPayoutColumnVisibility((current) => ({
                                ...current,
                                [key]: !!checked,
                              }))
                            }
                          >
                            {payoutColumnLabels[key]}
                          </DropdownMenuCheckboxItem>
                        )
                      )
                    : (
                        Object.keys(
                          transactionColumnVisibility
                        ) as TransactionColumnKey[]
                      ).map((key) => (
                        <DropdownMenuCheckboxItem
                          key={key}
                          checked={transactionColumnVisibility[key]}
                          onCheckedChange={(checked) =>
                            setTransactionColumnVisibility((current) => ({
                              ...current,
                              [key]: !!checked,
                            }))
                          }
                        >
                          {transactionColumnLabels[key]}
                        </DropdownMenuCheckboxItem>
                      ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button variant="outline" onClick={resetFilters} disabled={resetDisabled}>
                <RotateCcw className="size-4" />
                Reset
              </Button>
            </div>
          </div>
        </div>

        <TabsContent value="history" className="space-y-4">
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <Table className="min-w-[980px]">
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Payout</TableHead>
                    {payoutColumnVisibility.amount ? <TableHead>Amount</TableHead> : null}
                    {payoutColumnVisibility.status ? <TableHead>Status</TableHead> : null}
                    {payoutColumnVisibility.notes ? <TableHead>Notes</TableHead> : null}
                    {payoutColumnVisibility.transaction ? <TableHead>Transaction ID</TableHead> : null}
                    {payoutColumnVisibility.method ? <TableHead>Method</TableHead> : null}
                    {payoutColumnVisibility.date ? <TableHead>Date</TableHead> : null}
                    <TableHead className="pr-4 text-right lg:pr-6">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedPayouts.length > 0 ? (
                    paginatedPayouts.map((payout) => (
                      <TableRow key={payout.id}>
                        <TableCell className="font-medium">{payout.id}</TableCell>
                        {payoutColumnVisibility.amount ? (
                          <TableCell>{formatPayoutMoney(payout.amount)}</TableCell>
                        ) : null}
                        {payoutColumnVisibility.status ? (
                          <TableCell>{getPayoutBadge(payout.status)}</TableCell>
                        ) : null}
                        {payoutColumnVisibility.notes ? (
                          <TableCell className="max-w-56 text-sm text-muted-foreground">
                            {payout.failureReason ?? "No issues reported"}
                          </TableCell>
                        ) : null}
                        {payoutColumnVisibility.transaction ? (
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {payout.transactionId}
                          </TableCell>
                        ) : null}
                        {payoutColumnVisibility.method ? (
                          <TableCell>{payout.method === "bank" ? "Bank" : "bKash"}</TableCell>
                        ) : null}
                        {payoutColumnVisibility.date ? (
                          <TableCell>{format(new Date(payout.createdAt), "dd MMM yyyy")}</TableCell>
                        ) : null}
                        <TableCell className="pr-4 text-right lg:pr-6">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setViewingPayout(payout)}
                          >
                            <ReceiptText className="size-4" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="p-8">
                        <Empty>
                          <EmptyHeader>
                            <EmptyMedia variant="icon">
                              <ReceiptText className="size-4" />
                            </EmptyMedia>
                            <EmptyTitle>No payouts found</EmptyTitle>
                            <EmptyDescription>
                              Completed, processing, and failed payouts will appear here once settlements begin.
                            </EmptyDescription>
                          </EmptyHeader>
                          <EmptyContent>
                            <Button variant="outline" onClick={resetFilters}>
                              <RotateCcw className="size-4" />
                              Reset Filters
                            </Button>
                          </EmptyContent>
                        </Empty>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-2xl border bg-card px-4 py-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {paginatedPayouts.length} of {payoutTotal} payout(s)
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={handleDownloadPayoutHistory}
              >
                <Download className="size-4" />
                Export History
              </Button>
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={handlePrintCurrentReport}
              >
                <ReceiptText className="size-4" />
                PDF / Print
              </Button>
              <Select
                value={`${payoutPageSize}`}
                onValueChange={(value) => setPayoutPageSize(Number(value))}
              >
                <SelectTrigger className="w-full sm:w-32">
                  <SelectValue placeholder="Rows" />
                </SelectTrigger>
                <SelectContent side="top">
                  {pageSizeOptions.map((size) => (
                    <SelectItem key={size} value={`${size}`}>
                      {size} / page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-sm font-medium">
                Page {safePayoutPageIndex + 1} of {payoutPageCount}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPayoutPageIndex((current) => Math.max(0, current - 1))}
                  disabled={safePayoutPageIndex === 0}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setPayoutPageIndex((current) =>
                      Math.min(payoutPageCount - 1, current + 1)
                    )
                  }
                  disabled={safePayoutPageIndex >= payoutPageCount - 1}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="transactions" className="space-y-4">
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <Table className="min-w-[1180px]">
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Order</TableHead>
                    {transactionColumnVisibility.type ? <TableHead>Type</TableHead> : null}
                    {transactionColumnVisibility.gross ? <TableHead>Food Sales</TableHead> : null}
                    {transactionColumnVisibility.commission ? <TableHead>Commission</TableHead> : null}
                    {transactionColumnVisibility.discount ? <TableHead>Owner Discount</TableHead> : null}
                    {transactionColumnVisibility.net ? <TableHead>Owner Earning</TableHead> : null}
                    {transactionColumnVisibility.settlement ? <TableHead>Settlement</TableHead> : null}
                    {transactionColumnVisibility.created ? <TableHead>Created</TableHead> : null}
                    {transactionColumnVisibility.available ? <TableHead>Available</TableHead> : null}
                    <TableHead className="pr-4 text-right lg:pr-6">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedTransactions.length > 0 ? (
                    paginatedTransactions.map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium">{transaction.orderNumber}</div>
                            <div className="text-xs text-muted-foreground">{transaction.orderId}</div>
                          </div>
                        </TableCell>
                        {transactionColumnVisibility.type ? (
                          <TableCell>{getTransactionBadge(transaction.type)}</TableCell>
                        ) : null}
                        {transactionColumnVisibility.gross ? (
                          <TableCell>{formatPayoutMoney(transaction.grossAmount)}</TableCell>
                        ) : null}
                        {transactionColumnVisibility.commission ? (
                          <TableCell>-{formatPayoutMoney(transaction.commission)}</TableCell>
                        ) : null}
                        {transactionColumnVisibility.discount ? (
                          <TableCell>-{formatPayoutMoney(transaction.discountCost)}</TableCell>
                        ) : null}
                        {transactionColumnVisibility.net ? (
                          <TableCell
                            className={
                              transaction.netAmount >= 0
                                ? "font-medium text-emerald-700"
                                : "font-medium text-rose-700"
                            }
                          >
                            {transaction.netAmount >= 0 ? "+" : ""}
                            {formatPayoutMoney(transaction.netAmount)}
                          </TableCell>
                        ) : null}
                        {transactionColumnVisibility.settlement ? (
                          <TableCell>{getSettlementBadge(transaction.status)}</TableCell>
                        ) : null}
                        {transactionColumnVisibility.created ? (
                          <TableCell>{format(new Date(transaction.createdAt), "dd MMM yyyy")}</TableCell>
                        ) : null}
                        {transactionColumnVisibility.available ? (
                          <TableCell>
                            {format(new Date(transaction.settlementAvailableAt), "dd MMM yyyy")}
                          </TableCell>
                        ) : null}
                        <TableCell className="pr-4 text-right lg:pr-6">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setViewingTransaction(transaction)}
                          >
                            <ReceiptText className="size-4" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={11} className="p-8">
                        <Empty>
                          <EmptyHeader>
                            <EmptyMedia variant="icon">
                              <Wallet className="size-4" />
                            </EmptyMedia>
                            <EmptyTitle>No transactions found</EmptyTitle>
                            <EmptyDescription>
                              Once orders are settled, order-level earnings and payout deductions will appear here.
                            </EmptyDescription>
                          </EmptyHeader>
                          <EmptyContent>
                            <Button variant="outline" onClick={resetFilters}>
                              <RotateCcw className="size-4" />
                              Reset Filters
                            </Button>
                          </EmptyContent>
                        </Empty>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-2xl border bg-card px-4 py-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {paginatedTransactions.length} of {transactionTotal} transaction(s)
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={handleDownloadReport}
              >
                <Download className="size-4" />
                Export Transactions
              </Button>
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={handlePrintCurrentReport}
              >
                <ReceiptText className="size-4" />
                PDF / Print
              </Button>
              <Select
                value={`${transactionPageSize}`}
                onValueChange={(value) => setTransactionPageSize(Number(value))}
              >
                <SelectTrigger className="w-full sm:w-32">
                  <SelectValue placeholder="Rows" />
                </SelectTrigger>
                <SelectContent side="top">
                  {pageSizeOptions.map((size) => (
                    <SelectItem key={size} value={`${size}`}>
                      {size} / page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-sm font-medium">
                Page {safeTransactionPageIndex + 1} of {transactionPageCount}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setTransactionPageIndex((current) => Math.max(0, current - 1))
                  }
                  disabled={safeTransactionPageIndex === 0}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setTransactionPageIndex((current) =>
                      Math.min(transactionPageCount - 1, current + 1)
                    )
                  }
                  disabled={safeTransactionPageIndex >= transactionPageCount - 1}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
