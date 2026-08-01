import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import {
  fetchAdminAccountDeletionRequests,
  updateAdminAccountDeletionRequest,
  type AdminAccountDeletionRequest,
  type AdminAccountDeletionStatus,
} from "@/lib/admin-api"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const STATUS_FILTERS: Array<{ value: "all" | AdminAccountDeletionStatus; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "reviewing", label: "Reviewing" },
  { value: "completed", label: "Completed" },
  { value: "rejected", label: "Rejected" },
]

const STATUS_OPTIONS: AdminAccountDeletionStatus[] = [
  "pending",
  "reviewing",
  "completed",
  "rejected",
]

function statusBadgeClass(status: AdminAccountDeletionStatus) {
  switch (status) {
    case "pending":
      return "border-amber-300 bg-amber-50 text-amber-800"
    case "reviewing":
      return "border-sky-300 bg-sky-50 text-sky-800"
    case "completed":
      return "border-emerald-300 bg-emerald-50 text-emerald-800"
    case "rejected":
      return "border-rose-300 bg-rose-50 text-rose-800"
    default:
      return "border-slate-300 bg-slate-50 text-slate-700"
  }
}

function formatDate(value: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString()
}

export function AccountDeletionRequestsCard() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<"all" | AdminAccountDeletionStatus>(
    "pending",
  )

  const requestsQuery = useQuery({
    queryKey: ["admin-account-deletion-requests", statusFilter],
    queryFn: () => fetchAdminAccountDeletionRequests({ status: statusFilter, pageSize: 50 }),
  })

  const updateMutation = useMutation({
    mutationFn: updateAdminAccountDeletionRequest,
    onSuccess: () => {
      toast.success("Deletion request updated")
      void queryClient.invalidateQueries({
        queryKey: ["admin-account-deletion-requests"],
      })
    },
    onError: () => {
      toast.error("Could not update the request. Try again.")
    },
  })

  const items = requestsQuery.data?.items ?? []
  const pendingCount = requestsQuery.data?.pendingCount ?? 0
  const configEnabled = requestsQuery.data?.config?.enabled

  const emptyLabel = useMemo(() => {
    if (requestsQuery.isLoading) return "Loading requests…"
    if (requestsQuery.isError) return "Could not load requests."
    return "No deletion requests in this view."
  }, [requestsQuery.isLoading, requestsQuery.isError])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Account deletion requests
          {pendingCount > 0 ? (
            <Badge className="border-amber-300 bg-amber-50 font-semibold text-amber-800">
              {pendingCount} pending
            </Badge>
          ) : null}
          {configEnabled === false ? (
            <Badge className="border-slate-300 bg-slate-100 font-medium text-slate-600">
              Feature disabled
            </Badge>
          ) : null}
        </CardTitle>
        <CardDescription>
          Customers who requested account/data deletion from the app. Verify identity,
          then delete their data and mark the request <b>Completed</b> (or <b>Rejected</b>).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filter</span>
          <Select
            value={statusFilter}
            onValueChange={(value) =>
              setStatusFilter(value as "all" | AdminAccountDeletionStatus)
            }
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((filter) => (
                <SelectItem key={filter.value} value={filter.value}>
                  {filter.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {emptyLabel}
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((request: AdminAccountDeletionRequest) => (
              <div
                key={request.id}
                className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{request.phone}</span>
                    {request.customerName ? (
                      <span className="text-sm text-muted-foreground">
                        {request.customerName}
                      </span>
                    ) : null}
                    <Badge
                      variant="outline"
                      className={statusBadgeClass(request.status)}
                    >
                      {request.status}
                    </Badge>
                    {request.customerId ? null : (
                      <Badge
                        variant="outline"
                        className="border-slate-300 bg-slate-50 text-slate-600"
                      >
                        No matching account
                      </Badge>
                    )}
                  </div>
                  {request.reason ? (
                    <p className="text-sm text-muted-foreground">“{request.reason}”</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    Requested {formatDate(request.createdAt)}
                  </p>
                </div>
                <Select
                  value={request.status}
                  onValueChange={(value) =>
                    updateMutation.mutate({
                      id: request.id,
                      status: value as AdminAccountDeletionStatus,
                    })
                  }
                  disabled={updateMutation.isPending}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
