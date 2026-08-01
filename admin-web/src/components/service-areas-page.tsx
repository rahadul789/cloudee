import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Archive,
  CloudRain,
  Loader2,
  Map as MapIcon,
  MapPin,
  Pencil,
  Plus,
  Radar,
  Save,
  Truck,
} from "lucide-react"
import {
  Circle,
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
} from "react-leaflet"
import "leaflet/dist/leaflet.css"
import { toast } from "sonner"

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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  archiveAdminServiceZone,
  createAdminServiceDistrict,
  createAdminServiceZone,
  getAdminServiceAreas,
  listAdminRidersAssignmentOptions,
  updateAdminServiceZone,
  type AdminRiderAssignmentOption,
  type AdminServiceDistrict,
  type AdminServiceZone,
} from "@/lib/admin-api"
import { cn } from "@/lib/utils"

const statusTone: Record<string, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  paused: "border-amber-200 bg-amber-50 text-amber-700",
  archived: "border-slate-200 bg-slate-50 text-slate-600",
}

type ZoneFormState = {
  districtId: string
  name: string
  status: "active" | "paused" | "archived"
  latitude: string
  longitude: string
  radiusKm: string
  baseFeeTaka: string
  distanceSurchargeEnabled: boolean
  surchargeStartsAfterKm: string
  surchargeStepMeters: string
  surchargeAmountTaka: string
  maxRestaurantDistanceKm: string
  rainSurchargeEnabled: boolean
  rainSurchargeTaka: string
  platformFeeOverride: boolean
  platformFeeEnabled: boolean
  platformFeeMode: "flat" | "percentage" | "optional"
  platformFeeAmountTaka: string
  platformFeePercentage: string
  platformFeeLabel: string
  platformFeeNote: string
  urgentDeliveryOverride: boolean
  urgentDeliveryEnabled: boolean
  urgentDeliveryAmountTaka: string
  urgentDeliveryLabel: string
  urgentDeliveryNote: string
  autoAssignEnabled: boolean
  dispatchMode: "fleet" | "primary_rider"
  primaryRiderId: string
  primaryRiderFallbackEnabled: boolean
  algorithm: "nearest_eligible_balanced" | "least_loaded_first"
  maxActiveOrdersPerRiderOverride: string
  staleLocationCutoffMinutes: string
  retryCooldownMinutes: string
  priority: string
  notes: string
}

const defaultZoneForm: ZoneFormState = {
  districtId: "",
  name: "",
  status: "active",
  latitude: "24.8765267",
  longitude: "90.7249078",
  radiusKm: "5.5",
  baseFeeTaka: "45",
  // Default OFF: a new zone must not silently enable a per-distance surcharge. The
  // platform default is also OFF (operations.deliveryPricing), so a zone left untouched
  // matches it. Admin opts in explicitly.
  distanceSurchargeEnabled: false,
  surchargeStartsAfterKm: "2",
  surchargeStepMeters: "1000",
  surchargeAmountTaka: "10",
  maxRestaurantDistanceKm: "7",
  rainSurchargeEnabled: false,
  rainSurchargeTaka: "20",
  platformFeeOverride: false,
  platformFeeEnabled: false,
  platformFeeMode: "flat",
  platformFeeAmountTaka: "0",
  platformFeePercentage: "0",
  platformFeeLabel: "Platform fee",
  platformFeeNote: "",
  urgentDeliveryOverride: false,
  urgentDeliveryEnabled: false,
  urgentDeliveryAmountTaka: "0",
  urgentDeliveryLabel: "Urgent delivery",
  urgentDeliveryNote: "",
  autoAssignEnabled: true,
  dispatchMode: "fleet",
  primaryRiderId: "",
  primaryRiderFallbackEnabled: true,
  algorithm: "nearest_eligible_balanced",
  maxActiveOrdersPerRiderOverride: "",
  staleLocationCutoffMinutes: "20",
  retryCooldownMinutes: "3",
  priority: "100",
  notes: "",
}

function toNumber(value: string, fallback: number) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : fallback
}

function formatMoney(value?: number | null) {
  return `Tk ${Math.max(0, Math.round(Number(value ?? 0))).toLocaleString()}`
}

