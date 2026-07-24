import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import L from "leaflet"
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet"
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"
import {
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  Eye,
  FileCheck2,
  FileWarning,
  Loader2,
  MapPin,
  MoreHorizontal,
  Navigation,
  PackageCheck,
  Play,
  Printer,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  Truck,
  UserPlus,
  WalletCards,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"
import { useSearchParams } from "react-router-dom"

import { escapeHtml, printReport } from "@/lib/export-utils"

import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { generatePinPassword, isPinPassword } from "@/lib/pin-password"
import { useAdminRefreshPolicy } from "@/lib/refresh-policy"
import { cn } from "@/lib/utils"
import {
  getAdminZoneScope,
  subscribeAdminZoneScope,
} from "@/lib/admin-zone-scope"
import {
  addAdminRiderPayrollAdjustment,
  assignAdminRider,
  bulkAssignAdminRiders,
  createAdminRider,
  getAdminDispatchSettings,
  getAdminLiveMap,
  getAdminRider,
  getAdminServiceAreas,
  listAdminDispatchLogs,
  listAdminRiderPayroll,
  listAdminRiderAssignmentCandidates,
  listAdminRiders,
  listAdminRidersAssignmentOptions,
  runAdminAutoDispatch,
  setAdminRiderActiveTrip,
  updateAdminDispatchSettings,
  updateAdminRiderAvailability,
  updateAdminRiderPayrollSettings,
  updateAdminRiderPayrollStatus,
  updateAdminRiderStatus,
  updateAdminRiderVerification,
  type AdminDispatchSettings,
  type AdminLiveMapDelivery,
  type AdminLiveMapRider,
  type AdminRiderAssignmentCandidate,
  type AdminRiderAssignmentOption,
  type AdminRiderDetails,
  type AdminRiderPayrollSnapshot,
  type AdminRiderSummary,
  type AdminServiceZone,
} from "@/lib/admin-api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"

import "leaflet/dist/leaflet.css"

type RiderStatusFilter = "all" | "active" | "suspended" | "locked"
type RiderAvailabilityFilter = "all" | "available" | "unavailable"
type RiderVerificationFilter =
  | "all"
  | "pending"
  | "approved"
  | "rejected"
  | "missing"
type RiderSort = "newest" | "recentLogin" | "mostActive" | "mostDelivered"
type RiderStatus = "active" | "suspended" | "locked"
type RiderVerificationStatus = "pending" | "approved" | "rejected"
const riderMainTabValues = [
  "directory",
  "kyc",
  "live",
  "assignments",
  "earnings",
  "analytics",
  "dispatch",
] as const
type RiderMainTab = (typeof riderMainTabValues)[number]
const riderDetailsTabValues = [
  "overview",
  "availability",
  "kyc",
  "earnings",
  "performance",
  "live-assignment",
  "active",
  "trips",
  "devices",
] as const
type RiderDetailsTab = (typeof riderDetailsTabValues)[number]
type EditableDispatchSettings = Omit<
  AdminDispatchSettings,
  "metrics" | "recentLogs"
>

function normalizeRiderMainTab(value?: string | null): RiderMainTab {
  return riderMainTabValues.includes(value as RiderMainTab)
    ? (value as RiderMainTab)
    : "directory"
}

function normalizeRiderDetailsTab(value?: string | null): RiderDetailsTab {
  return riderDetailsTabValues.includes(value as RiderDetailsTab)
    ? (value as RiderDetailsTab)
    : "overview"
}

const pageSizeOptions = [10, 20, 50]
const netrokonaCenter: [number, number] = [24.8835, 90.7312]
const performanceChartConfig = {
  deliveredTrips: {
    label: "Delivered",
    color: "var(--chart-1)",
  },
  completionRate: {
    label: "Completion",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

const riderMarkerIcon = L.divIcon({
  className: "",
  html: '<div style="height:18px;width:18px;border-radius:999px;background:#0f766e;border:3px solid white;box-shadow:0 2px 10px rgba(15,118,110,.35)"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

const restaurantMarkerIcon = L.divIcon({
  className: "",
  html: '<div style="height:18px;width:18px;border-radius:4px;background:#2563eb;border:3px solid white;box-shadow:0 2px 10px rgba(37,99,235,.35)"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

const customerMarkerIcon = L.divIcon({
  className: "",
  html: '<div style="height:18px;width:18px;border-radius:999px;background:#e11d48;border:3px solid white;box-shadow:0 2px 10px rgba(225,29,72,.35)"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

function formatDate(value?: string | null) {
  if (!value) return "N/A"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "N/A"
  return date.toLocaleString()
}

function formatCurrency(value: number) {
  return `Tk ${Math.round(Number.isFinite(value) ? value : 0).toLocaleString()}`
}

function formatMinutes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 min"
  if (value < 60) return `${Math.round(value)} min`
  const hours = Math.floor(value / 60)
  const minutes = Math.round(value % 60)
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`
}

function formatDurationSeconds(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 min"
  const minutes = Math.floor(value / 60)
  if (minutes < 60) return `${Math.max(1, minutes)} min`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`
}

function humanizeKey(value?: string | null) {
  if (!value) return "N/A"
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatPayrollAdjustmentType(value: string) {
  if (value === "bonus") return "Allowance"
  if (value === "tip") return "Allowance"
  return humanizeKey(value)
}

function getRiderStatusBadgeClass(status: string) {
  if (status === "active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700"
  }
  if (status === "suspended") {
    return "border-amber-200 bg-amber-50 text-amber-700"
  }
  return "border-rose-200 bg-rose-50 text-rose-700"
}

function getVerificationBadgeClass(status: string) {
  if (status === "approved")
    return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (status === "rejected")
    return "border-rose-200 bg-rose-50 text-rose-700"
  return "border-amber-200 bg-amber-50 text-amber-700"
}

function getDeliveryStatusBadgeClass(status: string) {
  if (status === "PickedUp")
    return "border-violet-200 bg-violet-50 text-violet-700"
  return "border-sky-200 bg-sky-50 text-sky-700"
}

function getPoint(
  location?: {
    latitude?: number | null
    longitude?: number | null
  } | null
): [number, number] | null {
  if (
    typeof location?.latitude !== "number" ||
    typeof location?.longitude !== "number" ||
    !Number.isFinite(location.latitude) ||
    !Number.isFinite(location.longitude)
  ) {
    return null
  }

  return [location.latitude, location.longitude]
}

function coordinateLabel(
  location?: {
    latitude?: number | null
    longitude?: number | null
  } | null
) {
  if (
    typeof location?.latitude !== "number" ||
    typeof location?.longitude !== "number"
  ) {
    return "No location"
  }

  return `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`
}

function mapsUrl(
  location?: {
    latitude?: number | null
    longitude?: number | null
  } | null
) {
  if (
    typeof location?.latitude !== "number" ||
    typeof location?.longitude !== "number"
  ) {
    return ""
  }

  return `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`
}

function StatCard({
  label,
  value,
  helper,
}: {
  label: string
  value: React.ReactNode
  helper: string
}) {
  return (
    <Card>
      <CardContent className="pt-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-72 text-right font-medium">{value}</span>
    </div>
  )
}

function invalidateRiderQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  riderId?: string
) {
  void queryClient.invalidateQueries({ queryKey: ["admin-riders"] })
  void queryClient.invalidateQueries({ queryKey: ["admin-rider-payroll"] })
  void queryClient.invalidateQueries({ queryKey: ["admin-live-map"] })
  void queryClient.invalidateQueries({ queryKey: ["admin-rider-candidates"] })
  void queryClient.invalidateQueries({
    queryKey: ["admin-rider-assignment-options"],
  })
  if (riderId) {
    void queryClient.invalidateQueries({ queryKey: ["admin-rider", riderId] })
  }
}

function CreateRiderDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [fullName, setFullName] = React.useState("")
  const [phone, setPhone] = React.useState("")
  const [temporaryPassword, setTemporaryPassword] = React.useState(() =>
    generatePinPassword()
  )
  const [status, setStatus] = React.useState<RiderStatus>("active")
  const [verificationStatus, setVerificationStatus] =
    React.useState<RiderVerificationStatus>("pending")
  const [nationalIdNumber, setNationalIdNumber] = React.useState("")
  const [monthlySalary, setMonthlySalary] = React.useState("0")
  const [primaryZoneId, setPrimaryZoneId] = React.useState("")
  const serviceAreasQuery = useQuery({
    queryKey: ["admin-service-areas", "rider-create"],
    queryFn: getAdminServiceAreas,
    staleTime: 60_000,
  })
  const serviceZones = React.useMemo(
    () =>
      (serviceAreasQuery.data?.zones ?? []).filter(
        (zone: AdminServiceZone) => zone.status === "active"
      ),
    [serviceAreasQuery.data?.zones]
  )
  React.useEffect(() => {
    if (!primaryZoneId && serviceZones[0]?.id) {
      setPrimaryZoneId(serviceZones[0].id)
    }
  }, [primaryZoneId, serviceZones])
  const mutation = useMutation({
    mutationFn: createAdminRider,
    onSuccess: () => {
      toast.success("Rider created.")
      setFullName("")
      setPhone("")
      setTemporaryPassword(generatePinPassword())
      setStatus("active")
      setVerificationStatus("pending")
      setNationalIdNumber("")
      setMonthlySalary("0")
      setPrimaryZoneId("")
      invalidateRiderQueries(queryClient)
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Rider create failed.")
    },
  })

  function regenerateRiderPin() {
    setTemporaryPassword(generatePinPassword())
  }

  async function copyRiderPin() {
    try {
      await navigator.clipboard.writeText(temporaryPassword)
      toast.success("Temporary PIN copied.")
    } catch {
      toast.error("Could not copy PIN.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add rider</DialogTitle>
          <DialogDescription>
            Create a real rider profile for delivery assignment.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="rider-name">Full name</Label>
            <Input
              id="rider-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Rider name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rider-phone">Phone</Label>
            <Input
              id="rider-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="01XXXXXXXXX"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rider-password">Temporary password</Label>
            <div className="flex gap-2">
              <Input
                id="rider-password"
                value={temporaryPassword}
                onChange={(event) =>
                  setTemporaryPassword(
                    event.target.value.replace(/\D/g, "").slice(0, 6)
                  )
                }
                inputMode="numeric"
                maxLength={6}
                aria-invalid={Boolean(temporaryPassword && !isPinPassword(temporaryPassword))}
              />
              <Button type="button" variant="outline" size="icon" onClick={regenerateRiderPin}>
                <RotateCcw className="size-4" />
                <span className="sr-only">Generate new PIN</span>
              </Button>
              <Button type="button" variant="outline" size="icon" onClick={() => void copyRiderPin()}>
                <Copy className="size-4" />
                <span className="sr-only">Copy PIN</span>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Rider can sign in with phone number and this 6-digit PIN.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as RiderStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="locked">Locked</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>KYC status</Label>
            <Select
              value={verificationStatus}
              onValueChange={(value) =>
                setVerificationStatus(value as RiderVerificationStatus)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Primary service area</Label>
            <Select value={primaryZoneId} onValueChange={setPrimaryZoneId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    serviceAreasQuery.isLoading
                      ? "Loading service areas"
                      : "Choose rider zone"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {serviceZones.map((zone) => (
                  <SelectItem key={zone.id} value={zone.id}>
                    {zone.districtName} / {zone.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Auto dispatch will prefer orders from this zone for this rider.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rider-nid">National ID (optional)</Label>
            <Input
              id="rider-nid"
              value={nationalIdNumber}
              onChange={(event) => setNationalIdNumber(event.target.value)}
              placeholder="NID or verification reference"
            />
          </div>
          <div className="grid gap-3">
            <div className="space-y-2">
              <Label htmlFor="rider-salary">Monthly salary</Label>
              <Input
                id="rider-salary"
                type="number"
                min={0}
                value={monthlySalary}
                onChange={(event) => setMonthlySalary(event.target.value)}
                placeholder="0"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Salary cycle starts from the rider creation date and renews on the same date next month.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={
              !fullName.trim() ||
              !phone.trim() ||
              !isPinPassword(temporaryPassword) ||
              !primaryZoneId ||
              mutation.isPending
            }
            onClick={() =>
              mutation.mutate({
                fullName,
                phone,
                temporaryPassword,
                status,
                verificationStatus,
                nationalIdNumber,
                monthlySalary: Number(monthlySalary) || 0,
                payoutDay: 1,
                primaryZoneId,
                assignedZoneIds: primaryZoneId ? [primaryZoneId] : [],
                isAvailableForAssignments:
                  status === "active" && verificationStatus === "approved",
              })
            }
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <UserPlus className="size-4" />
            )}
            Create rider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RiderStatusDialog({
  target,
  onOpenChange,
}: {
  target: null | { rider: AdminRiderSummary; status: RiderStatus }
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: updateAdminRiderStatus,
    onSuccess: () => {
      toast.success("Rider status updated.")
      invalidateRiderQueries(queryClient, target?.rider.id)
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Rider status update failed."
      )
      invalidateRiderQueries(queryClient, target?.rider.id)
    },
  })
  const isRisky = target?.status !== "active"

  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {target?.status === "active" ? "Activate rider" : "Restrict rider"}
          </DialogTitle>
          <DialogDescription>
            {target?.rider.fullName} will move from {target?.rider.status} to{" "}
            {target?.status}. Current status is checked before saving.
          </DialogDescription>
        </DialogHeader>
        {isRisky ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Riders with active deliveries cannot be suspended or locked.
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={isRisky ? "destructive" : "default"}
            disabled={!target || mutation.isPending}
            onClick={() => {
              if (!target) return
              mutation.mutate({
                riderId: target.rider.id,
                expectedStatus: target.rider.status,
                status: target.status,
              })
            }}
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : target?.status === "active" ? (
              <CheckCircle2 className="size-4" />
            ) : (
              <Ban className="size-4" />
            )}
            Save status
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RiderVerificationDialog({
  target,
  onOpenChange,
}: {
  target: null | {
    rider: AdminRiderSummary
    status: RiderVerificationStatus
  }
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [note, setNote] = React.useState("")
  const mutation = useMutation({
    mutationFn: updateAdminRiderVerification,
    onSuccess: () => {
      toast.success("Rider KYC updated.")
      invalidateRiderQueries(queryClient, target?.rider.id)
      setNote("")
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "KYC update failed.")
      invalidateRiderQueries(queryClient, target?.rider.id)
    },
  })

  React.useEffect(() => {
    if (!target) setNote("")
  }, [target])

  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {target?.status === "approved"
              ? "Approve rider KYC"
              : target?.status === "rejected"
                ? "Reject rider KYC"
                : "Move KYC to pending"}
          </DialogTitle>
          <DialogDescription>
            {target?.rider.fullName} will move from{" "}
            {target?.rider.verification.status} to {target?.status}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="kyc-note">Review note</Label>
          <Textarea
            id="kyc-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Internal KYC decision note"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={target?.status === "rejected" ? "destructive" : "default"}
            disabled={!target || mutation.isPending}
            onClick={() => {
              if (!target) return
              mutation.mutate({
                riderId: target.rider.id,
                expectedStatus: target.rider.verification.status,
                status: target.status,
                note,
              })
            }}
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : target?.status === "approved" ? (
              <FileCheck2 className="size-4" />
            ) : (
              <FileWarning className="size-4" />
            )}
            Save KYC
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RiderActionsMenu({
  rider,
  onView,
  onStatus,
  onVerification,
}: {
  rider: AdminRiderSummary
  onView: () => void
  onStatus: (rider: AdminRiderSummary, status: RiderStatus) => void
  onVerification: (
    rider: AdminRiderSummary,
    status: RiderVerificationStatus
  ) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="data-[state=open]:bg-muted"
          aria-label={`Open actions for ${rider.fullName}`}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem onClick={onView}>
          <Eye className="size-4" />
          View details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onVerification(rider, "approved")}>
          <FileCheck2 className="size-4" />
          Approve KYC
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onVerification(rider, "rejected")}>
          <FileWarning className="size-4" />
          Reject KYC
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {rider.status !== "active" ? (
          <DropdownMenuItem onClick={() => onStatus(rider, "active")}>
            <CheckCircle2 className="size-4" />
            Activate
          </DropdownMenuItem>
        ) : null}
        {rider.status !== "suspended" ? (
          <DropdownMenuItem onClick={() => onStatus(rider, "suspended")}>
            <ShieldAlert className="size-4" />
            Suspend
          </DropdownMenuItem>
        ) : null}
        {rider.status !== "locked" ? (
          <DropdownMenuItem
            variant="destructive"
            onClick={() => onStatus(rider, "locked")}
          >
            <XCircle className="size-4" />
            Lock account
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function RiderDetailsSheet({
  riderId,
  open,
  activeTab,
  refreshIntervalMs,
  onOpenChange,
  onTabChange,
  onStatus,
  onVerification,
}: {
  riderId: string
  open: boolean
  activeTab: RiderDetailsTab
  refreshIntervalMs: number
  onOpenChange: (open: boolean) => void
  onTabChange: (tab: RiderDetailsTab) => void
  onStatus: (rider: AdminRiderSummary, status: RiderStatus) => void
  onVerification: (
    rider: AdminRiderSummary,
    status: RiderVerificationStatus
  ) => void
}) {
  const queryClient = useQueryClient()
  const detailsQuery = useQuery({
    queryKey: ["admin-rider", riderId],
    queryFn: () => getAdminRider(riderId),
    enabled: open && Boolean(riderId),
    refetchInterval: open && riderId ? refreshIntervalMs || false : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  })
  const rider = detailsQuery.data
  const [salaryDraft, setSalaryDraft] = React.useState("0")
  const [adjustmentType, setAdjustmentType] =
    React.useState<"bonus" | "tip" | "reimbursement" | "penalty" | "deduction">("bonus")
  const [adjustmentAmount, setAdjustmentAmount] = React.useState("")
  const [adjustmentNote, setAdjustmentNote] = React.useState("")
  const [paymentReference, setPaymentReference] = React.useState("")
  const payrollSettingsMutation = useMutation({
    mutationFn: updateAdminRiderPayrollSettings,
    onSuccess: () => {
      toast.success("Rider salary settings updated.")
      invalidateRiderQueries(queryClient, riderId)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Salary update failed.")
    },
  })
  const adjustmentMutation = useMutation({
    mutationFn: addAdminRiderPayrollAdjustment,
    onSuccess: () => {
      toast.success("Payroll adjustment added.")
      setAdjustmentAmount("")
      setAdjustmentNote("")
      invalidateRiderQueries(queryClient, riderId)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Adjustment failed.")
    },
  })
  const payrollStatusMutation = useMutation({
    mutationFn: updateAdminRiderPayrollStatus,
    onSuccess: () => {
      toast.success("Payroll status updated.")
      invalidateRiderQueries(queryClient, riderId)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Payroll status update failed.")
    },
  })
  const activeTripMutation = useMutation({
    mutationFn: setAdminRiderActiveTrip,
    onSuccess: () => {
      toast.success("Live trip switched. The customer map will update instantly.")
      invalidateRiderQueries(queryClient, riderId)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not switch live trip.")
    },
  })

  React.useEffect(() => {
    if (!rider) return
    setSalaryDraft(`${rider.payroll.monthlySalary ?? 0}`)
  }, [rider])

  const handleExportStatement = () => {
    if (!rider) return
    const payroll = rider.payroll
    const adjustmentsHtml = payroll.adjustments.length
      ? payroll.adjustments
          .map(
            (adjustment) =>
              `<tr><td>${escapeHtml(formatDate(adjustment.createdAt))}</td><td>${escapeHtml(adjustment.type)}</td><td>${escapeHtml(adjustment.note || "-")}</td><td>${escapeHtml(formatCurrency(adjustment.amount))}</td></tr>`,
          )
          .join("")
      : `<tr><td colspan="4" class="muted">No adjustments this cycle</td></tr>`

    const printed = printReport(
      `Rider statement - ${rider.fullName}`,
      `
        <p class="muted">${escapeHtml(rider.phone)} - ${escapeHtml(rider.vehicleType)}</p>
        <div class="grid">
          <div class="metric"><span class="muted">Delivered trips</span><strong>${escapeHtml(rider.summary.deliveredTrips)}</strong></div>
          <div class="metric"><span class="muted">Completion rate</span><strong>${escapeHtml(Math.round(rider.completionRate))}%</strong></div>
          <div class="metric"><span class="muted">Base salary</span><strong>${escapeHtml(formatCurrency(payroll.baseSalary))}</strong></div>
          <div class="metric"><span class="muted">Bonus</span><strong>${escapeHtml(formatCurrency(payroll.platformBonus))}</strong></div>
          <div class="metric"><span class="muted">Penalties</span><strong>${escapeHtml(formatCurrency(payroll.penalties))}</strong></div>
          <div class="metric"><span class="muted">Net payable</span><strong>${escapeHtml(formatCurrency(payroll.netPayable))}</strong></div>
          <div class="metric"><span class="muted">Paid</span><strong>${escapeHtml(formatCurrency(payroll.paidAmount))}</strong></div>
          <div class="metric"><span class="muted">Pending</span><strong>${escapeHtml(formatCurrency(payroll.pendingAmount))}</strong></div>
        </div>
        <table>
          <thead><tr><th>Date</th><th>Type</th><th>Note</th><th>Amount</th></tr></thead>
          <tbody>${adjustmentsHtml}</tbody>
        </table>
      `,
    )
    if (!printed) toast.error("Popup blocked. Allow popups to print PDF.")
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-3xl! md:max-w-6xl!">
        <SheetHeader className="border-b">
          <SheetTitle>{rider?.fullName ?? "Rider details"}</SheetTitle>
          <SheetDescription>
            Rider profile, active delivery load, salary, devices, and recent
            trips.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          {detailsQuery.isPending ? (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading rider details...
            </div>
          ) : rider ? (
            <div className="space-y-5 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={getRiderStatusBadgeClass(rider.status)}
                    >
                      {rider.status}
                    </Badge>
                    <Badge variant="outline">
                      {rider.isAvailableForAssignments
                        ? "Available"
                        : "Unavailable"}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={getVerificationBadgeClass(
                        rider.verification.status
                      )}
                    >
                      KYC {rider.verification.status}
                    </Badge>
                    {rider.activeTrackingOrderId ? (
                      <Badge variant="outline">Tracking active</Badge>
                    ) : null}
                  </div>
                  <h2 className="mt-2 text-xl font-semibold">
                    {rider.fullName}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {rider.phone} - {rider.vehicleType}
                  </p>
                </div>
                <div className="flex flex-col gap-3 lg:items-end">
                  <div className="text-sm text-muted-foreground">
                    Last login: {formatDate(rider.lastLoginAt)}
                  </div>
                  <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleExportStatement}
                    >
                      <Printer className="size-4" />
                      Export statement
                    </Button>
                    {rider.verification.status !== "approved" ? (
                      <Button
                        size="sm"
                        onClick={() => onVerification(rider, "approved")}
                      >
                        <FileCheck2 className="size-4" />
                        Approve KYC
                      </Button>
                    ) : null}
                    {rider.verification.status !== "rejected" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onVerification(rider, "rejected")}
                      >
                        <FileWarning className="size-4" />
                        Reject KYC
                      </Button>
                    ) : null}
                    {rider.status !== "active" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onStatus(rider, "active")}
                      >
                        <CheckCircle2 className="size-4" />
                        Activate
                      </Button>
                    ) : null}
                    {rider.status !== "suspended" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={rider.summary.activeOrders > 0}
                        onClick={() => onStatus(rider, "suspended")}
                      >
                        <ShieldAlert className="size-4" />
                        Suspend
                      </Button>
                    ) : null}
                    {rider.status !== "locked" ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={rider.summary.activeOrders > 0}
                        onClick={() => onStatus(rider, "locked")}
                      >
                        <XCircle className="size-4" />
                        Lock
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <StatCard
                  label="Active orders"
                  value={`${rider.summary.activeOrders}`}
                  helper="Ready or picked up"
                />
                <StatCard
                  label="Live trips"
                  value={`${rider.summary.liveTrips}`}
                  helper="Currently picked up"
                />
                <StatCard
                  label="Delivered trips"
                  value={`${rider.summary.deliveredTrips}`}
                  helper="Completed deliveries"
                />
                <StatCard
                  label="Salary default"
                  value={formatCurrency(rider.payroll.baseSalary)}
                  helper="Not counted until paid"
                />
              </div>

              <Tabs
                value={activeTab}
                onValueChange={(value) =>
                  onTabChange(normalizeRiderDetailsTab(value))
                }
                className="gap-4"
              >
                <TabsList className="flex h-auto w-full flex-wrap justify-start">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="availability">Availability</TabsTrigger>
                  <TabsTrigger value="kyc">KYC</TabsTrigger>
                  <TabsTrigger value="earnings">Payroll</TabsTrigger>
                  <TabsTrigger value="performance">Performance</TabsTrigger>
                  <TabsTrigger value="live-assignment">Live assignment</TabsTrigger>
                  <TabsTrigger value="active">Active orders</TabsTrigger>
                  <TabsTrigger value="trips">Recent trips</TabsTrigger>
                  <TabsTrigger value="devices">Devices</TabsTrigger>
                </TabsList>

                <TabsContent value="overview">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <Card>
                      <CardHeader>
                        <CardTitle>Profile</CardTitle>
                        <CardDescription>Account and dispatch state.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm">
                        <InfoRow label="Name" value={rider.fullName} />
                        <InfoRow label="Phone" value={rider.phone} />
                        <InfoRow label="Vehicle" value={rider.vehicleType} />
                        <InfoRow label="Created" value={formatDate(rider.createdAt)} />
                        <InfoRow label="Updated" value={formatDate(rider.updatedAt)} />
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader>
                        <CardTitle>Location</CardTitle>
                        <CardDescription>Last known rider position.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm">
                        <InfoRow
                          label="Coordinates"
                          value={coordinateLabel(rider.lastKnownLocation)}
                        />
                        <InfoRow
                          label="Last update"
                          value={formatDate(rider.lastKnownLocation?.lastUpdatedAt)}
                        />
                        <InfoRow
                          label="Speed"
                          value={`${rider.lastKnownLocation?.speedKmph ?? 0} km/h`}
                        />
                        {mapsUrl(rider.lastKnownLocation) ? (
                          <Button asChild variant="outline" className="w-full">
                            <a
                              href={mapsUrl(rider.lastKnownLocation)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <MapPin className="size-4" />
                              Open map
                            </a>
                          </Button>
                        ) : null}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="availability">
                  <RiderAvailabilityPanel availability={rider.availability} />
                </TabsContent>

                <TabsContent value="kyc">
                  <Card>
                    <CardHeader>
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <CardTitle>KYC verification</CardTitle>
                          <CardDescription>
                            Admin-reviewed rider verification state.
                          </CardDescription>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            disabled={rider.verification.status === "approved"}
                            onClick={() => onVerification(rider, "approved")}
                          >
                            <FileCheck2 className="size-4" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={rider.verification.status === "rejected"}
                            onClick={() => onVerification(rider, "rejected")}
                          >
                            <FileWarning className="size-4" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="grid gap-3 text-sm md:grid-cols-2">
                      <InfoRow
                        label="Status"
                        value={
                          <Badge
                            variant="outline"
                            className={getVerificationBadgeClass(
                              rider.verification.status
                            )}
                          >
                            {rider.verification.status}
                          </Badge>
                        }
                      />
                      <InfoRow
                        label="Has documents"
                        value={rider.verification.hasDocuments ? "Yes" : "No"}
                      />
                      <InfoRow
                        label="National ID"
                        value={rider.verification.nationalIdNumber || "N/A"}
                      />
                      <InfoRow
                        label="Submitted"
                        value={formatDate(rider.verification.submittedAt)}
                      />
                      <InfoRow
                        label="Reviewed"
                        value={formatDate(rider.verification.reviewedAt)}
                      />
                      <InfoRow
                        label="Review note"
                        value={rider.verification.reviewNote || "N/A"}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="earnings">
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-4">
                      <StatCard
                        label="Salary default"
                        value={formatCurrency(rider.payroll.baseSalary)}
                        helper="Used when marking paid"
                      />
                      <StatCard
                        label="Bonus / adjustment"
                        value={formatCurrency(rider.payroll.platformBonus)}
                        helper="For this payment record"
                      />
                      <StatCard
                        label="Penalty"
                        value={formatCurrency(rider.payroll.penalties)}
                        helper="Penalty or deduction"
                      />
                      <StatCard
                        label="Payment total"
                        value={formatCurrency(rider.payroll.netPayable)}
                        helper={`Status: ${rider.payroll.status}`}
                      />
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                      <Card>
                        <CardHeader>
                          <CardTitle>Salary settings</CardTitle>
                          <CardDescription>
                            Default monthly salary. It does not affect platform finance until a payment is marked paid.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="grid gap-3">
                            <div className="space-y-2">
                              <Label>Monthly salary</Label>
                              <Input
                                type="number"
                                min={0}
                                value={salaryDraft}
                                onChange={(event) => setSalaryDraft(event.target.value)}
                              />
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            This value is only the default amount for the manual payment record.
                          </p>
                          <Button
                            disabled={payrollSettingsMutation.isPending}
                            onClick={() =>
                              payrollSettingsMutation.mutate({
                                riderId: rider.id,
                                monthlySalary: Number(salaryDraft) || 0,
                                payoutDay: 1,
                                isPayrollEnabled: true,
                              })
                            }
                          >
                            {payrollSettingsMutation.isPending ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Save className="size-4" />
                            )}
                            Save salary
                          </Button>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle>Salary adjustment</CardTitle>
                          <CardDescription>
                            Add bonus, reimbursement, or deduction before marking salary paid.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="grid gap-3 md:grid-cols-[160px_1fr]">
                            <Select
                              value={adjustmentType}
                              onValueChange={(value) =>
                                setAdjustmentType(value as typeof adjustmentType)
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="bonus">Allowance</SelectItem>
                                <SelectItem value="tip">Bonus</SelectItem>
                                <SelectItem value="reimbursement">Reimbursement</SelectItem>
                                <SelectItem value="penalty">Penalty</SelectItem>
                                <SelectItem value="deduction">Deduction</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              type="number"
                              min={0}
                              value={adjustmentAmount}
                              onChange={(event) => setAdjustmentAmount(event.target.value)}
                              placeholder="Amount"
                            />
                          </div>
                          <Textarea
                            value={adjustmentNote}
                            onChange={(event) => setAdjustmentNote(event.target.value)}
                            placeholder="Internal note"
                          />
                          <Button
                            disabled={!Number(adjustmentAmount) || adjustmentMutation.isPending}
                            onClick={() =>
                              adjustmentMutation.mutate({
                                riderId: rider.id,
                                month: rider.payroll.month,
                                type: adjustmentType,
                                amount: Number(adjustmentAmount) || 0,
                                note: adjustmentNote,
                              })
                            }
                          >
                            {adjustmentMutation.isPending ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <WalletCards className="size-4" />
                            )}
                            Add adjustment
                          </Button>
                        </CardContent>
                      </Card>
                    </div>

                    <Card>
                      <CardHeader>
                        <CardTitle>Salary payment record</CardTitle>
                        <CardDescription>
                          Mark paid only when the platform actually pays the rider. That record appears in Finance &gt; Transactions.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-3 text-sm md:grid-cols-3">
                          <InfoRow label="Next reminder" value={formatDate(rider.payroll.nextPayoutDate)} />
                          <InfoRow label="Paid" value={formatDate(rider.payroll.paidAt)} />
                          <InfoRow label="Reference" value={rider.payroll.paymentReference || "N/A"} />
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Input
                            value={paymentReference}
                            onChange={(event) => setPaymentReference(event.target.value)}
                            placeholder="Payment reference"
                            className="sm:max-w-xs"
                          />
                          <Button
                            disabled={payrollStatusMutation.isPending}
                            onClick={() =>
                              payrollStatusMutation.mutate({
                                riderId: rider.id,
                                month: rider.payroll.month,
                                status: "paid",
                                paymentReference,
                              })
                            }
                          >
                            {payrollStatusMutation.isPending ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <WalletCards className="size-4" />
                            )}
                            Mark salary paid
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Current payment total: {formatCurrency(rider.payroll.netPayable)}. Unpaid salary defaults are ignored in platform profit, cash, and ledger summaries.
                        </p>
                        <div className="overflow-hidden rounded-lg border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Type</TableHead>
                                <TableHead>Note</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {rider.payroll.adjustments.map((adjustment) => (
                                <TableRow key={adjustment.id}>
                                  <TableCell>{formatPayrollAdjustmentType(adjustment.type)}</TableCell>
                                  <TableCell>{adjustment.note || "N/A"}</TableCell>
                                  <TableCell>{formatDate(adjustment.createdAt)}</TableCell>
                                  <TableCell className="text-right">
                                    {formatCurrency(adjustment.amount)}
                                  </TableCell>
                                </TableRow>
                              ))}
                              {rider.payroll.adjustments.length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                                    No adjustment added for this month.
                                  </TableCell>
                                </TableRow>
                              ) : null}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="performance">
                  <div className="grid gap-4 md:grid-cols-3">
                    <StatCard
                      label="Completion rate"
                      value={`${Math.round(rider.completionRate)}%`}
                      helper={`${rider.deliveredTrips} of ${rider.totalAssignedTrips}`}
                    />
                    <StatCard
                      label="Avg delivery time"
                      value={formatMinutes(rider.averageDeliveryMinutes)}
                      helper="Ready to delivered"
                    />
                    <StatCard
                      label="Cancelled trips"
                      value={`${rider.cancelledTrips}`}
                      helper="Cancelled or rejected"
                    />
                  </div>
                </TabsContent>

                <TabsContent value="live-assignment">
                  <RiderLiveAssignmentPanel
                    orders={rider.activeOrders}
                    activeTrackingOrderId={rider.activeTrackingOrderId ?? ""}
                    onSetActiveTrip={(orderId) =>
                      activeTripMutation.mutate({ riderId, orderId })
                    }
                    pendingOrderId={
                      activeTripMutation.isPending
                        ? activeTripMutation.variables?.orderId ?? ""
                        : ""
                    }
                  />
                </TabsContent>

                <TabsContent value="active">
                  <RiderOrdersTable
                    orders={rider.activeOrders}
                    emptyText="No active delivery assigned."
                  />
                </TabsContent>

                <TabsContent value="trips">
                  <RiderTripsTable trips={rider.recentTrips} />
                </TabsContent>

                <TabsContent value="devices">
                  <Card>
                    <CardHeader>
                      <CardTitle>Push devices</CardTitle>
                      <CardDescription>Registered rider app devices.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-hidden rounded-lg border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Platform</TableHead>
                              <TableHead>Device</TableHead>
                              <TableHead>App</TableHead>
                              <TableHead>Last seen</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {rider.pushTokens.map((token, index) => (
                              <TableRow key={`${token.deviceId}-${index}`}>
                                <TableCell>{token.platform || "N/A"}</TableCell>
                                <TableCell>{token.deviceId || "N/A"}</TableCell>
                                <TableCell>{token.appVersion || "N/A"}</TableCell>
                                <TableCell>{formatDate(token.lastSeenAt)}</TableCell>
                                <TableCell>
                                  <Badge variant="outline">
                                    {token.disabledAt ? "Disabled" : "Active"}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                            {rider.pushTokens.length === 0 ? (
                              <TableRow>
                                <TableCell
                                  colSpan={5}
                                  className="h-24 text-center text-muted-foreground"
                                >
                                  No registered device.
                                </TableCell>
                              </TableRow>
                            ) : null}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <div className="p-4 text-sm text-muted-foreground">
              Rider details are not available.
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

function RiderLiveAssignmentPanel({
  orders,
  activeTrackingOrderId,
  onSetActiveTrip,
  pendingOrderId,
}: {
  orders: AdminRiderDetails["activeOrders"]
  activeTrackingOrderId: string
  onSetActiveTrip: (orderId: string) => void
  pendingOrderId: string
}) {
  const pickedUpOrders = orders.filter((order) => order.status === "PickedUp")
  const trackingOrders = orders.filter((order) => order.isTrackingActive)
  const readyOrders = orders.filter((order) => order.status === "ReadyForPickup")

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="Assigned now"
          value={`${orders.length}`}
          helper="Ready or picked up"
        />
        <StatCard
          label="Picked up"
          value={`${pickedUpOrders.length}`}
          helper="Already collected"
        />
        <StatCard
          label="Live location"
          value={`${trackingOrders.length}`}
          helper="Sharing active GPS"
        />
        <StatCard
          label="Waiting pickup"
          value={`${readyOrders.length}`}
          helper="Assigned but not picked"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="size-5 text-pink-600" />
            Live assignment timeline
          </CardTitle>
          <CardDescription>
            Assigned orders, pickup time, and live location sharing state for this rider.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Restaurant</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead>Picked up</TableHead>
                  <TableHead>Live location</TableHead>
                  <TableHead className="text-right">ETA</TableHead>
                  <TableHead className="text-right">Live trip</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <div className="font-medium">{order.orderNumber}</div>
                      <div className="text-xs text-muted-foreground">
                        {order.customerName}
                      </div>
                    </TableCell>
                    <TableCell>{order.restaurantName}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={getDeliveryStatusBadgeClass(order.status)}
                      >
                        {order.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div>{formatDate(order.assignedAt)}</div>
                      {order.acknowledgedAt ? (
                        <div className="text-xs text-muted-foreground">
                          Acknowledged {formatDate(order.acknowledgedAt)}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">
                          Not acknowledged yet
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {order.pickedUpAt ? (
                        formatDate(order.pickedUpAt)
                      ) : (
                        <span className="text-muted-foreground">Not picked yet</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          order.isTrackingActive
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-slate-50 text-slate-700"
                        }
                      >
                        {order.isTrackingActive ? "Sharing" : "Not sharing"}
                      </Badge>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {order.trackingFreshness === "live"
                          ? "Live GPS"
                          : humanizeKey(order.trackingFreshness)}
                        {" - "}
                        {formatDate(order.trackingLastUpdatedAt)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div>{formatMinutes(order.remainingDurationMinutes)}</div>
                      <div className="text-xs text-muted-foreground">
                        {Number.isFinite(order.remainingDistanceKm) &&
                        order.remainingDistanceKm > 0
                          ? `${order.remainingDistanceKm.toFixed(
                              order.remainingDistanceKm >= 10 ? 0 : 1
                            )} km`
                          : "Distance N/A"}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {order.id === activeTrackingOrderId ? (
                        <Badge
                          variant="outline"
                          className="border-emerald-200 bg-emerald-50 text-emerald-700"
                        >
                          Live now
                        </Badge>
                      ) : order.status === "PickedUp" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={Boolean(pendingOrderId)}
                          onClick={() => onSetActiveTrip(order.id)}
                        >
                          <Navigation className="size-4" />
                          {pendingOrderId === order.id
                            ? "Switching..."
                            : "Make live trip"}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Pick up first
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {orders.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No live assignment for this rider.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function RiderOrdersTable({
  orders,
  emptyText,
}: {
  orders: AdminRiderDetails["activeOrders"]
  emptyText: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Active delivery load</CardTitle>
        <CardDescription>Orders assigned to this rider.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Restaurant</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <div className="font-medium">{order.orderNumber}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(order.createdAt)}
                    </div>
                  </TableCell>
                  <TableCell>{order.restaurantName}</TableCell>
                  <TableCell>{order.customerName}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={getDeliveryStatusBadgeClass(order.status)}
                    >
                      {order.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(order.total)}
                  </TableCell>
                </TableRow>
              ))}
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-24 text-center text-muted-foreground"
                  >
                    {emptyText}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

function RiderAvailabilityPanel({
  availability,
}: {
  availability: AdminRiderDetails["availability"]
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="Current state"
          value={
            <span className="inline-flex items-center gap-2">
              {availability.isOnline ? (
                <Wifi className="size-5 text-emerald-600" />
              ) : (
                <WifiOff className="size-5 text-muted-foreground" />
              )}
              {availability.isOnline ? "Online" : "Offline"}
            </span>
          }
          helper={
            availability.isOnline
              ? `Since ${formatDate(availability.currentSessionStartedAt)}`
              : `Last offline ${formatDate(availability.lastOfflineAt)}`
          }
        />
        <StatCard
          label="Today active"
          value={formatDurationSeconds(availability.todayActiveSeconds)}
          helper={`${availability.sessionCountToday} session(s) today`}
        />
        <StatCard
          label="7-day daily avg"
          value={formatDurationSeconds(availability.averageDailyActiveSeconds7d)}
          helper={`${availability.activeDaysLast7d}/7 active day(s)`}
        />
        <StatCard
          label="30-day daily avg"
          value={formatDurationSeconds(availability.averageDailyActiveSeconds30d)}
          helper={`Last online ${formatDate(availability.lastOnlineAt)}`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock3 className="size-5 text-pink-600" />
            Online/offline timeline
          </CardTitle>
          <CardDescription>
            Rider availability sessions captured from the rider app and admin actions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Ended</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {availability.sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell>{formatDate(session.startedAt)}</TableCell>
                    <TableCell>{session.endedAt ? formatDate(session.endedAt) : "Now"}</TableCell>
                    <TableCell>{formatDurationSeconds(session.durationSeconds)}</TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">
                        {humanizeKey(session.startSource)}
                      </div>
                      {session.endReason ? (
                        <div className="text-xs text-muted-foreground">
                          {humanizeKey(session.endReason)}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          session.status === "online"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-slate-50 text-slate-700"
                        }
                      >
                        {session.status === "online" ? "Online" : "Closed"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {availability.sessions.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No availability session has been captured yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function RiderTripsTable({
  trips,
}: {
  trips: AdminRiderDetails["recentTrips"]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent trips</CardTitle>
        <CardDescription>Delivered and terminal rider trips.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Restaurant</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                  <TableHead className="text-right">Order total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trips.map((trip) => (
                <TableRow key={trip.id}>
                  <TableCell>
                    <div className="font-medium">{trip.orderNumber}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(trip.deliveredAt ?? trip.createdAt)}
                    </div>
                  </TableCell>
                  <TableCell>{trip.restaurantName}</TableCell>
                  <TableCell>{trip.customerName}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{trip.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(trip.total)}
                  </TableCell>
                </TableRow>
              ))}
              {trips.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No recent trips found.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

function MapBounds({
  points,
}: {
  points: Array<[number, number]>
}) {
  const map = useMap()

  React.useEffect(() => {
    if (!points.length) {
      map.setView(netrokonaCenter, 12)
      return
    }
    map.fitBounds(points, { padding: [32, 32], maxZoom: 15 })
  }, [map, points])

  return null
}

function LiveDeliveryMap({
  deliveries,
  riders,
}: {
  deliveries: AdminLiveMapDelivery[]
  riders: AdminLiveMapRider[]
}) {
  const deliveryPoints = deliveries.flatMap((delivery) => {
    const points: Array<[number, number]> = []
    const restaurantPoint = getPoint(delivery.restaurant)
    const customerPoint = getPoint(delivery.customer.deliveryAddress)
    const riderPoint = getPoint(delivery.rider?.location)
    if (restaurantPoint) points.push(restaurantPoint)
    if (customerPoint) points.push(customerPoint)
    if (riderPoint) points.push(riderPoint)
    return points
  })
  const riderPoints = riders
    .map((rider) => getPoint(rider.currentLocation))
    .filter(Boolean) as Array<[number, number]>
  const allPoints = [...deliveryPoints, ...riderPoints]

  return (
    <div className="h-[420px] overflow-hidden rounded-lg border">
      <MapContainer
        center={allPoints[0] ?? netrokonaCenter}
        zoom={12}
        className="h-full w-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapBounds points={allPoints} />
        {deliveries.map((delivery) => {
          const restaurantPoint = getPoint(delivery.restaurant)
          const customerPoint = getPoint(delivery.customer.deliveryAddress)
          const riderPoint = getPoint(delivery.rider?.location)
          const routePoints = [restaurantPoint, riderPoint, customerPoint].filter(
            Boolean
          ) as Array<[number, number]>

          return (
            <React.Fragment key={delivery.id}>
              {routePoints.length >= 2 ? (
                <Polyline
                  positions={routePoints}
                  pathOptions={{
                    color:
                      delivery.delaySeverity === "critical"
                        ? "#e11d48"
                        : delivery.delaySeverity === "warning"
                          ? "#d97706"
                          : "#2563eb",
                    weight: 4,
                    opacity: 0.75,
                  }}
                />
              ) : null}
              {restaurantPoint ? (
                <Marker position={restaurantPoint} icon={restaurantMarkerIcon}>
                  <Popup>
                    <strong>{delivery.restaurant.name}</strong>
                    <br />
                    {delivery.orderNumber}
                  </Popup>
                </Marker>
              ) : null}
              {customerPoint ? (
                <Marker position={customerPoint} icon={customerMarkerIcon}>
                  <Popup>
                    <strong>{delivery.customer.name}</strong>
                    <br />
                    {delivery.customer.deliveryAddress.addressLine || "Dropoff"}
                  </Popup>
                </Marker>
              ) : null}
              {riderPoint ? (
                <Marker position={riderPoint} icon={riderMarkerIcon}>
                  <Popup>
                    <strong>{delivery.rider?.fullName ?? "Rider"}</strong>
                    <br />
                    {delivery.orderNumber}
                    <br />
                    {delivery.tracking.remainingDistanceKm} km remaining
                  </Popup>
                </Marker>
              ) : null}
            </React.Fragment>
          )
        })}
        {riders.map((rider) => {
          const point = getPoint(rider.currentLocation)
          if (!point || rider.liveOrderId) return null
          return (
            <Marker key={rider.id} position={point} icon={riderMarkerIcon}>
              <Popup>
                <strong>{rider.fullName}</strong>
                <br />
                Idle rider
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>
    </div>
  )
}

function KycReviewTable({
  riders,
  isLoading,
  onDecision,
}: {
  riders: AdminRiderSummary[]
  isLoading: boolean
  onDecision: (
    rider: AdminRiderSummary,
    status: RiderVerificationStatus
  ) => void
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>Rider KYC review</CardTitle>
            <CardDescription>
              Approve or reject riders before they become dispatch eligible.
            </CardDescription>
          </div>
          <Badge variant="outline">{riders.length} pending</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rider</TableHead>
                <TableHead>Documents</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Review note</TableHead>
                <TableHead className="text-right">Decision</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {riders.map((rider) => (
                <TableRow key={rider.id}>
                  <TableCell>
                    <div className="font-medium">{rider.fullName}</div>
                    <div className="text-xs text-muted-foreground">
                      {rider.phone}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        rider.verification.hasDocuments
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                      }
                    >
                      {rider.verification.hasDocuments
                        ? "Docs received"
                        : "Missing docs"}
                    </Badge>
                    <div className="mt-1 text-xs text-muted-foreground">
                      NID: {rider.verification.nationalIdNumber || "N/A"}
                    </div>
                  </TableCell>
                  <TableCell>{formatDate(rider.verification.submittedAt)}</TableCell>
                  <TableCell>{rider.verification.reviewNote || "N/A"}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        onClick={() => onDecision(rider, "approved")}
                      >
                        <FileCheck2 className="size-4" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => onDecision(rider, "rejected")}
                      >
                        <FileWarning className="size-4" />
                        Reject
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : riders.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No pending rider KYC.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

export function RidersPage() {
  const queryClient = useQueryClient()
  const { policy: refreshPolicy } = useAdminRefreshPolicy()
  const [searchParams, setSearchParams] = useSearchParams()
  const mainTab = normalizeRiderMainTab(
    searchParams.get("tab") ??
      (typeof window !== "undefined" && window.location.hash === "#dispatch"
        ? "dispatch"
        : "directory")
  )
  const [search, setSearch] = React.useState("")
  const [status, setStatus] = React.useState<RiderStatusFilter>("all")
  const [availability, setAvailability] =
    React.useState<RiderAvailabilityFilter>("all")
  const [verification, setVerification] =
    React.useState<RiderVerificationFilter>("all")
  const [sortBy, setSortBy] = React.useState<RiderSort>("newest")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [selectedRiderId, setSelectedRiderId] = React.useState(
    searchParams.get("riderId") ?? ""
  )
  const [statusTarget, setStatusTarget] = React.useState<null | {
    rider: AdminRiderSummary
    status: RiderStatus
  }>(null)
  const [verificationTarget, setVerificationTarget] = React.useState<null | {
    rider: AdminRiderSummary
    status: RiderVerificationStatus
  }>(null)
  const [assignmentDrafts, setAssignmentDrafts] = React.useState<
    Record<string, string>
  >({})
  const [selectedCandidateIds, setSelectedCandidateIds] = React.useState<
    string[]
  >([])
  const debouncedSearch = useDebouncedValue(search, 350)
  const [adminZoneScope, setAdminZoneScope] = React.useState(() =>
    getAdminZoneScope()
  )
  const adminScopeKey = `${adminZoneScope.type}:${adminZoneScope.id || "all"}`
  const adminScopeParams = React.useMemo(() => {
    if (adminZoneScope.type === "zone" && adminZoneScope.id) {
      return { zoneId: adminZoneScope.id }
    }
    if (adminZoneScope.type === "district" && adminZoneScope.id) {
      return { districtId: adminZoneScope.id }
    }
    return {}
  }, [adminZoneScope.id, adminZoneScope.type])

  React.useEffect(
    () =>
      subscribeAdminZoneScope(() => {
        setAdminZoneScope(getAdminZoneScope())
        setSelectedCandidateIds([])
        setAssignmentDrafts({})
      }),
    []
  )

  const ridersQuery = useQuery({
    queryKey: [
      "admin-riders",
      adminScopeKey,
      debouncedSearch,
      status,
      availability,
      verification,
      sortBy,
      page,
      pageSize,
    ],
    queryFn: () =>
      listAdminRiders({
        search: debouncedSearch,
        status,
        availability,
        verification,
        sortBy,
        page,
        pageSize,
        ...adminScopeParams,
      }),
  })
  const kycQuery = useQuery({
    queryKey: ["admin-riders", "kyc-queue", adminScopeKey],
    queryFn: () =>
      listAdminRiders({
        verification: "pending",
        sortBy: "newest",
        pageSize: 50,
        ...adminScopeParams,
      }),
    enabled: mainTab === "kyc",
  })
  const earningsQuery = useQuery({
    queryKey: ["admin-riders", "earnings", adminScopeKey],
    queryFn: () =>
      listAdminRiders({
        sortBy: "mostDelivered",
        pageSize: 50,
        ...adminScopeParams,
      }),
    enabled: mainTab === "earnings" || mainTab === "analytics",
  })
  const payrollQuery = useQuery({
    queryKey: ["admin-rider-payroll", adminScopeKey],
    queryFn: () => listAdminRiderPayroll(adminScopeParams),
    enabled: mainTab === "earnings",
  })
  const liveMapQuery = useQuery({
    queryKey: ["admin-live-map", adminScopeKey],
    queryFn: getAdminLiveMap,
    enabled: mainTab === "live",
    refetchInterval: mainTab === "live" ? refreshPolicy.liveMapMs || false : false,
    refetchIntervalInBackground: false,
  })
  const assignmentOptionsQuery = useQuery({
    queryKey: ["admin-rider-assignment-options", adminScopeKey],
    queryFn: listAdminRidersAssignmentOptions,
    enabled: mainTab === "assignments",
  })
  const candidatesQuery = useQuery({
    queryKey: ["admin-rider-candidates", adminScopeKey],
    queryFn: () => listAdminRiderAssignmentCandidates(adminScopeParams),
    enabled: mainTab === "assignments",
  })
  const dispatchQuery = useQuery({
    queryKey: ["admin-dispatch-settings", adminScopeKey],
    queryFn: getAdminDispatchSettings,
    enabled: mainTab === "dispatch",
  })
  const availabilityMutation = useMutation({
    mutationFn: updateAdminRiderAvailability,
    onSuccess: (_data, variables) => {
      toast.success("Rider availability updated.")
      invalidateRiderQueries(queryClient, variables.riderId)
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Availability update failed."
      )
      invalidateRiderQueries(queryClient)
    },
  })
  const assignMutation = useMutation({
    mutationFn: assignAdminRider,
    onSuccess: () => {
      toast.success("Delivery assigned.")
      setAssignmentDrafts({})
      invalidateRiderQueries(queryClient)
      void queryClient.invalidateQueries({ queryKey: ["admin-orders"] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Assignment failed.")
      invalidateRiderQueries(queryClient)
    },
  })
  const bulkAssignMutation = useMutation({
    mutationFn: bulkAssignAdminRiders,
    onSuccess: (data) => {
      toast.success(
        `${data.assigned} delivery assigned, ${data.skipped} skipped.`
      )
      setSelectedCandidateIds([])
      setAssignmentDrafts({})
      invalidateRiderQueries(queryClient)
      void queryClient.invalidateQueries({ queryKey: ["admin-orders"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-dispatch-settings"] })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Bulk assignment failed."
      )
      invalidateRiderQueries(queryClient)
    },
  })

  const riders = ridersQuery.data?.items ?? []
  const summary = ridersQuery.data?.summary ?? {}
  const payrollSummary = payrollQuery.data?.summary
  const liveSummary = liveMapQuery.data?.summary
  const selectedRiderTab = normalizeRiderDetailsTab(searchParams.get("riderTab"))
  const totalRiders = ridersQuery.data?.total ?? 0
  const pageCount = ridersQuery.data?.pageCount ?? 1
  const safePage = Math.min(page, pageCount)
  const hasFilters =
    search.trim() !== "" ||
    status !== "all" ||
    availability !== "all" ||
    verification !== "all" ||
    sortBy !== "newest"

  React.useEffect(() => {
    setPage(1)
  }, [
    adminScopeKey,
    debouncedSearch,
    status,
    availability,
    verification,
    sortBy,
    pageSize,
  ])

  React.useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  React.useEffect(() => {
    setSelectedRiderId(searchParams.get("riderId") ?? "")
  }, [searchParams])

  const openRiderDetails = React.useCallback(
    (riderId: string, tab: RiderDetailsTab = "overview") => {
      setSelectedRiderId(riderId)
      const nextParams = new URLSearchParams(searchParams)
      nextParams.set("riderId", riderId)
      if (tab === "overview") nextParams.delete("riderTab")
      else nextParams.set("riderTab", tab)
      setSearchParams(nextParams, { replace: true })
    },
    [searchParams, setSearchParams]
  )

  const setRiderDetailsTab = React.useCallback(
    (tab: RiderDetailsTab) => {
      const nextParams = new URLSearchParams(searchParams)
      if (!nextParams.get("riderId") && selectedRiderId) {
        nextParams.set("riderId", selectedRiderId)
      }
      if (tab === "overview") nextParams.delete("riderTab")
      else nextParams.set("riderTab", tab)
      setSearchParams(nextParams, { replace: true })
    },
    [searchParams, selectedRiderId, setSearchParams]
  )

  const closeRiderDetails = React.useCallback(() => {
    setSelectedRiderId("")
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete("riderId")
    nextParams.delete("riderTab")
    setSearchParams(nextParams, { replace: true })
  }, [searchParams, setSearchParams])

  const setMainTab = React.useCallback(
    (tab: RiderMainTab) => {
      const nextParams = new URLSearchParams(searchParams)
      if (tab === "directory") nextParams.delete("tab")
      else nextParams.set("tab", tab)
      setSearchParams(nextParams, { replace: true })
    },
    [searchParams, setSearchParams]
  )

  function resetFilters() {
    setSearch("")
    setStatus("all")
    setAvailability("all")
    setVerification("all")
    setSortBy("newest")
    setPage(1)
  }

  function exportRidersCsv() {
    const headers = [
      "Name",
      "Phone",
      "Status",
      "Available",
      "KYC",
      "Active Orders",
      "Live Trips",
      "Delivered Trips",
      "Payroll Pending",
      "Last Login",
      "Last Location",
    ]
    const rows = riders.map((rider) => [
      rider.fullName,
      rider.phone,
      rider.status,
      rider.isAvailableForAssignments ? "Yes" : "No",
      rider.verification.status,
      `${rider.activeOrders}`,
      `${rider.liveTrips}`,
      `${rider.deliveredTrips}`,
      `${Math.round(rider.payroll.pendingAmount)}`,
      rider.lastLoginAt ?? "",
      coordinateLabel(rider.lastKnownLocation),
    ])
    const csv = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")
      )
      .join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `admin-riders-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  function assignCandidate(candidate: AdminRiderAssignmentCandidate) {
    const riderId = assignmentDrafts[candidate.id]
    if (!riderId) {
      toast.error("Select a rider first.")
      return
    }

    assignMutation.mutate({ orderId: candidate.id, riderId })
  }

  function bulkAssignSelected() {
    if (selectedCandidateIds.length === 0) {
      toast.error("Select at least one delivery.")
      return
    }
    bulkAssignMutation.mutate({ orderIds: selectedCandidateIds })
  }

  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
              <Truck className="size-4" />
            </div>
            <Badge variant="outline">Delivery operations</Badge>
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">
            Riders / Delivery
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Manage rider availability, live delivery health, manual assignment,
            and fixed monthly rider salary.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <UserPlus className="size-4" />
          Add Rider
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Active riders"
          value={`${summary.activeRiders ?? liveSummary?.activeRiders ?? 0}`}
          helper={`${summary.availableRiders ?? liveSummary?.availableRiders ?? 0} available`}
        />
        <StatCard
          label="Live trips"
          value={`${liveSummary?.liveTrips ?? summary.liveTrips ?? 0}`}
          helper="Picked up deliveries"
        />
        <StatCard
          label="Ready queue"
          value={`${liveSummary?.readyForPickup ?? 0}`}
          helper={`${liveSummary?.unassignedReady ?? 0} unassigned`}
        />
        <StatCard
          label="Delayed trips"
          value={`${liveSummary?.delayedTrips ?? 0}`}
          helper={`${liveSummary?.criticalDelays ?? 0} critical`}
        />
        <StatCard
          label="Payroll pending"
          value={formatCurrency(payrollSummary?.pending ?? 0)}
          helper={`${payrollSummary?.approved ?? 0} approved cycles`}
        />
      </div>

      <Tabs
        value={mainTab}
        onValueChange={(value) => setMainTab(normalizeRiderMainTab(value))}
        className="gap-4"
      >
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="directory">Rider directory</TabsTrigger>
          <TabsTrigger value="kyc">KYC review</TabsTrigger>
          <TabsTrigger value="live">Live delivery</TabsTrigger>
          <TabsTrigger value="assignments">Assignment queue</TabsTrigger>
          <TabsTrigger value="earnings">Payroll</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="dispatch">Dispatch controls</TabsTrigger>
        </TabsList>

        <TabsContent value="directory" className="space-y-4">
          <Card>
            <CardHeader className="gap-3">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <CardTitle>Rider operations</CardTitle>
                  <CardDescription className="mt-1 max-w-2xl">
                    Search, filter, and manage real rider accounts.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={riders.length === 0}
                    onClick={exportRidersCsv}
                    className="w-full sm:w-auto"
                  >
                    <Download className="size-4" />
                    Export CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="flex flex-wrap gap-2">
                  <div className="relative w-full lg:max-w-xs">
                    <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search rider name or phone"
                      className="pl-8"
                    />
                  </div>
                  <Select
                    value={status}
                    onValueChange={(value) =>
                      setStatus(value as RiderStatusFilter)
                    }
                  >
                    <SelectTrigger className="w-full sm:w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                      <SelectItem value="locked">Locked</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={availability}
                    onValueChange={(value) =>
                      setAvailability(value as RiderAvailabilityFilter)
                    }
                  >
                    <SelectTrigger className="w-full sm:w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All availability</SelectItem>
                      <SelectItem value="available">Available</SelectItem>
                      <SelectItem value="unavailable">Unavailable</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={verification}
                    onValueChange={(value) =>
                      setVerification(value as RiderVerificationFilter)
                    }
                  >
                    <SelectTrigger className="w-full sm:w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All KYC</SelectItem>
                      <SelectItem value="pending">KYC pending</SelectItem>
                      <SelectItem value="approved">KYC approved</SelectItem>
                      <SelectItem value="rejected">KYC rejected</SelectItem>
                      <SelectItem value="missing">Missing docs</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={sortBy}
                    onValueChange={(value) => setSortBy(value as RiderSort)}
                  >
                    <SelectTrigger className="w-full sm:w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Newest</SelectItem>
                      <SelectItem value="recentLogin">Recent login</SelectItem>
                      <SelectItem value="mostActive">Most active</SelectItem>
                      <SelectItem value="mostDelivered">
                        Most delivered
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    disabled={!hasFilters}
                    onClick={resetFilters}
                    className="w-full sm:w-auto"
                  >
                    <RotateCcw className="size-4" />
                    Reset filter
                  </Button>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rider</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>KYC</TableHead>
                      <TableHead>Availability</TableHead>
                      <TableHead>Delivery load</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Payroll</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {riders.map((rider) => (
                      <TableRow key={rider.id}>
                        <TableCell>
                          <button
                            type="button"
                            className="text-left"
                            onClick={() => openRiderDetails(rider.id)}
                          >
                            <span className="block font-medium">
                              {rider.fullName}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {rider.phone} - {rider.vehicleType}
                            </span>
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge
                              variant="outline"
                              className={getVerificationBadgeClass(
                                rider.verification.status
                              )}
                            >
                              {rider.verification.status}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {rider.verification.hasDocuments
                                ? "Docs received"
                                : "Missing docs"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={getRiderStatusBadgeClass(rider.status)}
                          >
                            {rider.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={
                                rider.status === "active" &&
                                rider.verification.status === "approved" &&
                                rider.isAvailableForAssignments
                              }
                              disabled={
                                rider.status !== "active" ||
                                rider.verification.status !== "approved" ||
                                availabilityMutation.isPending
                              }
                              onCheckedChange={(checked) =>
                                availabilityMutation.mutate({
                                  riderId: rider.id,
                                  isAvailableForAssignments: checked,
                                })
                              }
                              aria-label={`Toggle availability for ${rider.fullName}`}
                            />
                            <span className="text-sm text-muted-foreground">
                              {rider.isAvailableForAssignments
                                ? rider.verification.status === "approved"
                                  ? "Available"
                                  : "KYC blocked"
                                : "Unavailable"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {rider.activeOrders} active
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {rider.liveTrips} live, {rider.deliveredTrips} done
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {rider.lastKnownLocation ? (
                              <Wifi className="size-4 text-emerald-600" />
                            ) : (
                              <WifiOff className="size-4 text-muted-foreground" />
                            )}
                            <div>
                              <div className="text-sm">
                                {coordinateLabel(rider.lastKnownLocation)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formatDate(
                                  rider.lastKnownLocation?.lastUpdatedAt
                                )}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {formatCurrency(rider.payroll.pendingAmount)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Payroll pending
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openRiderDetails(rider.id)}
                            >
                              <Eye className="size-4" />
                              View
                            </Button>
                            <RiderActionsMenu
                              rider={rider}
                              onView={() => openRiderDetails(rider.id)}
                              onStatus={(target, nextStatus) =>
                                setStatusTarget({
                                  rider: target,
                                  status: nextStatus,
                                })
                              }
                              onVerification={(target, nextStatus) =>
                                setVerificationTarget({
                                  rider: target,
                                  status: nextStatus,
                                })
                              }
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {ridersQuery.isPending ? (
                      <TableRow>
                        <TableCell colSpan={8} className="h-24 text-center">
                          <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ) : riders.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="h-24 text-center text-muted-foreground"
                        >
                          No riders match this filter.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-4 rounded-2xl border bg-card px-4 py-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {riders.length} of {totalRiders} rider(s)
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Select
                value={`${pageSize}`}
                onValueChange={(value) => {
                  setPageSize(Number(value))
                  setPage(1)
                }}
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
                Page {safePage} of {pageCount}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setPage((current) => Math.max(1, current - 1))
                  }
                  disabled={safePage <= 1}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setPage((current) => Math.min(pageCount, current + 1))
                  }
                  disabled={safePage >= pageCount}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="kyc">
          <KycReviewTable
            riders={kycQuery.data?.items ?? []}
            isLoading={kycQuery.isPending}
            onDecision={(rider, nextStatus) =>
              setVerificationTarget({ rider, status: nextStatus })
            }
          />
        </TabsContent>

        <TabsContent value="live">
          <LiveDeliveryTable
            deliveries={liveMapQuery.data?.deliveries ?? []}
            riders={liveMapQuery.data?.riders ?? []}
            isLoading={liveMapQuery.isPending}
            lastUpdatedAt={liveMapQuery.data?.lastUpdatedAt ?? null}
          />
        </TabsContent>

        <TabsContent value="assignments">
          <AssignmentQueueTable
            candidates={candidatesQuery.data ?? []}
            riders={assignmentOptionsQuery.data ?? []}
            drafts={assignmentDrafts}
            selectedIds={selectedCandidateIds}
            onDraftChange={(orderId, riderId) =>
              setAssignmentDrafts((current) => ({
                ...current,
                [orderId]: riderId,
              }))
            }
            onSelectionChange={setSelectedCandidateIds}
            onAssign={assignCandidate}
            onBulkAssign={bulkAssignSelected}
            isLoading={candidatesQuery.isPending}
            isAssigning={assignMutation.isPending}
            isBulkAssigning={bulkAssignMutation.isPending}
          />
        </TabsContent>

        <TabsContent value="earnings">
          <RiderEarningsPanel
            summary={earningsQuery.data?.summary ?? {}}
            payroll={payrollQuery.data ?? null}
            isLoading={earningsQuery.isPending || payrollQuery.isPending}
          />
        </TabsContent>

        <TabsContent value="analytics">
          <RiderPerformanceAnalytics
            riders={earningsQuery.data?.items ?? []}
            summary={earningsQuery.data?.summary ?? {}}
            isLoading={earningsQuery.isPending}
          />
        </TabsContent>

        <TabsContent value="dispatch">
          <DispatchControlsPanel
            settings={dispatchQuery.data ?? null}
            isLoading={dispatchQuery.isPending}
            scope={adminZoneScope}
            onSaved={() => {
              void dispatchQuery.refetch()
              invalidateRiderQueries(queryClient)
            }}
          />
        </TabsContent>
      </Tabs>

      <CreateRiderDialog open={createOpen} onOpenChange={setCreateOpen} />
      <RiderStatusDialog
        target={statusTarget}
        onOpenChange={(open) => {
          if (!open) setStatusTarget(null)
        }}
      />
      <RiderVerificationDialog
        target={verificationTarget}
        onOpenChange={(open) => {
          if (!open) setVerificationTarget(null)
        }}
      />
      <RiderDetailsSheet
        riderId={selectedRiderId}
        open={Boolean(selectedRiderId)}
        activeTab={selectedRiderTab}
        refreshIntervalMs={refreshPolicy.riderDetailsMs}
        onTabChange={setRiderDetailsTab}
        onStatus={(target, nextStatus) =>
          setStatusTarget({
            rider: target,
            status: nextStatus,
          })
        }
        onVerification={(target, nextStatus) =>
          setVerificationTarget({
            rider: target,
            status: nextStatus,
          })
        }
        onOpenChange={(open) => {
          if (!open) closeRiderDetails()
        }}
      />
    </>
  )
}

function LiveDeliveryTable({
  deliveries,
  riders,
  isLoading,
  lastUpdatedAt,
}: {
  deliveries: AdminLiveMapDelivery[]
  riders: AdminLiveMapRider[]
  isLoading: boolean
  lastUpdatedAt: string | null
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle>Live map</CardTitle>
              <CardDescription>
                Rider, restaurant, and customer markers with active route lines.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                {deliveries.length} delivery markers
              </Badge>
              <Badge variant="outline">{riders.length} rider markers</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <LiveDeliveryMap deliveries={deliveries} riders={riders} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle>Live delivery board</CardTitle>
                <CardDescription>
                  Ready and picked-up orders with rider tracking health.
                </CardDescription>
              </div>
              <Badge variant="outline">
                Updated {lastUpdatedAt ? formatDate(lastUpdatedAt) : "N/A"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Rider</TableHead>
                    <TableHead>Timing</TableHead>
                    <TableHead>Tracking</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.map((delivery) => (
                    <TableRow
                      key={delivery.id}
                      className={
                        delivery.delaySeverity === "critical"
                          ? "bg-rose-50/60 hover:bg-rose-50/70"
                          : delivery.delaySeverity === "warning"
                            ? "bg-amber-50/60 hover:bg-amber-50/70"
                            : undefined
                      }
                    >
                      <TableCell>
                        <div className="font-medium">
                          {delivery.orderNumber}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge
                            variant="outline"
                            className={getDeliveryStatusBadgeClass(
                              delivery.status
                            )}
                          >
                            {delivery.status}
                          </Badge>
                          {delivery.delayReason ? (
                            <Badge variant="outline">
                              {delivery.delayReason}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>{delivery.restaurant.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {delivery.customer.name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>{delivery.rider?.fullName ?? "Not assigned"}</div>
                        <div className="text-xs text-muted-foreground">
                          {delivery.rider?.phone ?? ""}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          Ready {formatMinutes(delivery.readyWaitMinutes)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Picked {formatMinutes(delivery.pickedUpMinutes)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Navigation className="size-4 text-muted-foreground" />
                          <div>
                            <div className="text-sm">
                              {delivery.tracking.remainingDistanceKm} km
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {delivery.tracking.remainingDurationMinutes} min,
                              {delivery.tracking.speedKmph} km/h
                            </div>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center">
                        <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ) : deliveries.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="h-24 text-center text-muted-foreground"
                      >
                        No live delivery right now.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Online rider locations</CardTitle>
            <CardDescription>Last known app location by rider.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {riders.slice(0, 8).map((rider) => (
              <div key={rider.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{rider.fullName}</div>
                    <div className="text-xs text-muted-foreground">
                      {rider.phone}
                    </div>
                  </div>
                  <Badge variant="outline">
                    {rider.liveOrderNumber || "Idle"}
                  </Badge>
                </div>
                <div className="mt-3 text-sm text-muted-foreground">
                  {coordinateLabel(rider.currentLocation)}
                </div>
                {mapsUrl(rider.currentLocation) ? (
                  <Button asChild variant="outline" size="sm" className="mt-3">
                    <a
                      href={mapsUrl(rider.currentLocation)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MapPin className="size-4" />
                      Open map
                    </a>
                  </Button>
                ) : null}
              </div>
            ))}
            {!isLoading && riders.length === 0 ? (
              <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                No active rider location yet.
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function AssignmentQueueTable({
  candidates,
  riders,
  drafts,
  selectedIds,
  onDraftChange,
  onSelectionChange,
  onAssign,
  onBulkAssign,
  isLoading,
  isAssigning,
  isBulkAssigning,
}: {
  candidates: AdminRiderAssignmentCandidate[]
  riders: AdminRiderAssignmentOption[]
  drafts: Record<string, string>
  selectedIds: string[]
  onDraftChange: (orderId: string, riderId: string) => void
  onSelectionChange: (ids: string[]) => void
  onAssign: (candidate: AdminRiderAssignmentCandidate) => void
  onBulkAssign: () => void
  isLoading: boolean
  isAssigning: boolean
  isBulkAssigning: boolean
}) {
  const selectedSet = new Set(selectedIds)
  const allPageSelected =
    candidates.length > 0 &&
    candidates.every((candidate) => selectedSet.has(candidate.id))

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>Manual assignment queue</CardTitle>
            <CardDescription>
              Ready-for-pickup orders without a rider assignment.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{candidates.length} waiting</Badge>
            <Button
              variant="outline"
              disabled={selectedIds.length === 0 || isBulkAssigning}
              onClick={onBulkAssign}
            >
              {isBulkAssigning ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              Auto assign selected
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allPageSelected}
                    onCheckedChange={(checked) =>
                      onSelectionChange(
                        checked ? candidates.map((candidate) => candidate.id) : []
                      )
                    }
                    aria-label="Select all waiting deliveries"
                  />
                </TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Restaurant</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Total</TableHead>
                <TableHead className="min-w-56">Assign rider</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.map((candidate) => (
                <TableRow key={candidate.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedSet.has(candidate.id)}
                      onCheckedChange={(checked) =>
                        onSelectionChange(
                          checked
                            ? [...selectedIds, candidate.id]
                            : selectedIds.filter((id) => id !== candidate.id)
                        )
                      }
                      aria-label={`Select ${candidate.orderNumber}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{candidate.orderNumber}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(candidate.createdAt)}
                    </div>
                  </TableCell>
                  <TableCell>{candidate.restaurantName}</TableCell>
                  <TableCell>
                    <div>{candidate.customerName}</div>
                    <div className="text-xs text-muted-foreground">
                      {candidate.customerPhone || "No phone"}
                    </div>
                  </TableCell>
                  <TableCell>{formatCurrency(candidate.total)}</TableCell>
                  <TableCell>
                    <Select
                      value={drafts[candidate.id] ?? ""}
                      onValueChange={(value) =>
                        onDraftChange(candidate.id, value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose rider" />
                      </SelectTrigger>
                      <SelectContent>
                        {riders.map((rider) => (
                          <SelectItem key={rider.id} value={rider.id}>
                            {rider.fullName} ({rider.activeOrders} active)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        disabled={!drafts[candidate.id] || isAssigning}
                        onClick={() => onAssign(candidate)}
                      >
                        {isAssigning ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <PackageCheck className="size-4" />
                        )}
                        Assign
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : candidates.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No unassigned ready order right now.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

function RiderEarningsPanel({
  summary,
  payroll,
  isLoading,
}: {
  summary: Record<string, number>
  payroll: AdminRiderPayrollSnapshot | null
  isLoading: boolean
}) {
  const payrollItems = payroll?.items ?? []
  const topRiders = [...payrollItems]
    .sort((left, right) => right.payroll.netPayable - left.payroll.netPayable)
    .slice(0, 10)

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="Salary payable"
          value={formatCurrency(payroll?.summary.baseSalary ?? 0)}
          helper={`Payroll month ${payroll?.month ?? ""}`}
        />
        <StatCard
          label="Manual allowance"
          value={formatCurrency(payroll?.summary.platformBonus ?? 0)}
          helper="Monthly salary only"
        />
        <StatCard
          label="Penalty / deduction"
          value={formatCurrency(payroll?.summary.penalties ?? 0)}
          helper="Reduced from payout"
        />
        <StatCard
          label="Net pending"
          value={formatCurrency(payroll?.summary.pending ?? 0)}
          helper={`${payroll?.summary.paidCycles ?? 0} paid cycles`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Rider payroll breakdown</CardTitle>
          <CardDescription>
            Rider payout is based on fixed monthly salary. Manual adjustments are admin-controlled only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rider</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Base salary</TableHead>
                  <TableHead className="text-right">Allowance</TableHead>
                  <TableHead className="text-right">Penalty</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topRiders.map((item) => (
                  <TableRow key={item.riderId}>
                    <TableCell>
                      <div className="font-medium">{item.riderName}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.phone}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.payroll.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.payroll.baseSalary)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.payroll.platformBonus)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.payroll.penalties)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.payroll.pendingAmount)}
                    </TableCell>
                  </TableRow>
                ))}
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : topRiders.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No rider payroll data yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <StatCard
          label="Delivered trips"
          value={`${summary.deliveredTrips ?? 0}`}
          helper="Performance only, not payout basis"
        />
        <StatCard
          label="Avg delivery time"
          value={formatMinutes(summary.averageDeliveryMinutes ?? 0)}
          helper="Ready to delivered"
        />
      </div>
    </div>
  )
}

function RiderPerformanceAnalytics({
  riders,
  summary,
  isLoading,
}: {
  riders: AdminRiderSummary[]
  summary: Record<string, number>
  isLoading: boolean
}) {
  const chartRows = [...riders]
    .sort((left, right) => right.deliveredTrips - left.deliveredTrips)
    .slice(0, 8)
    .map((rider) => ({
      name: rider.fullName.split(" ")[0] || rider.fullName,
      deliveredTrips: rider.deliveredTrips,
      completionRate: Math.round(rider.completionRate),
    }))

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="Completion rate"
          value={`${Math.round(summary.completionRate ?? 0)}%`}
          helper="Delivered vs assigned"
        />
        <StatCard
          label="Avg delivery time"
          value={formatMinutes(summary.averageDeliveryMinutes ?? 0)}
          helper="Ready to delivered"
        />
        <StatCard
          label="Cancelled trips"
          value={`${summary.cancelledTrips ?? 0}`}
          helper="Cancelled or rejected"
        />
        <StatCard
          label="Pending KYC"
          value={`${summary.pendingVerification ?? 0}`}
          helper={`${summary.missingDocuments ?? 0} missing docs`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Delivery performance</CardTitle>
          <CardDescription>Top rider throughput and completion rate.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-72 items-center justify-center">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : chartRows.length ? (
            <ChartContainer
              config={performanceChartConfig}
              className="h-72 w-full"
            >
              <BarChart data={chartRows}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  dataKey="deliveredTrips"
                  fill="var(--color-deliveredTrips)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="completionRate"
                  fill="var(--color-completionRate)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          ) : (
            <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
              No delivery analytics yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function DispatchControlsPanel({
  settings,
  isLoading,
  scope,
  onSaved,
}: {
  settings: AdminDispatchSettings | null
  isLoading: boolean
  scope: ReturnType<typeof getAdminZoneScope>
  onSaved: () => void
}) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = React.useState<Omit<
    AdminDispatchSettings,
    "metrics" | "recentLogs"
  > | null>(null)
  const [logFilter, setLogFilter] = React.useState<
    "all" | "assigned" | "reassigned" | "no_match" | "skipped"
  >("all")
  const [logSource, setLogSource] = React.useState<
    "all" | "manual_admin" | "auto_dispatch"
  >("all")
  const [logSearch, setLogSearch] = React.useState("")
  const [logFrom, setLogFrom] = React.useState("")
  const [logTo, setLogTo] = React.useState("")
  const [logPage, setLogPage] = React.useState(1)
  const [logPageSize, setLogPageSize] = React.useState(10)
  const debouncedLogSearch = useDebouncedValue(logSearch, 350)
  const saveMutation = useMutation({
    mutationFn: updateAdminDispatchSettings,
    onSuccess: () => {
      toast.success("Dispatch settings saved.")
      onSaved()
      void queryClient.invalidateQueries({ queryKey: ["admin-dispatch-settings"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-dispatch-logs"] })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Dispatch settings failed."
      )
    },
  })
  const runMutation = useMutation({
    mutationFn: runAdminAutoDispatch,
    onSuccess: (data) => {
      toast.success(
        `Auto dispatch scanned ${data.scanned}, assigned ${data.assigned}.`
      )
      onSaved()
      void queryClient.invalidateQueries({ queryKey: ["admin-dispatch-logs"] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Auto dispatch failed.")
    },
  })
  const riderOptionsQuery = useQuery({
    queryKey: ["admin-rider-assignment-options"],
    queryFn: listAdminRidersAssignmentOptions,
  })
  const dispatchLogsQuery = useQuery({
    queryKey: [
      "admin-dispatch-logs",
      {
        search: debouncedLogSearch,
        outcome: logFilter,
        source: logSource,
        from: logFrom,
        to: logTo,
        page: logPage,
        pageSize: logPageSize,
      },
    ],
    queryFn: () =>
      listAdminDispatchLogs({
        search: debouncedLogSearch,
        outcome: logFilter,
        source: logSource,
        from: logFrom ? new Date(`${logFrom}T00:00:00`).toISOString() : "",
        to: logTo ? new Date(`${logTo}T23:59:59`).toISOString() : "",
        page: logPage,
        pageSize: logPageSize,
      }),
  })
  const logPageCount = dispatchLogsQuery.data?.pageCount ?? 1

  React.useEffect(() => {
    if (!settings) return
    const { metrics, recentLogs, ...editable } = settings
    void metrics
    void recentLogs
    setDraft(editable)
  }, [settings])

  React.useEffect(() => {
    setLogPage(1)
  }, [debouncedLogSearch, logFilter, logSource, logFrom, logTo, logPageSize])

  React.useEffect(() => {
    if (logPage > logPageCount) setLogPage(logPageCount)
  }, [logPage, logPageCount])

  if (isLoading || !draft || !settings) {
    return (
      <Card>
        <CardContent className="flex h-48 items-center justify-center">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  function updateNumber(
    key: keyof EditableDispatchSettings,
    value: string,
    fallback: number
  ) {
    setDraft((current) =>
      current
        ? {
            ...current,
            [key]: Number.isFinite(Number(value)) ? Number(value) : fallback,
          }
        : current
    )
  }

  function applyPreset(preset: "launch" | "balanced" | "busy") {
    setDraft((current) => {
      if (!current) return current

      if (preset === "launch") {
        return {
          ...current,
          autoAssignmentEnabled: true,
          autoReassignTimedOutOrders: false,
          dispatchMode: "primary_rider",
          primaryRiderFallbackEnabled: true,
          algorithm: "nearest_eligible_balanced",
          maxActiveOrdersPerRider: 12,
          assignmentTimeoutMinutes: 15,
          retryCooldownMinutes: 5,
          surgeReadyOrderThreshold: 8,
          surgeUnassignedOrderThreshold: 4,
        }
      }

      if (preset === "busy") {
        return {
          ...current,
          autoAssignmentEnabled: true,
          autoReassignTimedOutOrders: true,
          dispatchMode: "fleet",
          primaryRiderFallbackEnabled: true,
          algorithm: "nearest_eligible_balanced",
          maxActiveOrdersPerRider: 4,
          assignmentTimeoutMinutes: 5,
          retryCooldownMinutes: 2,
          surgeReadyOrderThreshold: 3,
          surgeUnassignedOrderThreshold: 2,
        }
      }

      return {
        ...current,
        autoAssignmentEnabled: true,
        autoReassignTimedOutOrders: true,
        dispatchMode: "fleet",
        primaryRiderFallbackEnabled: true,
        algorithm: "least_loaded_first",
        maxActiveOrdersPerRider: 3,
        assignmentTimeoutMinutes: 8,
        retryCooldownMinutes: 3,
        surgeReadyOrderThreshold: 4,
        surgeUnassignedOrderThreshold: 2,
      }
    })
    toast.success("Dispatch preset applied. Save settings to publish.")
  }

  function handleSave() {
    const currentDraft = draft
    if (!currentDraft) return

    if (
      currentDraft.dispatchMode === "primary_rider" &&
      !currentDraft.primaryRiderId
    ) {
      toast.error("Select a primary rider before saving launch mode.")
      return
    }

    saveMutation.mutate(currentDraft)
  }

  const activePreset =
    draft.dispatchMode === "primary_rider"
      ? "launch"
      : draft.algorithm === "least_loaded_first" &&
          draft.maxActiveOrdersPerRider === 3
        ? "balanced"
        : draft.algorithm === "nearest_eligible_balanced" &&
            draft.maxActiveOrdersPerRider === 4 &&
            draft.assignmentTimeoutMinutes <= 5
          ? "busy"
          : ""

  const dispatchLogs = dispatchLogsQuery.data?.items ?? settings.recentLogs
  const logSafePage = Math.min(logPage, logPageCount)
  const logTotal = dispatchLogsQuery.data?.total ?? dispatchLogs.length
  const retentionDays = dispatchLogsQuery.data?.retentionDays ?? 90
  const logSummary = dispatchLogsQuery.data?.summary ?? {}
  const assignedLogs = logSummary.assigned ?? 0
  const reassignedLogs = logSummary.reassigned ?? 0
  const noMatchLogs = logSummary.no_match ?? 0
  const skippedLogs = logSummary.skipped ?? 0
  const successfulLogs = assignedLogs + reassignedLogs
  const successRate = logTotal ? Math.round((successfulLogs / logTotal) * 100) : 0
  const scopeLabel =
    scope.type === "zone"
      ? `Selected zone: ${scope.label}`
      : scope.type === "district"
        ? `Selected district: ${scope.label}`
        : "All areas"
  const policyScopeLabel =
    scope.type === "all"
      ? "Global fallback policy"
      : scope.type === "zone"
        ? "Zone dispatch override"
        : "District dispatch override"
  const policyScopeDescription =
    scope.type === "all"
      ? "Saved values are used as the platform fallback. Zone dispatch rules override these values for orders inside a service area."
      : scope.type === "zone"
        ? "Saved values apply only to this service zone. Global fallback remains unchanged."
        : "Saved values apply to every active zone in this district. Global fallback remains unchanged."

  function resetLogFilters() {
    setLogSearch("")
    setLogFilter("all")
    setLogSource("all")
    setLogFrom("")
    setLogTo("")
    setLogPage(1)
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="Eligible riders"
          value={`${settings.metrics.eligibleRiders}`}
          helper={`${settings.metrics.blockedRiders} blocked from dispatch`}
        />
        <StatCard
          label="Ready orders"
          value={`${settings.metrics.readyOrders}`}
          helper="Ready for pickup"
        />
        <StatCard
          label="Unassigned ready"
          value={`${settings.metrics.unassignedReadyOrders}`}
          helper="Needs dispatch"
        />
        <StatCard
          label="KYC queue"
          value={`${settings.metrics.pendingKycRiders}`}
          helper={`${settings.metrics.rejectedKycRiders} rejected`}
        />
      </div>

      {settings.metrics.singleRiderModeRecommended ? (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="flex flex-col gap-3 py-4 text-amber-900 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="font-medium">Single rider launch mode suggested</div>
              <div className="text-sm">
                Only {settings.metrics.eligibleRiders} rider is eligible. Use the
                launch preset so one deliveryman can carry multiple ready orders.
              </div>
            </div>
            <Button variant="outline" onClick={() => applyPreset("launch")}>
              Apply Launch Mode
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle>Auto dispatch controls</CardTitle>
              <CardDescription>
                {policyScopeLabel}. {policyScopeDescription}
              </CardDescription>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="outline">{scopeLabel}</Badge>
                <Badge variant="secondary">{policyScopeLabel}</Badge>
              </div>
            </div>
            <Button
              disabled={runMutation.isPending}
              onClick={() => runMutation.mutate()}
            >
              {runMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              Run auto dispatch
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
            Presets below are one-click draft shortcuts. They are not scheduled
            lunch or busy-hour automation. Choose a preset, review the values,
            then save to publish it for the current scope.
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Button
              type="button"
              variant={activePreset === "launch" ? "default" : "outline"}
              className={cn(
                "h-auto justify-start p-3 text-left",
                activePreset === "launch" && "shadow-sm"
              )}
              onClick={() => applyPreset("launch")}
            >
              <div className="w-full">
                <div className="flex items-center justify-between gap-2 font-medium">
                  <span>Launch Mode</span>
                  {activePreset === "launch" ? (
                    <CheckCircle2 className="size-4" />
                  ) : null}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Primary rider first, higher capacity, slower timeout.
                </div>
              </div>
            </Button>
            <Button
              type="button"
              variant={activePreset === "balanced" ? "default" : "outline"}
              className={cn(
                "h-auto justify-start p-3 text-left",
                activePreset === "balanced" && "shadow-sm"
              )}
              onClick={() => applyPreset("balanced")}
            >
              <div className="w-full">
                <div className="flex items-center justify-between gap-2 font-medium">
                  <span>Balanced Fleet</span>
                  {activePreset === "balanced" ? (
                    <CheckCircle2 className="size-4" />
                  ) : null}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Fleet mode with controlled load and normal retry timing.
                </div>
              </div>
            </Button>
            <Button
              type="button"
              variant={activePreset === "busy" ? "default" : "outline"}
              className={cn(
                "h-auto justify-start p-3 text-left",
                activePreset === "busy" && "shadow-sm"
              )}
              onClick={() => applyPreset("busy")}
            >
              <div className="w-full">
                <div className="flex items-center justify-between gap-2 font-medium">
                  <span>Busy Hour</span>
                  {activePreset === "busy" ? (
                    <CheckCircle2 className="size-4" />
                  ) : null}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Fleet mode with faster timeout and lower pressure threshold.
                </div>
              </div>
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="font-medium">Auto assignment</div>
                <div className="text-sm text-muted-foreground">
                  Assign ready orders automatically.
                </div>
              </div>
              <Switch
                checked={draft.autoAssignmentEnabled}
                onCheckedChange={(checked) =>
                  setDraft((current) =>
                    current
                      ? { ...current, autoAssignmentEnabled: checked }
                      : current
                  )
                }
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="font-medium">Timed-out reassignment</div>
                <div className="text-sm text-muted-foreground">
                  Reassign riders who do not acknowledge.
                </div>
              </div>
              <Switch
                checked={draft.autoReassignTimedOutOrders}
                onCheckedChange={(checked) =>
                  setDraft((current) =>
                    current
                      ? { ...current, autoReassignTimedOutOrders: checked }
                      : current
                  )
                }
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Dispatch mode</Label>
              <Select
                value={draft.dispatchMode}
                onValueChange={(value) =>
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          dispatchMode:
                            value as AdminDispatchSettings["dispatchMode"],
                        }
                      : current
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fleet">Fleet dispatch</SelectItem>
                  <SelectItem value="primary_rider">Primary rider</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Fleet spreads orders. Primary mode tries the selected rider first.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Primary rider</Label>
              <Select
                value={draft.primaryRiderId || "none"}
                disabled={draft.dispatchMode !== "primary_rider"}
                onValueChange={(value) =>
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          primaryRiderId: value === "none" ? "" : value,
                        }
                      : current
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select rider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select rider</SelectItem>
                  {(riderOptionsQuery.data ?? []).map((rider) => (
                    <SelectItem key={rider.id} value={rider.id}>
                      {rider.fullName} - {rider.phone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Current: {settings.metrics.primaryRiderName || "Not selected"}
                {settings.metrics.primaryRiderName
                  ? `, ${settings.metrics.primaryRiderActiveOrders} active`
                  : ""}
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="font-medium">Fallback riders</div>
                <div className="text-sm text-muted-foreground">
                  Use other riders when primary is full or unavailable.
                </div>
              </div>
              <Switch
                checked={draft.primaryRiderFallbackEnabled}
                disabled={draft.dispatchMode !== "primary_rider"}
                onCheckedChange={(checked) =>
                  setDraft((current) =>
                    current
                      ? { ...current, primaryRiderFallbackEnabled: checked }
                      : current
                  )
                }
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Algorithm</Label>
              <Select
                value={draft.algorithm}
                onValueChange={(value) =>
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          algorithm: value as AdminDispatchSettings["algorithm"],
                        }
                      : current
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nearest_eligible_balanced">
                    Nearest balanced
                  </SelectItem>
                  <SelectItem value="least_loaded_first">
                    Least loaded first
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Max active orders</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={draft.maxActiveOrdersPerRider}
                onChange={(event) =>
                  updateNumber("maxActiveOrdersPerRider", event.target.value, 3)
                }
              />
              <p className="text-xs text-muted-foreground">
                Auto dispatch and rider self-accept stop at this active order limit.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Assignment timeout</Label>
              <Input
                type="number"
                min={1}
                max={180}
                value={draft.assignmentTimeoutMinutes}
                onChange={(event) =>
                  updateNumber("assignmentTimeoutMinutes", event.target.value, 8)
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Stale location cutoff</Label>
              <Input
                type="number"
                min={1}
                max={180}
                value={draft.staleLocationCutoffMinutes}
                onChange={(event) =>
                  updateNumber(
                    "staleLocationCutoffMinutes",
                    event.target.value,
                    20
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Retry cooldown</Label>
              <Input
                type="number"
                min={1}
                max={60}
                value={draft.retryCooldownMinutes}
                onChange={(event) =>
                  updateNumber("retryCooldownMinutes", event.target.value, 3)
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Surge ready threshold</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={draft.surgeReadyOrderThreshold}
                onChange={(event) =>
                  updateNumber("surgeReadyOrderThreshold", event.target.value, 4)
                }
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              disabled={saveMutation.isPending}
              onClick={handleSave}
            >
              {saveMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save settings
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle>Dispatch decision log</CardTitle>
              <CardDescription>
                Paginated assignment decisions. Detailed logs auto-expire after{" "}
                {retentionDays} days.
              </CardDescription>
            </div>
            <Button variant="outline" onClick={resetLogFilters}>
              <RotateCcw className="size-4" />
              Reset filters
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_170px_170px_150px_150px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search order, rider, restaurant"
                value={logSearch}
                onChange={(event) => setLogSearch(event.target.value)}
              />
            </div>
            <Select
              value={logFilter}
              onValueChange={(value) =>
                setLogFilter(
                  value as
                    | "all"
                    | "assigned"
                    | "reassigned"
                    | "no_match"
                    | "skipped"
                )
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All outcomes</SelectItem>
                <SelectItem value="assigned">Assigned</SelectItem>
                <SelectItem value="reassigned">Reassigned</SelectItem>
                <SelectItem value="no_match">No match</SelectItem>
                <SelectItem value="skipped">Skipped</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={logSource}
              onValueChange={(value) =>
                setLogSource(value as "all" | "manual_admin" | "auto_dispatch")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="auto_dispatch">Auto dispatch</SelectItem>
                <SelectItem value="manual_admin">Manual/admin</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={logFrom}
              onChange={(event) => setLogFrom(event.target.value)}
            />
            <Input
              type="date"
              value={logTo}
              onChange={(event) => setLogTo(event.target.value)}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            <div className="rounded-lg border bg-background p-3">
              <div className="text-xs text-muted-foreground">Success rate</div>
              <div className="mt-1 text-xl font-semibold">{successRate}%</div>
              <div className="text-xs text-muted-foreground">
                {successfulLogs} successful decisions
              </div>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <div className="text-xs text-muted-foreground">Assigned</div>
              <div className="mt-1 text-xl font-semibold">{assignedLogs}</div>
              <div className="text-xs text-muted-foreground">
                Direct rider matches
              </div>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <div className="text-xs text-muted-foreground">Reassigned</div>
              <div className="mt-1 text-xl font-semibold">{reassignedLogs}</div>
              <div className="text-xs text-muted-foreground">
                Timed-out replacement
              </div>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <div className="text-xs text-muted-foreground">No match</div>
              <div className="mt-1 text-xl font-semibold">{noMatchLogs}</div>
              <div className="text-xs text-muted-foreground">
                Capacity or eligibility blocked
              </div>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <div className="text-xs text-muted-foreground">Skipped</div>
              <div className="mt-1 text-xl font-semibold">{skippedLogs}</div>
              <div className="text-xs text-muted-foreground">
                State changed or cooling down
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Decision</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Rider</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Top candidates</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dispatchLogsQuery.isLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-24 text-center text-muted-foreground"
                    >
                      <Loader2 className="mx-auto size-4 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : null}
                {dispatchLogs.map((log) => (
                  <TableRow key={log.id} className="align-top">
                    <TableCell>
                      <div className="font-medium">{log.orderNumber}</div>
                      <div className="text-xs text-muted-foreground">
                        {log.restaurantName || "Restaurant"}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {formatDate(log.createdAt)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          log.outcome === "assigned" &&
                            "border-emerald-200 bg-emerald-50 text-emerald-700",
                          log.outcome === "reassigned" &&
                            "border-blue-200 bg-blue-50 text-blue-700",
                          log.outcome === "no_match" &&
                            "border-amber-200 bg-amber-50 text-amber-700",
                          log.outcome === "skipped" &&
                            "border-muted bg-muted text-muted-foreground"
                        )}
                      >
                        {log.outcome.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {log.selectedRiderName || "Not assigned"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {log.assignmentSource === "manual_admin"
                          ? "Manual/admin"
                          : "Auto dispatch"}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-sm">
                      <div className="line-clamp-3 text-sm">{log.reason}</div>
                    </TableCell>
                    <TableCell className="min-w-64">
                      {log.candidates.length ? (
                        <div className="space-y-2">
                          {log.candidates.slice(0, 3).map((candidate) => (
                            <div
                              key={`${log.id}-${candidate.riderId}`}
                              className="rounded-md border bg-background px-2 py-1.5"
                            >
                              <div className="flex items-center justify-between gap-2 text-sm">
                                <span className="truncate font-medium">
                                  {candidate.riderName}
                                </span>
                                <Badge variant="secondary" className="shrink-0">
                                  {candidate.score === null
                                    ? "N/A"
                                    : Math.round(candidate.score)}
                                </Badge>
                              </div>
                              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                <span>{candidate.activeOrders} active</span>
                                <span>
                                  {candidate.distanceKm === null
                                    ? "No distance"
                                    : `${candidate.distanceKm.toFixed(1)} km`}
                                </span>
                                <span>{candidate.capacityState || "capacity"}</span>
                              </div>
                            </div>
                          ))}
                          {log.candidates.length > 3 ? (
                            <div className="text-xs text-muted-foreground">
                              +{log.candidates.length - 3} more candidates
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          No eligible candidates
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!dispatchLogsQuery.isLoading && dispatchLogs.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No dispatch decisions match this filter.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {dispatchLogs.length} of {logTotal} logs
              {dispatchLogsQuery.isFetching && !dispatchLogsQuery.isLoading
                ? " - refreshing"
                : ""}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Select
                value={`${logPageSize}`}
                onValueChange={(value) => setLogPageSize(Number(value))}
              >
                <SelectTrigger className="w-full sm:w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent side="top">
                  {[10, 20, 50].map((size) => (
                    <SelectItem key={size} value={`${size}`}>
                      {size} / page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-sm font-medium">
                Page {logSafePage} of {logPageCount}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  disabled={logSafePage <= 1 || dispatchLogsQuery.isFetching}
                  onClick={() => setLogPage((current) => Math.max(1, current - 1))}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={
                    logSafePage >= logPageCount || dispatchLogsQuery.isFetching
                  }
                  onClick={() =>
                    setLogPage((current) => Math.min(logPageCount, current + 1))
                  }
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