function zoneToForm(zone: AdminServiceZone): ZoneFormState {
  return {
    districtId: zone.districtId,
    name: zone.name,
    status: zone.status,
    latitude: String(zone.center?.latitude ?? ""),
    longitude: String(zone.center?.longitude ?? ""),
    radiusKm: String(zone.radiusKm ?? ""),
    baseFeeTaka: String(zone.delivery?.baseFeeTaka ?? ""),
    // Only ON when the zone was EXPLICITLY set to true. null/undefined means "inherit"
    // (the zone never opted in) → the effective state is the global default (OFF), so the
    // toggle must read OFF, not default to ON. This is the fix for the surcharge that
    // looked like it "auto-disabled": the toggle used to show ON for never-set zones.
    distanceSurchargeEnabled: zone.delivery?.distanceSurchargeEnabled === true,
    surchargeStartsAfterKm: String(zone.delivery?.surchargeStartsAfterKm ?? ""),
    surchargeStepMeters: String(zone.delivery?.surchargeStepMeters ?? ""),
    surchargeAmountTaka: String(zone.delivery?.surchargeAmountTaka ?? ""),
    maxRestaurantDistanceKm: String(
      zone.delivery?.maxRestaurantDistanceKm ?? ""
    ),
    rainSurchargeEnabled: Boolean(zone.delivery?.rainSurchargeEnabled),
    rainSurchargeTaka: String(zone.delivery?.rainSurchargeTaka ?? ""),
    platformFeeOverride: zone.delivery?.platformFee?.override === true,
    platformFeeEnabled: zone.delivery?.platformFee?.enabled === true,
    platformFeeMode:
      zone.delivery?.platformFee?.mode === "percentage" ||
      zone.delivery?.platformFee?.mode === "optional"
        ? zone.delivery.platformFee.mode
        : "flat",
    platformFeeAmountTaka: String(zone.delivery?.platformFee?.amountTaka ?? "0"),
    platformFeePercentage: String(zone.delivery?.platformFee?.percentage ?? "0"),
    platformFeeLabel: zone.delivery?.platformFee?.label ?? "Platform fee",
    platformFeeNote: zone.delivery?.platformFee?.note ?? "",
    urgentDeliveryOverride: zone.delivery?.urgentDelivery?.override === true,
    urgentDeliveryEnabled: zone.delivery?.urgentDelivery?.enabled === true,
    urgentDeliveryAmountTaka: String(
      zone.delivery?.urgentDelivery?.amountTaka ?? "0",
    ),
    urgentDeliveryLabel:
      zone.delivery?.urgentDelivery?.label ?? "Urgent delivery",
    urgentDeliveryNote: zone.delivery?.urgentDelivery?.note ?? "",
    autoAssignEnabled: zone.dispatch?.autoAssignEnabled !== false,
    dispatchMode:
      zone.dispatch?.dispatchMode === "primary_rider"
        ? "primary_rider"
        : "fleet",
    primaryRiderId: zone.dispatch?.primaryRiderId ?? "",
    primaryRiderFallbackEnabled:
      zone.dispatch?.primaryRiderFallbackEnabled !== false,
    algorithm:
      zone.dispatch?.algorithm === "least_loaded_first"
        ? "least_loaded_first"
        : "nearest_eligible_balanced",
    maxActiveOrdersPerRiderOverride:
      zone.dispatch?.maxActiveOrdersPerRiderOverride == null
        ? ""
        : String(zone.dispatch.maxActiveOrdersPerRiderOverride),
    staleLocationCutoffMinutes: String(
      zone.dispatch?.staleLocationCutoffMinutes ?? ""
    ),
    retryCooldownMinutes: String(zone.dispatch?.retryCooldownMinutes ?? ""),
    priority: String(zone.priority ?? 0),
    notes: zone.notes ?? "",
  }
}

function buildZonePayload(form: ZoneFormState) {
  return {
    districtId: form.districtId,
    name: form.name.trim(),
    status: form.status,
    center: {
      latitude: toNumber(form.latitude, 24.8765267),
      longitude: toNumber(form.longitude, 90.7249078),
    },
    radiusKm: toNumber(form.radiusKm, 5),
    priority: Math.round(toNumber(form.priority, 0)),
    delivery: {
      baseFeeTaka: toNumber(form.baseFeeTaka, 0),
      distanceSurchargeEnabled: form.distanceSurchargeEnabled,
      surchargeStartsAfterKm: toNumber(form.surchargeStartsAfterKm, 0),
      surchargeStepMeters: Math.max(
        1,
        Math.round(toNumber(form.surchargeStepMeters, 1000))
      ),
      surchargeAmountTaka: toNumber(form.surchargeAmountTaka, 0),
      maxRestaurantDistanceKm: toNumber(form.maxRestaurantDistanceKm, 0),
      rainSurchargeEnabled: form.rainSurchargeEnabled,
      rainSurchargeTaka: toNumber(form.rainSurchargeTaka, 0),
      platformFee: {
        override: form.platformFeeOverride,
        enabled: form.platformFeeEnabled,
        mode: form.platformFeeMode,
        amountTaka: Math.max(0, Math.round(toNumber(form.platformFeeAmountTaka, 0))),
        percentage: Math.max(
          0,
          Math.min(100, toNumber(form.platformFeePercentage, 0)),
        ),
        label: form.platformFeeLabel.trim() || "Platform fee",
        note: form.platformFeeNote.trim(),
      },
      urgentDelivery: {
        override: form.urgentDeliveryOverride,
        enabled: form.urgentDeliveryEnabled,
        amountTaka: Math.max(
          0,
          Math.round(toNumber(form.urgentDeliveryAmountTaka, 0)),
        ),
        label: form.urgentDeliveryLabel.trim() || "Urgent delivery",
        note: form.urgentDeliveryNote.trim(),
      },
    },
    dispatch: {
      autoAssignEnabled: form.autoAssignEnabled,
      dispatchMode: form.dispatchMode,
      primaryRiderId: form.primaryRiderId.trim(),
      primaryRiderFallbackEnabled: form.primaryRiderFallbackEnabled,
      algorithm: form.algorithm,
      maxActiveOrdersPerRiderOverride:
        form.maxActiveOrdersPerRiderOverride.trim()
          ? Math.max(
              1,
              Math.round(toNumber(form.maxActiveOrdersPerRiderOverride, 3))
            )
          : null,
      staleLocationCutoffMinutes: Math.max(
        1,
        Math.round(toNumber(form.staleLocationCutoffMinutes, 20))
      ),
      retryCooldownMinutes: Math.max(
        1,
        Math.round(toNumber(form.retryCooldownMinutes, 3))
      ),
    },
    notes: form.notes.trim(),
  }
}

function ServiceMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  )
}

function ZoneCard({
  zone,
  onEdit,
  onMap,
  onArchive,
  isArchiving,
}: {
  zone: AdminServiceZone
  onEdit: (zone: AdminServiceZone) => void
  onMap: (zone: AdminServiceZone) => void
  onArchive: (zone: AdminServiceZone) => void
  isArchiving: boolean
}) {
  return (
    <div className="rounded-md border bg-background p-4 shadow-sm transition hover:border-primary/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">{zone.name}</h3>
            <Badge className={cn("capitalize", statusTone[zone.status])}>
              {zone.status}
            </Badge>
            <Badge variant="outline">{zone.districtName}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {zone.center?.latitude}, {zone.center?.longitude}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onMap(zone)}
          >
            <MapIcon className="size-4" />
            Map
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onEdit(zone)}
          >
            <Pencil className="size-4" />
            Edit
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isArchiving}
            onClick={() => onArchive(zone)}
          >
            {isArchiving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Archive className="size-4" />
            )}
            Archive
          </Button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ServiceMetric
          icon={Radar}
          label="Coverage"
          value={`${zone.radiusKm} km`}
        />
        <ServiceMetric
          icon={Truck}
          label="Base delivery"
          value={formatMoney(zone.delivery?.baseFeeTaka)}
        />
        <ServiceMetric
          icon={MapPin}
          label="Distance step"
          value={
            zone.delivery?.distanceSurchargeEnabled === true
              ? `${zone.delivery?.surchargeAmountTaka ?? 0} tk / ${zone.delivery?.surchargeStepMeters ?? 1000}m`
              : "OFF"
          }
        />
        <ServiceMetric
          icon={CloudRain}
          label={
            zone.delivery?.rainSurchargeEnabled
              ? "Rain surcharge"
              : "Rain reserve"
          }
          value={`${zone.delivery?.rainSurchargeEnabled ? "ON - " : "OFF - "}${formatMoney(zone.delivery?.rainSurchargeTaka)}`}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <Badge variant="outline">
          Dispatch{" "}
          {zone.dispatch?.autoAssignEnabled === false ? "manual" : "auto"}
        </Badge>
        <Badge variant="outline">
          {zone.dispatch?.algorithm === "least_loaded_first"
            ? "Least loaded"
            : "Nearest balanced"}
        </Badge>
        <Badge variant="outline">
          Max restaurant {zone.delivery?.maxRestaurantDistanceKm ?? "-"} km
        </Badge>
      </div>
      {zone.notes ? (
        <p className="mt-3 text-sm text-muted-foreground">{zone.notes}</p>
      ) : null}
    </div>
  )
}

function CoverageMap({
  zone,
  previewRadiusKm,
}: {
  zone: AdminServiceZone
  previewRadiusKm: number
}) {
  const latitude = zone.center?.latitude ?? 24.8765267
  const longitude = zone.center?.longitude ?? 90.7249078
  const radiusMeters = previewRadiusKm * 1000

  return (
    <div className="relative h-full min-h-[520px] overflow-hidden bg-slate-950">
      <MapContainer
        center={[latitude, longitude]}
        zoom={13}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Circle
          center={[latitude, longitude]}
          radius={radiusMeters}
          pathOptions={{
            color: "#ec4899",
            fillColor: "#f9a8d4",
            fillOpacity: 0.15,
            weight: 2,
          }}
        />
        <CircleMarker
          center={[latitude, longitude]}
          radius={8}
          pathOptions={{
            color: "#0f172a",
            fillColor: "#0f172a",
            fillOpacity: 1,
          }}
        >
          <Popup>
            <div className="space-y-1">
              <p className="font-semibold">{zone.name}</p>
              <p>{previewRadiusKm.toFixed(1)} km preview radius</p>
              <p>Base fee: {formatMoney(zone.delivery?.baseFeeTaka)}</p>
            </div>
          </Popup>
        </CircleMarker>
      </MapContainer>
    </div>
  )
}

export function ServiceAreasPage() {
  const queryClient = useQueryClient()
  const [districtName, setDistrictName] = React.useState("")
  const [zoneForm, setZoneForm] = React.useState<ZoneFormState>(defaultZoneForm)
  const [editingZoneId, setEditingZoneId] = React.useState("")
  const [mapZone, setMapZone] = React.useState<AdminServiceZone | null>(null)
  const [mapPreviewRadiusKm, setMapPreviewRadiusKm] = React.useState(1)

  const serviceAreasQuery = useQuery({
    queryKey: ["admin-service-areas"],
    queryFn: getAdminServiceAreas,
  })
  const riderOptionsQuery = useQuery({
    queryKey: ["admin-rider-assignment-options", "service-areas"],
    queryFn: listAdminRidersAssignmentOptions,
    staleTime: 30_000,
  })

  const districts = React.useMemo(
    () => serviceAreasQuery.data?.districts ?? [],
    [serviceAreasQuery.data?.districts]
  )
  const zones = React.useMemo(
    () => serviceAreasQuery.data?.zones ?? [],
    [serviceAreasQuery.data?.zones]
  )
  const riderOptions = riderOptionsQuery.data ?? []

  React.useEffect(() => {
    if (!zoneForm.districtId && districts[0]?.id) {
      setZoneForm((current) => ({ ...current, districtId: districts[0].id }))
    }
  }, [districts, zoneForm.districtId])

  const invalidate = () => queryClient.invalidateQueries()

  const createDistrictMutation = useMutation({
    mutationFn: () => createAdminServiceDistrict({ name: districtName.trim() }),
    onSuccess: () => {
      setDistrictName("")
      toast.success("District created")
      void invalidate()
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "District save failed"
      ),
  })

  const saveZoneMutation = useMutation({
    mutationFn: () => {
      const payload = buildZonePayload(zoneForm)
      return editingZoneId
        ? updateAdminServiceZone(editingZoneId, payload)
        : createAdminServiceZone(payload)
    },
    onSuccess: () => {
      setEditingZoneId("")
      setZoneForm((current) => ({
        ...defaultZoneForm,
        districtId: current.districtId,
      }))
      toast.success("Service zone saved")
      void invalidate()
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Zone save failed"),
  })

  const archiveZoneMutation = useMutation({
    mutationFn: (zoneId: string) => archiveAdminServiceZone(zoneId),
    onSuccess: () => {
      toast.success("Service zone archived")
      void invalidate()
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Archive failed"),
  })

  const activeZones = zones.filter((zone) => zone.status === "active").length
  const pausedZones = zones.filter((zone) => zone.status === "paused").length

  function openCoverageMap(zone: AdminServiceZone) {
    setMapPreviewRadiusKm(Math.min(5, Math.max(1, Number(zone.radiusKm ?? 1))))
    setMapZone(zone)
  }
  const activeDistricts = districts.filter(
    (district) => district.status === "active"
  ).length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Service Areas
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage districts, zone radius, delivery pricing, and rider dispatch
            boundaries.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void serviceAreasQuery.refetch()}
        >
          {serviceAreasQuery.isFetching ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Radar className="size-4" />
          )}
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <ServiceMetric
          icon={MapPin}
          label="Districts"
          value={activeDistricts}
        />
        <ServiceMetric icon={Radar} label="Active zones" value={activeZones} />
        <ServiceMetric
          icon={CloudRain}
          label="Paused zones"
          value={pausedZones}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <Card>
          <CardHeader>
            <CardTitle>Coverage zones</CardTitle>
            <CardDescription>
              Customers, restaurants, riders, and orders are matched by active
              zone.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {serviceAreasQuery.isLoading ? (
              <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" />
                Loading service areas
              </div>
            ) : zones.length ? (
              zones.map((zone) => (
                <ZoneCard
                  key={zone.id}
                  zone={zone}
                  onMap={openCoverageMap}
                  onEdit={(nextZone) => {
                    setEditingZoneId(nextZone.id)
                    setZoneForm(zoneToForm(nextZone))
                  }}
                  onArchive={(nextZone) =>
                    archiveZoneMutation.mutate(nextZone.id)
                  }
                  isArchiving={archiveZoneMutation.isPending}
                />
              ))
            ) : (
              <div className="rounded-md border border-dashed p-8 text-center">
                <MapPin className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-3 font-medium">No service zone yet</p>
                <p className="text-sm text-muted-foreground">
                  Create a district and zone before running location based
                  tests.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Add district</CardTitle>
              <CardDescription>
                Use this for a city or district level rollout.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label>District name</Label>
                <Input
                  value={districtName}
                  onChange={(event) => setDistrictName(event.target.value)}
                  placeholder="Netrokona"
                />
              </div>
              <Button
                type="button"
                disabled={
                  !districtName.trim() || createDistrictMutation.isPending
                }
                onClick={() => createDistrictMutation.mutate()}
              >
                {createDistrictMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Create district
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                {editingZoneId ? "Edit zone" : "Create zone"}
              </CardTitle>
              <CardDescription>
                Radius controls what customer addresses are serviceable.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label>District</Label>
                  <NativeSelect
                    className="w-full"
                    value={zoneForm.districtId}
                    onChange={(event) =>
                      setZoneForm((current) => ({
                        ...current,
                        districtId: event.target.value,
                      }))
                    }
                  >
                    {districts.map((district: AdminServiceDistrict) => (
                      <NativeSelectOption key={district.id} value={district.id}>
                        {district.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Zone name</Label>
                  <Input
                    value={zoneForm.name}
                    onChange={(event) =>
                      setZoneForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Netrokona Sadar"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Latitude</Label>
                  <Input
                    value={zoneForm.latitude}
                    onChange={(event) =>
                      setZoneForm((current) => ({
                        ...current,
                        latitude: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Longitude</Label>
                  <Input
                    value={zoneForm.longitude}
                    onChange={(event) =>
                      setZoneForm((current) => ({
                        ...current,
                        longitude: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Radius km</Label>
                  <Input
                    value={zoneForm.radiusKm}
                    onChange={(event) =>
                      setZoneForm((current) => ({
                        ...current,
                        radiusKm: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <NativeSelect
                    className="w-full"
                    value={zoneForm.status}
                    onChange={(event) =>
                      setZoneForm((current) => ({
                        ...current,
                        status: event.target.value as ZoneFormState["status"],
                      }))
                    }
                  >
                    <NativeSelectOption value="active">
                      Active
                    </NativeSelectOption>
                    <NativeSelectOption value="paused">
                      Paused
                    </NativeSelectOption>
                    <NativeSelectOption value="archived">
                      Archived
                    </NativeSelectOption>
                  </NativeSelect>
                </div>
              </div>

              <Separator />

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Base delivery fee</Label>
                  <Input
                    value={zoneForm.baseFeeTaka}
                    onChange={(event) =>
                      setZoneForm((current) => ({
                        ...current,
                        baseFeeTaka: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border p-3 sm:col-span-2">
                  <div>
                    <Label>Distance step surcharge active</Label>
                    <p className="text-xs text-muted-foreground">
                      When off, only the base fee is charged for this zone (no
                      per-step-meter distance surcharge).
                    </p>
                  </div>
                  <Switch
                    checked={zoneForm.distanceSurchargeEnabled}
                    onCheckedChange={(checked) =>
                      setZoneForm((current) => ({
                        ...current,
                        distanceSurchargeEnabled: checked,
                      }))
                    }
                  />
                </div>
                {zoneForm.distanceSurchargeEnabled ? (
                  <>
                    <div className="space-y-2">
                      <Label>Surcharge after km</Label>
                      <Input
                        value={zoneForm.surchargeStartsAfterKm}
                        onChange={(event) =>
                          setZoneForm((current) => ({
                            ...current,
                            surchargeStartsAfterKm: event.target.value,
                          }))
                        }
                      />
                    </div>
                <div className="space-y-2">
                  <Label>Step meters</Label>
                  <Input
                    value={zoneForm.surchargeStepMeters}
                    onChange={(event) =>
                      setZoneForm((current) => ({
                        ...current,
                        surchargeStepMeters: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Step charge</Label>
                  <Input
                    value={zoneForm.surchargeAmountTaka}
                    onChange={(event) =>
                      setZoneForm((current) => ({
                        ...current,
                        surchargeAmountTaka: event.target.value,
                      }))
                    }
                  />
                </div>
                  </>
                ) : null}
                <div className="space-y-2">
                  <Label>Max restaurant distance km</Label>
                  <Input
                    value={zoneForm.maxRestaurantDistanceKm}
                    onChange={(event) =>
                      setZoneForm((current) => ({
                        ...current,
                        maxRestaurantDistanceKm: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Rain extra charge</Label>
                  <Input
                    value={zoneForm.rainSurchargeTaka}
                    onChange={(event) =>
                      setZoneForm((current) => ({
                        ...current,
                        rainSurchargeTaka: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border p-3 sm:col-span-2">
                  <div>
                    <Label>Rain surcharge active</Label>
                    <p className="text-xs text-muted-foreground">
                      Turn on during heavy rain for this zone only.
                    </p>
                  </div>
                  <Switch
                    checked={zoneForm.rainSurchargeEnabled}
                    onCheckedChange={(checked) =>
                      setZoneForm((current) => ({
                        ...current,
                        rainSurchargeEnabled: checked,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-3 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Override platform fee for this zone</Label>
                    <p className="text-xs text-muted-foreground">
                      When off, this zone uses the global platform fee (Settings). Turn
                      on to set a different fee just for this area.
                    </p>
                  </div>
                  <Switch
                    checked={zoneForm.platformFeeOverride}
                    onCheckedChange={(checked) =>
                      setZoneForm((current) => ({
                        ...current,
                        platformFeeOverride: checked,
                      }))
                    }
                  />
                </div>
                {zoneForm.platformFeeOverride ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex items-center justify-between rounded-md border p-3 sm:col-span-2">
                      <Label>Charge platform fee in this zone</Label>
                      <Switch
                        checked={zoneForm.platformFeeEnabled}
                        onCheckedChange={(checked) =>
                          setZoneForm((current) => ({
                            ...current,
                            platformFeeEnabled: checked,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Fee type</Label>
                      <NativeSelect
                        className="w-full"
                        value={zoneForm.platformFeeMode}
                        onChange={(event) =>
                          setZoneForm((current) => ({
                            ...current,
                            platformFeeMode: event.target
                              .value as ZoneFormState["platformFeeMode"],
                          }))
                        }
                      >
                        <NativeSelectOption value="flat">
                          Flat amount
                        </NativeSelectOption>
                        <NativeSelectOption value="percentage">
                          Percentage
                        </NativeSelectOption>
                        <NativeSelectOption value="optional">
                          Optional (opt-in)
                        </NativeSelectOption>
                      </NativeSelect>
                    </div>
                    {zoneForm.platformFeeMode === "percentage" ? (
                      <div className="space-y-2">
                        <Label>Percentage (%)</Label>
                        <Input
                          value={zoneForm.platformFeePercentage}
                          onChange={(event) =>
                            setZoneForm((current) => ({
                              ...current,
                              platformFeePercentage: event.target.value,
                            }))
                          }
                        />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label>
                          {zoneForm.platformFeeMode === "optional"
                            ? "Suggested amount (৳)"
                            : "Amount (৳)"}
                        </Label>
                        <Input
                          value={zoneForm.platformFeeAmountTaka}
                          onChange={(event) =>
                            setZoneForm((current) => ({
                              ...current,
                              platformFeeAmountTaka: event.target.value,
                            }))
                          }
                        />
                      </div>
                    )}
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Label shown to customer</Label>
                      <Input
                        value={zoneForm.platformFeeLabel}
                        onChange={(event) =>
                          setZoneForm((current) => ({
                            ...current,
                            platformFeeLabel: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Note shown to customer (optional)</Label>
                      <Textarea
                        value={zoneForm.platformFeeNote}
                        rows={2}
                        onChange={(event) =>
                          setZoneForm((current) => ({
                            ...current,
                            platformFeeNote: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="space-y-3 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Override urgent delivery for this zone</Label>
                    <p className="text-xs text-muted-foreground">
                      When off, this zone uses the global urgent delivery (Settings).
                      Turn on to set a different fee just for this area.
                    </p>
                  </div>
                  <Switch
                    checked={zoneForm.urgentDeliveryOverride}
                    onCheckedChange={(checked) =>
                      setZoneForm((current) => ({
                        ...current,
                        urgentDeliveryOverride: checked,
                      }))
                    }
                  />
                </div>
                {zoneForm.urgentDeliveryOverride ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex items-center justify-between rounded-md border p-3 sm:col-span-2">
                      <Label>Enable urgent delivery in this zone</Label>
                      <Switch
                        checked={zoneForm.urgentDeliveryEnabled}
                        onCheckedChange={(checked) =>
                          setZoneForm((current) => ({
                            ...current,
                            urgentDeliveryEnabled: checked,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Amount (৳)</Label>
                      <Input
                        value={zoneForm.urgentDeliveryAmountTaka}
                        onChange={(event) =>
                          setZoneForm((current) => ({
                            ...current,
                            urgentDeliveryAmountTaka: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Label shown to customer</Label>
                      <Input
                        value={zoneForm.urgentDeliveryLabel}
                        onChange={(event) =>
                          setZoneForm((current) => ({
                            ...current,
                            urgentDeliveryLabel: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Note shown to customer (optional)</Label>
                      <Textarea
                        value={zoneForm.urgentDeliveryNote}
                        rows={2}
                        onChange={(event) =>
                          setZoneForm((current) => ({
                            ...current,
                            urgentDeliveryNote: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              <Separator />

              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold">Zone dispatch override</h3>
                  <p className="text-xs text-muted-foreground">
                    These rules only affect orders inside this zone and override
                    the global dispatch fallback.
                  </p>
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <Label>Auto assign riders</Label>
                    <p className="text-xs text-muted-foreground">
                      If off, admin assigns riders manually for this zone.
                    </p>
                  </div>
                  <Switch
                    checked={zoneForm.autoAssignEnabled}
                    onCheckedChange={(checked) =>
                      setZoneForm((current) => ({
                        ...current,
                        autoAssignEnabled: checked,
                      }))
                    }
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Dispatch mode</Label>
                    <NativeSelect
                      className="w-full"
                      value={zoneForm.dispatchMode}
                      onChange={(event) =>
                        setZoneForm((current) => ({
                          ...current,
                          dispatchMode: event.target
                            .value as ZoneFormState["dispatchMode"],
                        }))
                      }
                    >
                      <NativeSelectOption value="fleet">
                        Fleet
                      </NativeSelectOption>
                      <NativeSelectOption value="primary_rider">
                        Primary rider first
                      </NativeSelectOption>
                    </NativeSelect>
                  </div>
                  <div className="space-y-2">
                    <Label>Algorithm</Label>
                    <NativeSelect
                      className="w-full"
                      value={zoneForm.algorithm}
                      onChange={(event) =>
                        setZoneForm((current) => ({
                          ...current,
                          algorithm: event.target
                            .value as ZoneFormState["algorithm"],
                        }))
                      }
                    >
                      <NativeSelectOption value="nearest_eligible_balanced">
                        Nearest balanced
                      </NativeSelectOption>
                      <NativeSelectOption value="least_loaded_first">
                        Least loaded first
                      </NativeSelectOption>
                    </NativeSelect>
                  </div>
                  <div className="space-y-2">
                    <Label>Primary rider</Label>
                    <NativeSelect
                      className="w-full"
                      value={zoneForm.primaryRiderId || "none"}
                      disabled={riderOptionsQuery.isLoading}
                      onChange={(event) =>
                        setZoneForm((current) => ({
                          ...current,
                          primaryRiderId:
                            event.target.value === "none"
                              ? ""
                              : event.target.value,
                        }))
                      }
                    >
                      <NativeSelectOption value="none">
                        No fixed rider
                      </NativeSelectOption>
                      {riderOptions.map((rider: AdminRiderAssignmentOption) => (
                        <NativeSelectOption key={rider.id} value={rider.id}>
                          {rider.fullName} - {rider.phone} ({rider.activeOrders} active)
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    <p className="text-xs text-muted-foreground">
                      Use this only when this zone should try one rider before
                      the wider fleet.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Max active orders override</Label>
                    <Input
                      value={zoneForm.maxActiveOrdersPerRiderOverride}
                      onChange={(event) =>
                        setZoneForm((current) => ({
                          ...current,
                          maxActiveOrdersPerRiderOverride: event.target.value,
                        }))
                      }
                      placeholder="Use global if blank"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Stale location cutoff min</Label>
                    <Input
                      value={zoneForm.staleLocationCutoffMinutes}
                      onChange={(event) =>
                        setZoneForm((current) => ({
                          ...current,
                          staleLocationCutoffMinutes: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Retry cooldown min</Label>
                    <Input
                      value={zoneForm.retryCooldownMinutes}
                      onChange={(event) =>
                        setZoneForm((current) => ({
                          ...current,
                          retryCooldownMinutes: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-3 sm:col-span-2">
                    <div>
                      <Label>Fallback to fleet</Label>
                      <p className="text-xs text-muted-foreground">
                        If the primary rider is not eligible, use other riders
                        in this zone.
                      </p>
                    </div>
                    <Switch
                      checked={zoneForm.primaryRiderFallbackEnabled}
                      onCheckedChange={(checked) =>
                        setZoneForm((current) => ({
                          ...current,
                          primaryRiderFallbackEnabled: checked,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Admin note</Label>
                <Textarea
                  value={zoneForm.notes}
                  onChange={(event) =>
                    setZoneForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  placeholder="Internal note for this service zone"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={
                    !zoneForm.districtId ||
                    !zoneForm.name.trim() ||
                    saveZoneMutation.isPending
                  }
                  onClick={() => saveZoneMutation.mutate()}
                >
                  {saveZoneMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Save zone
                </Button>
                {editingZoneId ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditingZoneId("")
                      setZoneForm((current) => ({
                        ...defaultZoneForm,
                        districtId: current.districtId,
                      }))
                    }}
                  >
                    Cancel edit
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog
        open={Boolean(mapZone)}
        onOpenChange={(open) => !open && setMapZone(null)}
      >
        <DialogContent className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
          <DialogHeader className="border-b bg-background px-5 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <DialogTitle>
                  {mapZone?.name ?? "Service zone"} coverage
                </DialogTitle>
                <DialogDescription>Coverage and dispatch boundary preview.</DialogDescription>
              </div>
              {mapZone ? (
                <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium">Preview radius</p>
                    <p className="text-[11px] text-muted-foreground">
                      Saved {mapZone.radiusKm} km
                    </p>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={0.1}
                    value={mapPreviewRadiusKm}
                    onChange={(event) =>
                      setMapPreviewRadiusKm(Number(event.target.value))
                    }
                    className="h-2 w-36 accent-pink-500 md:w-56"
                    aria-label="Coverage preview radius"
                  />
                  <Badge className="rounded-md bg-pink-500 text-white">
                    {mapPreviewRadiusKm.toFixed(1)} km
                  </Badge>
                </div>
              ) : null}
            </div>
          </DialogHeader>
          {mapZone ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1">
                <CoverageMap
                  zone={mapZone}
                  previewRadiusKm={mapPreviewRadiusKm}
                />
              </div>
              <div className="grid gap-3 border-t bg-background p-4 md:grid-cols-4">
                <ServiceMetric
                  icon={Radar}
                  label="Radius"
                  value={`${mapZone.radiusKm} km`}
                />
                <ServiceMetric
                  icon={Truck}
                  label="Base fee"
                  value={formatMoney(mapZone.delivery?.baseFeeTaka)}
                />
                <ServiceMetric
                  icon={CloudRain}
                  label="Rain surcharge"
                  value={`${mapZone.delivery?.rainSurchargeEnabled ? "On" : "Off"} - ${formatMoney(mapZone.delivery?.rainSurchargeTaka)}`}
                />
                <ServiceMetric
                  icon={MapPin}
                  label="Max restaurant"
                  value={`${mapZone.delivery?.maxRestaurantDistanceKm ?? "-"} km`}
                />
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
