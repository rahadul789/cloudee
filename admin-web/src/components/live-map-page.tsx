import * as React from "react"
import L from "leaflet"
import {
  Circle,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet"
import "leaflet/dist/leaflet.css"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  AlertTriangle,
  Ban,
  Bike,
  Building2,
  Clock,
  Crosshair,
  Eye,
  EyeOff,
  ExternalLink,
  Flame,
  ListChecks,
  Loader2,
  LocateOff,
  Navigation,
  PackageCheck,
  PanelLeftOpen,
  Phone,
  RefreshCcw,
  Route,
  Search,
  Send,
  Signal,
  SlidersHorizontal,
  Store,
  Truck,
  WifiOff,
  X,
} from "lucide-react"
import { useNavigate } from "react-router-dom"

import {
  assignAdminOrderRider,
  bulkAssignAdminRiders,
  getAdminServiceAreas,
  getAdminLiveMap,
  getAdminDispatchSettings,
  listAdminRidersAssignmentOptions,
  setAdminRiderActiveTrip,
  updateAdminOrderStatus,
  type AdminDispatchSettings,
  type AdminLiveMapDelivery,
  type AdminLiveMapRestaurant,
  type AdminLiveMapRider,
  type AdminRiderAssignmentOption,
  type AdminServiceZone,
} from "@/lib/admin-api"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import {
  getAdminZoneScope,
  subscribeAdminZoneScope,
} from "@/lib/admin-zone-scope"
import {
  connectAdminSocket,
  joinAdminSocketScope,
  leaveAdminSocketScope,
} from "@/lib/socket-client"
import { useAdminRefreshPolicy } from "@/lib/refresh-policy"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type Coordinate = {
  latitude?: number | null
  longitude?: number | null
}

type ValidCoordinate = {
  latitude: number
  longitude: number
}

type LayerFilter = "all" | "orders" | "riders" | "restaurants" | "issues"

type SelectedMapItem =
  | { type: "delivery"; item: AdminLiveMapDelivery }
  | { type: "rider"; item: AdminLiveMapRider }
  | { type: "restaurant"; item: AdminLiveMapRestaurant }

type LiveMapIssue = {
  id: string
  severity: "critical" | "warning"
  title: string
  description: string
  selected: SelectedMapItem
}

type NearbyRiderCandidate = {
  rider: AdminLiveMapRider
  distanceKm: number
  freshness: ReturnType<typeof riderFreshness>
}

type LiveTripCandidate = {
  id: string
  orderNumber: string
  status: AdminLiveMapDelivery["status"]
  restaurantName: string
  customerName: string
  etaLabel: string | null
  realtimeLabel: string
  trackingLastUpdatedAt: string | null
  isLive: boolean
}

type LiveTripSwitchContext = {
  riderId: string
  activeTrackingOrderId: string
  trips: LiveTripCandidate[]
}

type LiveMapConnectionState = "connecting" | "live" | "offline"

type MapCamera = {
  zoom: number
  bounds: {
    north: number
    south: number
    east: number
    west: number
  } | null
}

const netrokonaCenter: [number, number] = [24.8835, 90.7271]
const LIVE_MAP_SOCKET_REFETCH_THROTTLE_MS = 3_500
const LIVE_MAP_VIEW_PADDING_DEGREES = 0.035

function isValidCoordinate(
  value?: Coordinate | null
): value is ValidCoordinate {
  return (
    typeof value?.latitude === "number" &&
    Number.isFinite(value.latitude) &&
    typeof value.longitude === "number" &&
    Number.isFinite(value.longitude)
  )
}

function getPoint(value?: Coordinate | null): [number, number] | null {
  return isValidCoordinate(value) ? [value.latitude, value.longitude] : null
}

function distanceBetweenKm(
  firstPoint: [number, number] | null,
  secondPoint: [number, number] | null
) {
  if (!firstPoint || !secondPoint) return Number.POSITIVE_INFINITY

  const toRadians = (value: number) => (value * Math.PI) / 180
  const [firstLatitude, firstLongitude] = firstPoint
  const [secondLatitude, secondLongitude] = secondPoint
  const latitudeDelta = toRadians(secondLatitude - firstLatitude)
  const longitudeDelta = toRadians(secondLongitude - firstLongitude)
  const firstLatitudeRadians = toRadians(firstLatitude)
  const secondLatitudeRadians = toRadians(secondLatitude)
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitudeRadians) *
      Math.cos(secondLatitudeRadians) *
      Math.sin(longitudeDelta / 2) ** 2

  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

function midpoint(
  firstPoint: [number, number] | null,
  secondPoint: [number, number] | null
) {
  if (!firstPoint || !secondPoint) return null
  return [
    (firstPoint[0] + secondPoint[0]) / 2,
    (firstPoint[1] + secondPoint[1]) / 2,
  ] as [number, number]
}

function clusterMapPoints<T>(
  items: T[],
  getItemPoint: (item: T) => [number, number] | null,
  cellSize: number
) {
  const clusters = new Map<
    string,
    {
      key: string
      point: [number, number]
      count: number
      items: T[]
    }
  >()

  items.forEach((item) => {
    const point = getItemPoint(item)
    if (!point) return

    const key = `${Math.round(point[0] / cellSize)}:${Math.round(point[1] / cellSize)}`
    const cluster = clusters.get(key)
    if (!cluster) {
      clusters.set(key, {
        key,
        point,
        count: 1,
        items: [item],
      })
      return
    }

    cluster.count += 1
    cluster.items.push(item)
    cluster.point = [
      (cluster.point[0] * (cluster.count - 1) + point[0]) / cluster.count,
      (cluster.point[1] * (cluster.count - 1) + point[1]) / cluster.count,
    ]
  })

  return Array.from(clusters.values())
}

function getSelectedTitle(selected: SelectedMapItem) {
  if (selected.type === "delivery") return selected.item.orderNumber
  if (selected.type === "rider") return selected.item.fullName
  return selected.item.name
}

const markerSvgs = {
  rider: `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17l4-8h4l4 8"/><path d="M10 9h4"/><path d="M13 6h3"/></svg>`,
  restaurant: `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10h18"/><path d="M5 10l2-6h10l2 6"/><path d="M5 10v10h14V10"/><path d="M9 20v-5h6v5"/></svg>`,
  customer: `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>`,
}

function markerIcon(params: {
  icon: keyof typeof markerSvgs
  background: string
  color?: string
  border?: string
  size?: number
  active?: boolean
  warning?: "warning" | "critical"
  count?: number
}) {
  const size = params.size ?? 34
  const warningColor = params.warning === "critical" ? "#e11d48" : "#f59e0b"
  const countLabel =
    typeof params.count === "number" && params.count > 0
      ? params.count > 99
        ? "99+"
        : String(params.count)
      : ""
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    html: `<div style="
      width:${size}px;
      height:${size}px;
      display:flex;
      align-items:center;
      justify-content:center;
      position:relative;
      border-radius:999px;
      background:${params.background};
      color:${params.color ?? "#ffffff"};
      border:3px solid ${params.border ?? "#ffffff"};
      box-shadow:0 14px 30px rgba(15,23,42,.28);
      font:800 12px/1 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      letter-spacing:.04em;
    ">
      ${markerSvgs[params.icon]}
      ${
        params.active
          ? `<span style="
              position:absolute;
              right:-1px;
              bottom:-1px;
              width:11px;
              height:11px;
              border-radius:999px;
              background:#22c55e;
              border:2px solid #ffffff;
              box-shadow:0 0 0 3px rgba(34,197,94,.18);
            "></span>`
          : ""
      }
      ${
        countLabel
          ? `<span style="
              position:absolute;
              right:-7px;
              top:-7px;
              min-width:18px;
              height:18px;
              padding:0 5px;
              display:flex;
              align-items:center;
              justify-content:center;
              border-radius:999px;
              background:#0f172a;
              color:#ffffff;
              border:2px solid #ffffff;
              box-shadow:0 8px 18px rgba(15,23,42,.28);
              font:900 10px/1 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            ">${countLabel}</span>`
          : ""
      }
      ${
        params.warning
          ? `<span style="
              position:absolute;
              left:-5px;
              top:-4px;
              width:16px;
              height:16px;
              display:flex;
              align-items:center;
              justify-content:center;
              border-radius:999px;
              background:${warningColor};
              color:#ffffff;
              border:2px solid #ffffff;
              box-shadow:0 0 0 3px ${
                params.warning === "critical"
                  ? "rgba(225,29,72,.18)"
                  : "rgba(245,158,11,.20)"
              };
              font:900 10px/1 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            ">!</span>`
          : ""
      }
    </div>`,
  })
}

const idleRiderIcon = markerIcon({
  icon: "rider",
  background: "#111827",
  size: 34,
})
const activeRiderIcon = markerIcon({
  icon: "rider",
  background: "#0ea5e9",
  size: 38,
  active: true,
})
const staleRiderIcon = markerIcon({
  icon: "rider",
  background: "#f59e0b",
  size: 36,
})
const restaurantIcon = markerIcon({
  icon: "restaurant",
  background: "#ffffff",
  color: "#111827",
  border: "#111827",
  size: 34,
})
const onlineRestaurantIcon = markerIcon({
  icon: "restaurant",
  background: "#22c55e",
  size: 36,
  active: true,
})
const customerIcon = markerIcon({
  icon: "customer",
  background: "#10b981",
  size: 34,
})
const onlineRestaurantWarningIcon = markerIcon({
  icon: "restaurant",
  background: "#22c55e",
  size: 36,
  active: true,
  warning: "warning",
})
const onlineRestaurantCriticalIcon = markerIcon({
  icon: "restaurant",
  background: "#22c55e",
  size: 36,
  active: true,
  warning: "critical",
})
const quietRestaurantWarningIcon = markerIcon({
  icon: "restaurant",
  background: "#ffffff",
  color: "#111827",
  border: "#111827",
  size: 34,
  warning: "warning",
})
const quietRestaurantCriticalIcon = markerIcon({
  icon: "restaurant",
  background: "#ffffff",
  color: "#111827",
  border: "#111827",
  size: 34,
  warning: "critical",
})

function clusterIcon(count: number) {
  return L.divIcon({
    className: "",
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    html: `<div style="
      width:42px;
      height:42px;
      display:flex;
      align-items:center;
      justify-content:center;
      border-radius:999px;
      background:#0f172a;
      color:#ffffff;
      border:3px solid #ffffff;
      box-shadow:0 18px 42px rgba(15,23,42,.32);
      font:900 13px/1 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    ">${count}</div>`,
  })
}

function labelIcon(label: string, tone: "pickup" | "dropoff" | "context") {
  const palette = {
    pickup: { background: "#fdf2f8", color: "#be185d", border: "#f9a8d4" },
    dropoff: { background: "#eff6ff", color: "#0369a1", border: "#93c5fd" },
    context: { background: "#f8fafc", color: "#475569", border: "#cbd5e1" },
  }[tone]

  return L.divIcon({
    className: "",
    iconSize: [120, 26],
    iconAnchor: [60, 13],
    html: `<div style="
      display:inline-flex;
      min-width:92px;
      max-width:120px;
      height:26px;
      align-items:center;
      justify-content:center;
      border-radius:999px;
      background:${palette.background};
      color:${palette.color};
      border:1px solid ${palette.border};
      box-shadow:0 10px 26px rgba(15,23,42,.16);
      font:800 11px/1 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      white-space:nowrap;
      padding:0 10px;
    ">${label}</div>`,
  })
}

function MapViewportSync({
  points,
  triggerKey,
}: {
  points: Array<[number, number]>
  triggerKey: string
}) {
  const map = useMap()
  const pointsRef = React.useRef(points)

  React.useEffect(() => {
    pointsRef.current = points
  }, [points])

  React.useEffect(() => {
    const nextPoints = pointsRef.current

    if (!nextPoints.length) {
      map.setView(netrokonaCenter, 12)
      return
    }

    if (nextPoints.length === 1) {
      map.setView(nextPoints[0], 15, { animate: true })
      return
    }

    map.fitBounds(nextPoints, { padding: [54, 54], maxZoom: 15 })
  }, [map, triggerKey])

  return null
}

function MapResizeObserver() {
  const map = useMap()

  React.useEffect(() => {
    const container = map.getContainer()
    const parent = container.parentElement
    let frameId = 0

    const invalidate = () => {
      window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(() => {
        map.invalidateSize({ animate: false, pan: false })
      })
    }

    const observer = new ResizeObserver(invalidate)
    observer.observe(container)
    if (parent) observer.observe(parent)

    const timers = [
      window.setTimeout(invalidate, 80),
      window.setTimeout(invalidate, 260),
      window.setTimeout(invalidate, 520),
    ]
    window.addEventListener("resize", invalidate)

    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(frameId)
      timers.forEach((timer) => window.clearTimeout(timer))
      window.removeEventListener("resize", invalidate)
    }
  }, [map])

  return null
}

function getMapCamera(map: L.Map): MapCamera {
  const bounds = map.getBounds()
  return {
    zoom: map.getZoom(),
    bounds: {
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest(),
    },
  }
}

function MapCameraTracker({
  onChange,
}: {
  onChange: (camera: MapCamera) => void
}) {
  const map = useMapEvents({
    moveend: (event) => onChange(getMapCamera(event.target as L.Map)),
    zoomend: (event) => onChange(getMapCamera(event.target as L.Map)),
  })

  React.useEffect(() => {
    onChange(getMapCamera(map))
  }, [map, onChange])

  return null
}

function isPointInsideBounds(
  point: [number, number] | null,
  camera: MapCamera
) {
  if (!point || !camera.bounds) return true

  const [latitude, longitude] = point
  return (
    latitude >= camera.bounds.south - LIVE_MAP_VIEW_PADDING_DEGREES &&
    latitude <= camera.bounds.north + LIVE_MAP_VIEW_PADDING_DEGREES &&
    longitude >= camera.bounds.west - LIVE_MAP_VIEW_PADDING_DEGREES &&
    longitude <= camera.bounds.east + LIVE_MAP_VIEW_PADDING_DEGREES
  )
}

function formatDateTime(value?: string | null) {
  if (!value) return "Not available"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Not available"
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

function formatCurrency(value?: number | null) {
  if (!Number.isFinite(value ?? Number.NaN)) return "Tk 0"
  return `Tk ${Math.round(value ?? 0).toLocaleString("en-BD")}`
}

function formatDistance(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "Distance unavailable"
  return `${value.toFixed(value >= 10 ? 0 : 1)} km`
}

function formatMinutes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "ETA unavailable"
  return `${Math.round(value)} min`
}

function formatElapsedMinutes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "Just now"
  const minutes = Math.round(value)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`
}

function matchesSearch(value: string, search: string) {
  return value.toLowerCase().includes(search.toLowerCase().trim())
}

function deliverySearchText(delivery: AdminLiveMapDelivery) {
  return [
    delivery.orderNumber,
    delivery.status,
    delivery.restaurant.name,
    delivery.restaurant.phone,
    delivery.customer.name,
    delivery.customer.phone,
    delivery.rider?.fullName,
    delivery.rider?.phone,
  ]
    .filter(Boolean)
    .join(" ")
}

function riderSearchText(rider: AdminLiveMapRider) {
  return [
    rider.fullName,
    rider.phone,
    rider.liveOrderNumber,
    ...(rider.activeOrderNumbers ?? []),
    rider.status,
  ]
    .filter(Boolean)
    .join(" ")
}

function restaurantSearchText(restaurant: AdminLiveMapRestaurant) {
  return [
    restaurant.name,
    restaurant.phone,
    restaurant.city,
    restaurant.address,
    restaurant.latestOrder?.orderNumber,
  ]
    .filter(Boolean)
    .join(" ")
}

function riderFreshness(rider: AdminLiveMapRider): "live" | "stale" {
  const updatedAt = rider.currentLocation?.lastUpdatedAt
  if (!updatedAt) return "stale"
  const ageMs = Date.now() - new Date(updatedAt).getTime()
  if (!Number.isFinite(ageMs)) return "stale"
  return ageMs <= 2 * 60_000 ? "live" : "stale"
}

function getDeliveryPoints(delivery: AdminLiveMapDelivery) {
  return [
    getPoint(delivery.rider?.location),
    getPoint(delivery.restaurant),
    getPoint(delivery.customer.deliveryAddress),
  ].filter(Boolean) as Array<[number, number]>
}

function getDeliveryTargetPoint(delivery: AdminLiveMapDelivery) {
  return delivery.status === "PickedUp"
    ? getPoint(delivery.customer.deliveryAddress)
    : getPoint(delivery.restaurant)
}

function getDeliveryOriginPoint(delivery: AdminLiveMapDelivery) {
  return getPoint(delivery.rider?.location)
}

function getDeliveryTargetLabel(delivery: AdminLiveMapDelivery) {
  return delivery.status === "PickedUp"
    ? "Customer dropoff"
    : "Restaurant pickup"
}

function getDeliveryMapState(delivery: AdminLiveMapDelivery) {
  if (!delivery.rider) return "Unassigned"
  if (delivery.status === "PickedUp") return "Delivering to customer"
  return "Going to restaurant"
}

function getActiveRoutePoints(delivery: AdminLiveMapDelivery) {
  const riderPoint = getPoint(delivery.rider?.location)
  const targetPoint = getDeliveryTargetPoint(delivery)
  return [riderPoint, targetPoint].filter(Boolean) as Array<[number, number]>
}

function getContextRoutePoints(delivery: AdminLiveMapDelivery) {
  return [
    getPoint(delivery.restaurant),
    getPoint(delivery.customer.deliveryAddress),
  ].filter(Boolean) as Array<[number, number]>
}

function getGoogleMapsDirectionsUrl(
  destination: [number, number] | null,
  origin?: [number, number] | null
) {
  if (!destination) return ""
  const destinationQuery = `${destination[0]},${destination[1]}`
  const url = new URL("https://www.google.com/maps/dir/")
  url.searchParams.set("api", "1")
  url.searchParams.set("destination", destinationQuery)
  if (origin) {
    url.searchParams.set("origin", `${origin[0]},${origin[1]}`)
  }
  url.searchParams.set("travelmode", "driving")
  return url.toString()
}

function openDirections(
  destination: [number, number] | null,
  origin?: [number, number] | null
) {
  const url = getGoogleMapsDirectionsUrl(destination, origin)
  if (!url) {
    toast.info("Location is not available for directions.")
    return
  }
  window.open(url, "_blank", "noopener,noreferrer")
}

function getGoogleMapsMarkerUrl(point: [number, number] | null) {
  if (!point) return ""
  const url = new URL("https://www.google.com/maps/search/")
  url.searchParams.set("api", "1")
  url.searchParams.set("query", `${point[0]},${point[1]}`)
  return url.toString()
}

function openMapMarker(point: [number, number] | null, label = "Location") {
  const url = getGoogleMapsMarkerUrl(point)
  if (!url) {
    toast.info(`${label} is not available on the map.`)
    return
  }
  window.open(url, "_blank", "noopener,noreferrer")
}

function getNearbyRiders(
  riders: AdminLiveMapRider[],
  targetPoint: [number, number] | null,
  limit = 3
): NearbyRiderCandidate[] {
  if (!targetPoint) return []

  return riders
    .map((rider) => ({
      rider,
      distanceKm: distanceBetweenKm(
        getPoint(rider.currentLocation),
        targetPoint
      ),
      freshness: riderFreshness(rider),
    }))
    .filter((candidate) => {
      if (!Number.isFinite(candidate.distanceKm)) return false
      if (candidate.rider.status !== "active") return false
      return (
        candidate.rider.isAvailableForAssignments ||
        (candidate.rider.activeOrderCount ?? 0) > 0
      )
    })
    .sort((left, right) => {
      if (left.freshness !== right.freshness)
        return left.freshness === "live" ? -1 : 1
      if (
        (left.rider.activeOrderCount ?? 0) !==
          (right.rider.activeOrderCount ?? 0)
      ) {
        return (left.rider.activeOrderCount ?? 0) > 0 ? 1 : -1
      }
      return left.distanceKm - right.distanceKm
    })
    .slice(0, limit)
}

function getLiveTripContextForSelection(
  selected: SelectedMapItem | null,
  deliveries: AdminLiveMapDelivery[]
): LiveTripSwitchContext {
  if (!selected) {
    return { riderId: "", activeTrackingOrderId: "", trips: [] }
  }

  const riderId =
    selected.type === "rider"
      ? selected.item.id
      : selected.type === "delivery"
        ? (selected.item.rider?.id ?? "")
        : ""

  if (!riderId) {
    return { riderId: "", activeTrackingOrderId: "", trips: [] }
  }

  const activeTrackingOrderId =
    selected.type === "rider"
      ? selected.item.activeTrackingOrderId || selected.item.liveOrderId || ""
      : selected.type === "delivery"
        ? (selected.item.rider?.activeTrackingOrderId ?? "")
        : ""

  const trips = deliveries
    .filter(
      (delivery) =>
        delivery.status === "PickedUp" && delivery.rider?.id === riderId
    )
    .sort((left, right) => {
      if (left.id === activeTrackingOrderId) return -1
      if (right.id === activeTrackingOrderId) return 1
      return getDeliveryPriorityScore(right) - getDeliveryPriorityScore(left)
    })
    .map((delivery) => ({
      id: delivery.id,
      orderNumber: delivery.orderNumber,
      status: delivery.status,
      restaurantName: delivery.restaurant.name,
      customerName: delivery.customer.name,
      etaLabel: getDeliveryEtaLabel(delivery),
      realtimeLabel: getDeliveryRealtimeLabel(delivery),
      trackingLastUpdatedAt: delivery.tracking.lastUpdatedAt,
      isLive: delivery.id === activeTrackingOrderId,
    }))

  return { riderId, activeTrackingOrderId, trips }
}

function getLiveTripSummary(context: LiveTripSwitchContext) {
  if (!context.riderId) return "No rider selected"
  if (context.trips.length === 0) return "No picked-up trip"
  const liveTrip = context.trips.find((trip) => trip.isLive)
  if (liveTrip) return `${liveTrip.orderNumber} live now`
  return "No live trip selected"
}

function getDeliveryPriorityScore(delivery: AdminLiveMapDelivery) {
  let score =
    delivery.status === "ReadyForPickup"
      ? delivery.readyWaitMinutes
      : delivery.pickedUpMinutes
  if (delivery.status === "ReadyForPickup" && !delivery.rider) score += 120
  if (delivery.delaySeverity === "critical") score += 90
  if (delivery.delaySeverity === "warning") score += 45
  if (delivery.status === "PickedUp" && !delivery.isTrackingActive) score += 35
  if (delivery.isNearCustomer) score += 15
  return score
}

function getDeliveryQueueReason(delivery: AdminLiveMapDelivery) {
  if (delivery.status === "ReadyForPickup" && !delivery.rider)
    return "Needs rider"
  if (delivery.delaySeverity !== "none")
    return delivery.delayReason || "Delayed"
  if (delivery.status === "PickedUp" && !delivery.isTrackingActive)
    return "Tracking inactive"
  if (delivery.isNearCustomer) return "Near customer"
  if (delivery.status === "ReadyForPickup") return "Waiting pickup"
  if (delivery.status === "PickedUp") return "On trip"
  if (delivery.status === "Preparing") return "Preparing"
  if (delivery.status === "Accepted") return "Accepted"
  return "New order"
}

function getDeliveryStatusLabel(status: AdminLiveMapDelivery["status"]) {
  if (status === "ReadyForPickup") return "Ready"
  if (status === "PickedUp") return "Picked up"
  return status
}

function getDeliveryStatusBadgeClass(status: AdminLiveMapDelivery["status"]) {
  if (status === "New") return "border-violet-200 bg-violet-50 text-violet-700"
  if (status === "Accepted") return "border-sky-200 bg-sky-50 text-sky-700"
  if (status === "Preparing")
    return "border-amber-200 bg-amber-50 text-amber-700"
  if (status === "ReadyForPickup")
    return "border-pink-200 bg-pink-50 text-pink-700"
  return "border-blue-200 bg-blue-50 text-blue-700"
}

const liveOrderDrawerStatuses: AdminLiveMapDelivery["status"][] = [
  "New",
  "Accepted",
  "Preparing",
  "ReadyForPickup",
  "PickedUp",
]

function isLiveOrderDrawerDelivery(delivery: AdminLiveMapDelivery) {
  return liveOrderDrawerStatuses.includes(delivery.status)
}

function isScopedZoneVisible(
  zone: AdminServiceZone,
  scope: ReturnType<typeof getAdminZoneScope>
) {
  if (zone.status === "archived") return false
  if (scope.type === "zone") return zone.id === scope.id
  if (scope.type === "district") return zone.districtId === scope.id
  return true
}

function isRouteActionDelivery(delivery: AdminLiveMapDelivery) {
  return delivery.status === "ReadyForPickup" || delivery.status === "PickedUp"
}

function getPaymentMethodLabel(method: string) {
  return method.toLowerCase() === "bkash" ? "bKash" : "COD"
}

function getPaymentMethodBadgeClass(method: string) {
  return method.toLowerCase() === "bkash"
    ? "border-pink-200 bg-pink-50 text-pink-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700"
}

function getDeliveryReasonBadgeClass(delivery: AdminLiveMapDelivery) {
  if (delivery.delaySeverity === "critical") return "bg-rose-600 text-white"
  if (delivery.delaySeverity === "warning") return "bg-amber-500 text-white"
  if (delivery.status === "ReadyForPickup" && !delivery.rider)
    return "bg-orange-500 text-white"
  if (delivery.status === "PickedUp" && !delivery.isTrackingActive)
    return "bg-rose-500 text-white"
  if (delivery.isNearCustomer) return "bg-violet-500 text-white"
  if (delivery.status === "ReadyForPickup") return "bg-pink-500 text-white"
  if (delivery.status === "PickedUp") return "bg-blue-500 text-white"
  if (delivery.status === "Preparing") return "bg-amber-500 text-white"
  return "bg-slate-950 text-white"
}

function shouldShowDeliveryReasonBadge(delivery: AdminLiveMapDelivery) {
  return (
    delivery.isDelayed ||
    delivery.delaySeverity !== "none" ||
    (delivery.status === "ReadyForPickup" && !delivery.rider) ||
    (delivery.status === "PickedUp" && !delivery.isTrackingActive) ||
    delivery.isNearCustomer
  )
}

function getDeliveryRealtimeLabel(delivery: AdminLiveMapDelivery) {
  if (delivery.status === "PickedUp") {
    if (delivery.pickedUpAt) {
      const onRoad =
        delivery.pickedUpMinutes > 0
          ? ` - ${formatElapsedMinutes(delivery.pickedUpMinutes)} on road`
          : ""
      return `Picked up ${formatDateTime(delivery.pickedUpAt)}${onRoad}`
    }
    return delivery.pickedUpMinutes > 0
      ? `On road ${formatElapsedMinutes(delivery.pickedUpMinutes)}`
      : "Pickup time unavailable"
  }

  if (delivery.status === "ReadyForPickup") {
    if (delivery.readyAt) {
      const waiting =
        delivery.readyWaitMinutes > 0
          ? ` - waiting ${formatElapsedMinutes(delivery.readyWaitMinutes)}`
          : ""
      return `Ready ${formatDateTime(delivery.readyAt)}${waiting}`
    }
    return delivery.readyWaitMinutes > 0
      ? `Waiting pickup ${formatElapsedMinutes(delivery.readyWaitMinutes)}`
      : "Ready time unavailable"
  }

  if (delivery.createdAt) return `Placed ${formatDateTime(delivery.createdAt)}`
  return "Order time unavailable"
}

function getDeliveryEtaLabel(delivery: AdminLiveMapDelivery) {
  if (delivery.status !== "PickedUp") return null
  if (delivery.tracking.remainingDurationMinutes > 0) {
    return `${formatMinutes(delivery.tracking.remainingDurationMinutes)} ETA`
  }
  if (delivery.tracking.remainingDistanceKm > 0) {
    return `${formatDistance(delivery.tracking.remainingDistanceKm)} left`
  }
  return "ETA unavailable"
}

function getRestaurantMarkerIcon(
  restaurant: AdminLiveMapRestaurant,
  isSelected: boolean,
  delaySeverity: "none" | "warning" | "critical" = "none"
) {
  const hasCriticalDelay = delaySeverity === "critical"
  const hasWarningDelay = delaySeverity === "warning"
  const warning = hasCriticalDelay
    ? "critical"
    : hasWarningDelay
      ? "warning"
      : undefined

  if (restaurant.activeOrders > 0 || isSelected) {
    return markerIcon({
      icon: "restaurant",
      background: "#fb3f8a",
      size: isSelected ? 42 : 38,
      active: true,
      warning,
      count: restaurant.activeOrders,
    })
  }
  if (restaurant.isOnline) {
    if (hasCriticalDelay) return onlineRestaurantCriticalIcon
    if (hasWarningDelay) return onlineRestaurantWarningIcon
    return onlineRestaurantIcon
  }
  if (hasCriticalDelay) return quietRestaurantCriticalIcon
  if (hasWarningDelay) return quietRestaurantWarningIcon
  return restaurantIcon
}

function getRiderMarkerIcon(rider: AdminLiveMapRider, isSelected: boolean) {
  const activeOrderCount =
    rider.activeOrderCount ?? (rider.liveOrderId ? 1 : 0)
  if (isSelected || activeOrderCount > 0) {
    return markerIcon({
      icon: "rider",
      background: "#fb3f8a",
      size: isSelected ? 40 : 38,
      active: true,
      count: activeOrderCount,
    })
  }
  if (riderFreshness(rider) === "stale") return staleRiderIcon
  if (rider.isAvailableForAssignments) return activeRiderIcon
  return idleRiderIcon
}

function isPriorityDelivery(delivery: AdminLiveMapDelivery) {
  return (
    delivery.isDelayed ||
    delivery.delaySeverity !== "none" ||
    (delivery.status === "ReadyForPickup" && !delivery.rider) ||
    (delivery.status === "PickedUp" && !delivery.isTrackingActive) ||
    delivery.isNearCustomer
  )
}

function isPriorityRider(rider: AdminLiveMapRider) {
  return riderFreshness(rider) === "stale" || (rider.activeOrderCount ?? 0) > 0
}

function isPriorityRestaurant(restaurant: AdminLiveMapRestaurant) {
  return restaurant.delayedOrders > 0 || restaurant.readyForPickup > 0
}

function getSelectedPoints(selected: SelectedMapItem | null) {
  if (!selected) return []
  if (selected.type === "delivery") return getDeliveryPoints(selected.item)
  if (selected.type === "rider") {
    const point = getPoint(selected.item.currentLocation)
    return point ? [point] : []
  }
  const point = getPoint(selected.item)
  return point ? [point] : []
}

function selectedKey(selected: SelectedMapItem | null) {
  if (!selected) return "none"
  return `${selected.type}:${selected.item.id}`
}

function callPhone(phone?: string) {
  const normalizedPhone = phone?.trim()
  if (!normalizedPhone) {
    toast.info("No phone number is available for this item.")
    return
  }
  window.location.href = `tel:${normalizedPhone}`
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  tone: string
}) {
  return (
    <Badge
      variant="outline"
      className="inline-flex items-center gap-1.5 rounded-full border-white/70 bg-white/94 px-2.5 py-1.5 shadow-[0_12px_32px_rgba(15,23,42,.12)] backdrop-blur"
    >
      <span
        className={cn(
          "flex size-5 items-center justify-center rounded-full",
          tone
        )}
      >
        <Icon className="size-2.5" />
      </span>
      <span className="text-[11px] font-semibold text-slate-500">{label}</span>
      <span className="text-xs font-black text-slate-950">{value}</span>
    </Badge>
  )
}

function getDispatchAlgorithmLabel(settings?: AdminDispatchSettings | null) {
  if (!settings) return "Loading rule"
  if (!settings.autoAssignmentEnabled) return "Manual mode"
  if (settings.dispatchMode === "primary_rider") return "Primary rider"
  if (settings.algorithm === "least_loaded_first") return "Least loaded"
  return "Nearest balanced"
}

function getDispatchAlgorithmDetail(settings?: AdminDispatchSettings | null) {
  if (!settings) return "Fetching dispatch policy"
  if (!settings.autoAssignmentEnabled) return "Admins assign riders manually"
  if (settings.dispatchMode === "primary_rider") {
    return settings.metrics.primaryRiderName
      ? `Primary: ${settings.metrics.primaryRiderName}`
      : "Primary rider mode"
  }
  if (settings.algorithm === "least_loaded_first") {
    return "Prioritizes rider capacity"
  }
  return "Balances distance and load"
}

export function LiveMapPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { policy } = useAdminRefreshPolicy()
  const [adminZoneScope, setAdminZoneScope] = React.useState(() =>
    getAdminZoneScope()
  )
  const [search, setSearch] = React.useState("")
  const debouncedSearch = useDebouncedValue(search, 180)
  const [layer, setLayer] = React.useState<LayerFilter>("all")
  const [selected, setSelected] = React.useState<SelectedMapItem | null>(null)
  const [showQuietRestaurants, setShowQuietRestaurants] = React.useState(true)
  const [opsDrawerOpen, setOpsDrawerOpen] = React.useState(false)
  const [liveOrdersDrawerOpen, setLiveOrdersDrawerOpen] = React.useState(false)
  const [priorityMode, setPriorityMode] = React.useState(false)
  const [connectionState, setConnectionState] =
    React.useState<LiveMapConnectionState>("connecting")
  const [focusedSelectedKey, setFocusedSelectedKey] = React.useState<
    string | null
  >(null)
  const [fitVersion, setFitVersion] = React.useState(0)
  const [camera, setCamera] = React.useState<MapCamera>({
    zoom: 12,
    bounds: null,
  })
  const [assignmentDrafts, setAssignmentDrafts] = React.useState<
    Record<string, string>
  >({})
  const liveMapRefreshTimerRef = React.useRef<ReturnType<
    typeof window.setTimeout
  > | null>(null)
  const lastLiveMapRefreshAtRef = React.useRef(0)
  const pendingHiddenRefreshRef = React.useRef(false)
  const didInitialFitRef = React.useRef(false)
  const hasActiveSearch = debouncedSearch.trim().length > 0
  const isDetailedZoom = camera.zoom >= 13
  const adminScopeKey = `${adminZoneScope.type}:${adminZoneScope.id || "all"}`
  const [coveragePreviewRadiusKm, setCoveragePreviewRadiusKm] = React.useState(3)

  React.useEffect(
    () =>
      subscribeAdminZoneScope(() => {
        setAdminZoneScope(getAdminZoneScope())
        setSelected(null)
        setFocusedSelectedKey(null)
        didInitialFitRef.current = false
      }),
    []
  )

  const handleCameraChange = React.useCallback((nextCamera: MapCamera) => {
    setCamera((currentCamera) => {
      const currentBounds = currentCamera.bounds
      const nextBounds = nextCamera.bounds
      const isSame =
        currentCamera.zoom === nextCamera.zoom &&
        currentBounds?.north === nextBounds?.north &&
        currentBounds?.south === nextBounds?.south &&
        currentBounds?.east === nextBounds?.east &&
        currentBounds?.west === nextBounds?.west

      return isSame ? currentCamera : nextCamera
    })
  }, [])

  const requestLiveMapRefresh = React.useCallback(() => {
    if (document.visibilityState !== "visible") {
      pendingHiddenRefreshRef.current = true
      return
    }

    const refreshNow = () => {
      pendingHiddenRefreshRef.current = false
      lastLiveMapRefreshAtRef.current = Date.now()
      void queryClient.invalidateQueries({ queryKey: ["admin-live-map"] })
    }

    const elapsedMs = Date.now() - lastLiveMapRefreshAtRef.current
    if (elapsedMs >= LIVE_MAP_SOCKET_REFETCH_THROTTLE_MS) {
      if (liveMapRefreshTimerRef.current) {
        window.clearTimeout(liveMapRefreshTimerRef.current)
        liveMapRefreshTimerRef.current = null
      }
      refreshNow()
      return
    }

    if (liveMapRefreshTimerRef.current) return
    liveMapRefreshTimerRef.current = window.setTimeout(() => {
      liveMapRefreshTimerRef.current = null
      refreshNow()
    }, LIVE_MAP_SOCKET_REFETCH_THROTTLE_MS - elapsedMs)
  }, [queryClient])

  const liveMapQuery = useQuery({
    queryKey: ["admin-live-map", adminScopeKey],
    queryFn: getAdminLiveMap,
    refetchInterval: policy.liveMapMs || false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 3_000,
  })
  const serviceAreasQuery = useQuery({
    queryKey: ["admin-service-areas", "live-map", adminScopeKey],
    queryFn: getAdminServiceAreas,
    staleTime: 60_000,
  })
  const riderAssignmentOptionsQuery = useQuery({
    queryKey: ["admin-rider-assignment-options", adminScopeKey],
    queryFn: listAdminRidersAssignmentOptions,
    staleTime: 30_000,
  })
  const dispatchSettingsQuery = useQuery({
    queryKey: ["admin-dispatch-settings", adminScopeKey],
    queryFn: getAdminDispatchSettings,
    staleTime: 30_000,
  })
  const autoAssignMutation = useMutation({
    mutationFn: (orderId: string) =>
      bulkAssignAdminRiders({ orderIds: [orderId] }),
    onSuccess: (result) => {
      toast.success(
        result.assigned > 0
          ? "Rider assigned from live map."
          : "No eligible rider found right now."
      )
      void queryClient.invalidateQueries({ queryKey: ["admin-live-map"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-orders"] })
      void queryClient.invalidateQueries({
        queryKey: ["admin-rider-candidates"],
      })
      void queryClient.invalidateQueries({ queryKey: ["admin-dispatch-logs"] })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Auto dispatch failed."
      )
    },
  })
  const assignRiderMutation = useMutation({
    mutationFn: assignAdminOrderRider,
    onSuccess: (_result, variables) => {
      toast.success("Rider assigned from live map.")
      setAssignmentDrafts((current) => {
        const next = { ...current }
        delete next[variables.orderId]
        return next
      })
      void queryClient.invalidateQueries({ queryKey: ["admin-live-map"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-orders"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-orders-monitor"] })
      void queryClient.invalidateQueries({
        queryKey: ["admin-rider-assignment-options"],
      })
      void queryClient.invalidateQueries({ queryKey: ["admin-dispatch-logs"] })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Rider assignment failed."
      )
    },
  })
  const statusMutation = useMutation({
    mutationFn: (params: {
      orderId: string
      expectedStatus: AdminLiveMapDelivery["status"]
      nextStatus: "Cancelled"
    }) =>
      updateAdminOrderStatus({
        orderId: params.orderId,
        expectedStatus: params.expectedStatus,
        nextStatus: params.nextStatus,
        note: "Cancelled from live operations map.",
      }),
    onSuccess: () => {
      toast.success("Order status updated from live map.")
      void queryClient.invalidateQueries({ queryKey: ["admin-live-map"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-orders"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-notifications"] })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Order status update failed."
      )
    },
  })
  const activeTripMutation = useMutation({
    mutationFn: setAdminRiderActiveTrip,
    onSuccess: () => {
      toast.success("Live trip switched. Customer map will update.")
      void queryClient.invalidateQueries({ queryKey: ["admin-live-map"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-orders-monitor"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-orders"] })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not switch live trip."
      )
    },
  })
  const snapshot = liveMapQuery.data
  const visibleServiceZones = React.useMemo(
    () =>
      (serviceAreasQuery.data?.zones ?? []).filter((zone) =>
        isScopedZoneVisible(zone, adminZoneScope)
      ),
    [adminZoneScope, serviceAreasQuery.data?.zones]
  )
  const selectedScopeZone = React.useMemo(
    () =>
      adminZoneScope.type === "zone"
        ? visibleServiceZones.find((zone) => zone.id === adminZoneScope.id) ?? null
        : null,
    [adminZoneScope, visibleServiceZones]
  )
  const firstVisibleZoneRadiusKm = visibleServiceZones[0]?.radiusKm

  React.useEffect(() => {
    const radius = selectedScopeZone?.radiusKm ?? firstVisibleZoneRadiusKm
    if (radius == null) return
    setCoveragePreviewRadiusKm(Math.min(5, Math.max(1, Number(radius))))
  }, [
    adminScopeKey,
    firstVisibleZoneRadiusKm,
    selectedScopeZone?.id,
    selectedScopeZone?.radiusKm,
  ])

  const handleAssignmentDraftChange = React.useCallback(
    (orderId: string, riderId: string) => {
      setAssignmentDrafts((current) => ({ ...current, [orderId]: riderId }))
    },
    []
  )

  const handleManualAssign = React.useCallback(
    (orderId: string, riderId: string) => {
      if (!riderId) {
        toast.error("Select a rider first.")
        return
      }
      assignRiderMutation.mutate({ orderId, riderId })
    },
    [assignRiderMutation]
  )

  React.useEffect(() => {
    const socket = connectAdminSocket()
    joinAdminSocketScope("live-map")
    setConnectionState(socket.connected ? "live" : "connecting")

    const handleConnect = () => {
      setConnectionState("live")
      requestLiveMapRefresh()
    }
    const handleDisconnect = () => setConnectionState("offline")
    const handleConnectError = () => setConnectionState("offline")

    socket.on("connect", handleConnect)
    socket.on("disconnect", handleDisconnect)
    socket.on("connect_error", handleConnectError)
    socket.on("admin.live-map.updated", requestLiveMapRefresh)
    return () => {
      socket.off("connect", handleConnect)
      socket.off("disconnect", handleDisconnect)
      socket.off("connect_error", handleConnectError)
      socket.off("admin.live-map.updated", requestLiveMapRefresh)
      leaveAdminSocketScope("live-map")
    }
  }, [requestLiveMapRefresh])

  React.useEffect(() => {
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        pendingHiddenRefreshRef.current
      ) {
        requestLiveMapRefresh()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [requestLiveMapRefresh])

  React.useEffect(() => {
    return () => {
      if (liveMapRefreshTimerRef.current) {
        window.clearTimeout(liveMapRefreshTimerRef.current)
      }
    }
  }, [])

  React.useEffect(() => {
    if (!selected || !snapshot) return
    if (selected.type === "delivery") {
      const next = snapshot.deliveries.find(
        (item) => item.id === selected.item.id
      )
      if (next && next !== selected.item)
        setSelected({ type: "delivery", item: next })
    }
    if (selected.type === "rider") {
      const next = snapshot.riders.find((item) => item.id === selected.item.id)
      if (next && next !== selected.item)
        setSelected({ type: "rider", item: next })
    }
    if (selected.type === "restaurant") {
      const next = snapshot.restaurants.find(
        (item) => item.id === selected.item.id
      )
      if (next && next !== selected.item)
        setSelected({ type: "restaurant", item: next })
    }
  }, [selected, snapshot])

  const deliveries = React.useMemo(() => {
    const items = snapshot?.deliveries ?? []
    return items.filter((delivery) => {
      if (!isLiveOrderDrawerDelivery(delivery)) return false
      if (
        debouncedSearch &&
        !matchesSearch(deliverySearchText(delivery), debouncedSearch)
      )
        return false
      if (priorityMode && !isPriorityDelivery(delivery)) return false
      if (layer === "orders" || layer === "all") return true
      if (layer === "issues")
        return delivery.isDelayed || delivery.delaySeverity !== "none"
      return false
    })
  }, [debouncedSearch, layer, priorityMode, snapshot?.deliveries])

  const riders = React.useMemo(() => {
    const items = snapshot?.riders ?? []
    return items.filter((rider) => {
      if (
        debouncedSearch &&
        !matchesSearch(riderSearchText(rider), debouncedSearch)
      )
        return false
      if (priorityMode && !isPriorityRider(rider)) return false
      if (layer === "riders" || layer === "all") return true
      if (layer === "issues") return riderFreshness(rider) === "stale"
      return false
    })
  }, [debouncedSearch, layer, priorityMode, snapshot?.riders])

  const restaurants = React.useMemo(() => {
    const items = snapshot?.restaurants ?? []
    return items.filter((restaurant) => {
      if (
        debouncedSearch &&
        !matchesSearch(restaurantSearchText(restaurant), debouncedSearch)
      )
        return false
      if (priorityMode && !isPriorityRestaurant(restaurant)) return false
      if (
        layer === "all" &&
        !showQuietRestaurants &&
        restaurant.activeOrders === 0
      ) {
        return false
      }
      if (layer === "restaurants" || layer === "all") return true
      if (layer === "issues") return restaurant.delayedOrders > 0
      return false
    })
  }, [
    debouncedSearch,
    layer,
    priorityMode,
    showQuietRestaurants,
    snapshot?.restaurants,
  ])

  const selectedDeliveryId =
    selected?.type === "delivery" ? selected.item.id : null
  const selectedRiderId = selected?.type === "rider" ? selected.item.id : null
  const selectedRestaurantId =
    selected?.type === "restaurant" ? selected.item.id : null

  const visibleDeliveries = React.useMemo(
    () =>
      deliveries.filter((delivery) => {
        if (selectedDeliveryId === delivery.id) return true
        return getDeliveryPoints(delivery).some((point) =>
          isPointInsideBounds(point, camera)
        )
      }),
    [camera, deliveries, selectedDeliveryId]
  )

  const visibleRiders = React.useMemo(
    () =>
      riders.filter((rider) => {
        if (selectedRiderId === rider.id) return true
        if (!isPointInsideBounds(getPoint(rider.currentLocation), camera))
          return false
        if (
          layer === "all" ||
          isDetailedZoom ||
          hasActiveSearch ||
          layer === "riders" ||
          layer === "issues"
        ) {
          return true
        }
        return (rider.activeOrderCount ?? 0) > 0 || riderFreshness(rider) === "stale"
      }),
    [camera, hasActiveSearch, isDetailedZoom, layer, riders, selectedRiderId]
  )

  const visibleRestaurants = React.useMemo(
    () =>
      restaurants.filter((restaurant) => {
        if (selectedRestaurantId === restaurant.id) return true
        if (!isPointInsideBounds(getPoint(restaurant), camera)) return false
        if (
          layer === "all" ||
          isDetailedZoom ||
          hasActiveSearch ||
          showQuietRestaurants ||
          layer === "restaurants" ||
          layer === "issues"
        ) {
          return true
        }
        return restaurant.activeOrders > 0 || restaurant.delayedOrders > 0
      }),
    [
      camera,
      hasActiveSearch,
      isDetailedZoom,
      layer,
      restaurants,
      selectedRestaurantId,
      showQuietRestaurants,
    ]
  )

  const mapPoints = React.useMemo(() => {
    const points: Array<[number, number]> = []
    deliveries.forEach((delivery) => {
      const riderPoint = getPoint(delivery.rider?.location)
      const restaurantPoint = getPoint(delivery.restaurant)
      const customerPoint = getPoint(delivery.customer.deliveryAddress)
      if (riderPoint) points.push(riderPoint)
      if (restaurantPoint) points.push(restaurantPoint)
      if (customerPoint) points.push(customerPoint)
    })
    riders.forEach((rider) => {
      const point = getPoint(rider.currentLocation)
      if (point) points.push(point)
    })
    restaurants.forEach((restaurant) => {
      const point = getPoint(restaurant)
      if (point) points.push(point)
    })
    visibleServiceZones.forEach((zone) => {
      if (
        typeof zone.center?.latitude === "number" &&
        typeof zone.center?.longitude === "number"
      ) {
        points.push([zone.center.latitude, zone.center.longitude])
      }
    })
    return points
  }, [deliveries, restaurants, riders, visibleServiceZones])

  React.useEffect(() => {
    if (didInitialFitRef.current || mapPoints.length === 0) return
    didInitialFitRef.current = true
    setFitVersion((current) => current + 1)
  }, [mapPoints.length])

  const selectedPoints = React.useMemo(
    () => getSelectedPoints(selected),
    [selected]
  )
  const currentSelectedKey = selectedKey(selected)
  const shouldFocusSelected = Boolean(
    selected && focusedSelectedKey === currentSelectedKey
  )
  const viewportPoints =
    shouldFocusSelected && selectedPoints.length ? selectedPoints : mapPoints
  const viewportTriggerKey = `${shouldFocusSelected ? currentSelectedKey : "all"}:${layer}:${debouncedSearch.trim()}:${showQuietRestaurants}:${fitVersion}`

  const summary = snapshot?.summary
  const isInitialLoading = liveMapQuery.isLoading && !snapshot
  const visibleMarkerCount =
    visibleDeliveries.length + visibleRiders.length + visibleRestaurants.length
  const totalFilteredMarkerCount =
    deliveries.length + riders.length + restaurants.length
  const issues = React.useMemo<LiveMapIssue[]>(() => {
    const items: LiveMapIssue[] = []
    const allDeliveries = snapshot?.deliveries ?? []
    const allRiders = snapshot?.riders ?? []
    const allRestaurants = snapshot?.restaurants ?? []

    allDeliveries.filter(isLiveOrderDrawerDelivery).forEach((delivery) => {
      if (delivery.isDelayed || delivery.delaySeverity !== "none") {
        items.push({
          id: `delivery-delay-${delivery.id}`,
          severity:
            delivery.delaySeverity === "critical" ? "critical" : "warning",
          title: `${delivery.orderNumber} needs attention`,
          description:
            delivery.delayReason || `${delivery.status} order is delayed.`,
          selected: { type: "delivery", item: delivery },
        })
      }
      if (delivery.status === "ReadyForPickup" && !delivery.rider) {
        items.push({
          id: `delivery-unassigned-${delivery.id}`,
          severity: "critical",
          title: `${delivery.orderNumber} has no rider`,
          description: `${delivery.restaurant.name} is ready for pickup.`,
          selected: { type: "delivery", item: delivery },
        })
      }
      if (delivery.status === "PickedUp" && !delivery.isTrackingActive) {
        items.push({
          id: `delivery-tracking-${delivery.id}`,
          severity: "warning",
          title: `${delivery.orderNumber} tracking inactive`,
          description: delivery.rider?.fullName
            ? `${delivery.rider.fullName}'s live tracking is not active.`
            : "Rider tracking is not active.",
          selected: { type: "delivery", item: delivery },
        })
      }
    })

    allRiders.forEach((rider) => {
      if (riderFreshness(rider) === "stale" && rider.currentLocation) {
        items.push({
          id: `rider-stale-${rider.id}`,
          severity: (rider.activeOrderCount ?? 0) > 0 ? "critical" : "warning",
          title: `${rider.fullName} location is stale`,
          description: (rider.activeOrderNumbers ?? []).length
            ? `Assigned to ${rider.activeOrderNumbers.join(", ")}.`
            : "No recent location update.",
          selected: { type: "rider", item: rider },
        })
      }
    })

    allRestaurants.forEach((restaurant) => {
      if (restaurant.delayedOrders > 0) {
        items.push({
          id: `restaurant-delay-${restaurant.id}`,
          severity: "warning",
          title: `${restaurant.name} has delayed orders`,
          description: `${restaurant.delayedOrders} delayed out of ${restaurant.activeOrders} live order(s).`,
          selected: { type: "restaurant", item: restaurant },
        })
      }
    })

    return items
      .sort((left, right) => {
        const weight = { critical: 2, warning: 1 }
        return weight[right.severity] - weight[left.severity]
      })
      .slice(0, 10)
  }, [snapshot?.deliveries, snapshot?.restaurants, snapshot?.riders])

  const liveOrderDeliveries = React.useMemo(
    () =>
      [...(snapshot?.deliveries ?? [])]
        .filter(isLiveOrderDrawerDelivery)
        .sort(
          (left, right) =>
            getDeliveryPriorityScore(right) - getDeliveryPriorityScore(left)
        ),
    [snapshot?.deliveries]
  )

  const liveOrderMetrics = React.useMemo(() => {
    const statusCounts = liveOrderDeliveries.reduce(
      (counts, delivery) => {
        counts[delivery.status] += 1
        return counts
      },
      {
        New: 0,
        Accepted: 0,
        Preparing: 0,
        ReadyForPickup: 0,
        PickedUp: 0,
      } satisfies Record<AdminLiveMapDelivery["status"], number>
    )

    return {
      total: liveOrderDeliveries.length,
      routeOrders: liveOrderDeliveries.filter(isRouteActionDelivery).length,
      liveTrips: liveOrderDeliveries.filter(
        (delivery) =>
          delivery.status === "PickedUp" &&
          getActiveRoutePoints(delivery).length >= 2
      ).length,
      totalValue: liveOrderDeliveries.reduce(
        (sum, delivery) => sum + delivery.total,
        0
      ),
      statusCounts,
      delayed: liveOrderDeliveries.filter(
        (delivery) => delivery.isDelayed || delivery.delaySeverity !== "none"
      ).length,
      unassigned: liveOrderDeliveries.filter(
        (delivery) => delivery.status === "ReadyForPickup" && !delivery.rider
      ).length,
      topOrder: liveOrderDeliveries[0] ?? null,
    }
  }, [liveOrderDeliveries])

  const restaurantOrderSummary = React.useMemo(() => {
    const restaurantsById = new Map<
      string,
      {
        id: string
        name: string
        count: number
        totalValue: number
        delayed: number
        ready: number
        pickedUp: number
      }
    >()

    liveOrderDeliveries.forEach((delivery) => {
      const current = restaurantsById.get(delivery.restaurant.id) ?? {
        id: delivery.restaurant.id,
        name: delivery.restaurant.name,
        count: 0,
        totalValue: 0,
        delayed: 0,
        ready: 0,
        pickedUp: 0,
      }
      current.count += 1
      current.totalValue += delivery.total
      if (delivery.isDelayed || delivery.delaySeverity !== "none")
        current.delayed += 1
      if (delivery.status === "ReadyForPickup") current.ready += 1
      if (delivery.status === "PickedUp") current.pickedUp += 1
      restaurantsById.set(delivery.restaurant.id, current)
    })

    return Array.from(restaurantsById.values()).sort((left, right) => {
      if (left.count !== right.count) return right.count - left.count
      return right.totalValue - left.totalValue
    })
  }, [liveOrderDeliveries])

  const restaurantDelaySeverityById = React.useMemo(() => {
    const delayMap = new Map<string, "warning" | "critical">()
    ;(snapshot?.deliveries ?? []).filter(isLiveOrderDrawerDelivery).forEach((delivery) => {
      if (!delivery.isDelayed && delivery.delaySeverity === "none") return
      const restaurantId = delivery.restaurant.id
      if (!restaurantId) return
      if (delivery.delaySeverity === "critical") {
        delayMap.set(restaurantId, "critical")
        return
      }
      if (!delayMap.has(restaurantId)) delayMap.set(restaurantId, "warning")
    })
    return delayMap
  }, [snapshot?.deliveries])

  const missingLocationSummary = React.useMemo(() => {
    const hiddenOrders = deliveries.filter(
      (delivery) =>
        !getPoint(delivery.restaurant) ||
        !getPoint(delivery.customer.deliveryAddress)
    ).length
    const hiddenRiders = riders.filter(
      (rider) => !getPoint(rider.currentLocation)
    ).length
    const hiddenRestaurants = restaurants.filter(
      (restaurant) => !getPoint(restaurant)
    ).length

    return {
      hiddenOrders,
      hiddenRiders,
      hiddenRestaurants,
      total: hiddenOrders + hiddenRiders + hiddenRestaurants,
    }
  }, [deliveries, restaurants, riders])

  const selectedNearbyRiders = React.useMemo(() => {
    const allRiders = snapshot?.riders ?? []
    const allDeliveries = snapshot?.deliveries ?? []

    if (!selected) return []
    if (selected.type === "delivery") {
      return getNearbyRiders(allRiders, getDeliveryTargetPoint(selected.item), 4)
    }
    if (selected.type === "restaurant") {
      return getNearbyRiders(allRiders, getPoint(selected.item), 4)
    }
    const activeDelivery = allDeliveries.find(
      (delivery) => delivery.rider?.id === selected.item.id
    )
    return activeDelivery
      ? getNearbyRiders(allRiders, getDeliveryTargetPoint(activeDelivery), 4)
      : []
  }, [selected, snapshot?.deliveries, snapshot?.riders])

  const selectedLiveTripContext = React.useMemo(
    () => getLiveTripContextForSelection(selected, snapshot?.deliveries ?? []),
    [selected, snapshot?.deliveries]
  )

  const fleetPulse = React.useMemo(() => {
    const allRiders = snapshot?.riders ?? []
    const allDeliveries = snapshot?.deliveries ?? []
    const allRestaurants = snapshot?.restaurants ?? []
    const liveDeliveries = allDeliveries.filter(isLiveOrderDrawerDelivery)
    const staleRiders = allRiders.filter(
      (rider) => riderFreshness(rider) === "stale"
    ).length
    const busyRiders = allRiders.filter(
      (rider) => (rider.activeOrderCount ?? 0) > 0
    ).length
    const readyWithoutRider = liveDeliveries.filter(
      (delivery) => delivery.status === "ReadyForPickup" && !delivery.rider
    ).length
    const activeStores = allRestaurants.filter(
      (restaurant) => restaurant.activeOrders > 0
    ).length

    return {
      staleRiders,
      busyRiders,
      readyWithoutRider,
      activeStores,
    }
  }, [snapshot?.deliveries, snapshot?.restaurants, snapshot?.riders])

  const shouldClusterMarkers = camera.zoom < 12 && !selected && !hasActiveSearch
  const selectDeliveryFromDrawer = React.useCallback(
    (delivery: AdminLiveMapDelivery, shouldFocus = false) => {
      const nextSelected: SelectedMapItem = { type: "delivery", item: delivery }
      setSelected(nextSelected)
      setLiveOrdersDrawerOpen(false)
      if (shouldFocus) {
        setFocusedSelectedKey(selectedKey(nextSelected))
        setFitVersion((current) => current + 1)
      }
    },
    []
  )
  const riderClusters = React.useMemo(
    () =>
      clusterMapPoints(
        visibleRiders,
        (rider) => getPoint(rider.currentLocation),
        0.018
      ),
    [visibleRiders]
  )
  const restaurantClusters = React.useMemo(
    () =>
      clusterMapPoints(
        visibleRestaurants,
        (restaurant) => getPoint(restaurant),
        0.018
      ),
    [visibleRestaurants]
  )
  const customerClusters = React.useMemo(
    () =>
      clusterMapPoints(
        visibleDeliveries,
        (delivery) => getPoint(delivery.customer.deliveryAddress),
        0.018
      ),
    [visibleDeliveries]
  )

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] overflow-hidden bg-slate-950">
      <div className="absolute inset-0 z-0 [&_.leaflet-bottom]:!z-[20] [&_.leaflet-control-container]:!z-[20] [&_.leaflet-pane]:!z-[1] [&_.leaflet-top]:!z-[20]">
        <MapContainer
          center={mapPoints[0] ?? netrokonaCenter}
          zoom={12}
          className="h-full w-full"
          scrollWheelZoom
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapViewportSync
            points={viewportPoints}
            triggerKey={viewportTriggerKey}
          />
          <MapResizeObserver />
          <MapCameraTracker onChange={handleCameraChange} />
          {visibleServiceZones.map((zone) => {
            if (
              typeof zone.center?.latitude !== "number" ||
              typeof zone.center?.longitude !== "number"
            ) {
              return null
            }
            const isSelectedScope =
              adminZoneScope.type === "zone" && adminZoneScope.id === zone.id
            return (
              <Circle
                key={`service-zone-${zone.id}`}
                center={[zone.center.latitude, zone.center.longitude]}
                radius={coveragePreviewRadiusKm * 1000}
                pathOptions={{
                  color: isSelectedScope ? "#fb3f8a" : "#0ea5e9",
                  fillColor: isSelectedScope ? "#f9a8d4" : "#bae6fd",
                  fillOpacity: isSelectedScope ? 0.12 : 0.08,
                  opacity: 0.75,
                  weight: isSelectedScope ? 3 : 2,
                  dashArray: isSelectedScope ? undefined : "8 8",
                }}
              />
            )
          })}
          {shouldClusterMarkers
            ? restaurantClusters.map((cluster) => (
                <Marker
                  key={`restaurant-cluster-${cluster.key}`}
                  position={cluster.point}
                  icon={clusterIcon(cluster.count)}
                  eventHandlers={{
                    click: () => {
                      const firstRestaurant = cluster.items[0]
                      if (firstRestaurant) {
                        setSelected({
                          type: "restaurant",
                          item: firstRestaurant,
                        })
                      }
                    },
                  }}
                />
              ))
            : visibleRestaurants.map((restaurant) => {
                const point = getPoint(restaurant)
                if (!point) return null
                const isSelected =
                  selected?.type === "restaurant" &&
                  selected.item.id === restaurant.id
                const delaySeverity =
                  restaurantDelaySeverityById.get(restaurant.id) ?? "none"
                return (
                  <Marker
                    key={`restaurant-${restaurant.id}`}
                    position={point}
                    icon={getRestaurantMarkerIcon(
                      restaurant,
                      isSelected,
                      delaySeverity
                    )}
                    eventHandlers={{
                      click: () =>
                        setSelected({ type: "restaurant", item: restaurant }),
                    }}
                  />
                )
              })}
          {visibleDeliveries.map((delivery) => {
            const customerPoint = getPoint(delivery.customer.deliveryAddress)
            const activeRoutePoints = getActiveRoutePoints(delivery)
            const contextRoutePoints = getContextRoutePoints(delivery)
            const routeColor =
              delivery.delaySeverity === "critical"
                ? "#e11d48"
                : delivery.delaySeverity === "warning"
                  ? "#f59e0b"
                  : delivery.status === "PickedUp"
                    ? "#0ea5e9"
                    : "#fb3f8a"
            const isSelected =
              selected?.type === "delivery" && selected.item.id === delivery.id
            const shouldShowRoute =
              isSelected ||
              isDetailedZoom ||
              hasActiveSearch ||
              layer === "orders" ||
              layer === "issues"
            const activeRouteLabelPoint = midpoint(
              activeRoutePoints[0] ?? null,
              activeRoutePoints[1] ?? null
            )
            const routeLabelTone =
              delivery.status === "PickedUp" ? "dropoff" : "pickup"

            return (
              <React.Fragment key={`delivery-${delivery.id}`}>
                {contextRoutePoints.length >= 2 && shouldShowRoute ? (
                  <Polyline
                    positions={contextRoutePoints}
                    pathOptions={{
                      color: "#64748b",
                      weight: isSelected ? 4 : 2.5,
                      opacity: isSelected ? 0.38 : 0.22,
                      dashArray: "4 10",
                    }}
                    eventHandlers={{
                      click: () =>
                        setSelected({ type: "delivery", item: delivery }),
                    }}
                  />
                ) : null}
                {activeRoutePoints.length >= 2 && shouldShowRoute ? (
                  <Polyline
                    positions={activeRoutePoints}
                    pathOptions={{
                      color: routeColor,
                      weight: isSelected ? 8 : selected ? 4 : 5,
                      opacity: isSelected ? 0.95 : selected ? 0.38 : 0.78,
                      dashArray:
                        delivery.status === "PickedUp" ? undefined : "12 8",
                      lineCap: "round",
                      lineJoin: "round",
                    }}
                    eventHandlers={{
                      click: () =>
                        setSelected({ type: "delivery", item: delivery }),
                    }}
                  />
                ) : null}
                {activeRouteLabelPoint && shouldShowRoute ? (
                  <Marker
                    position={activeRouteLabelPoint}
                    icon={labelIcon(
                      delivery.status === "PickedUp"
                        ? "To customer"
                        : "To pickup",
                      routeLabelTone
                    )}
                    interactive={false}
                  />
                ) : null}
                {!shouldClusterMarkers && customerPoint ? (
                  <Marker
                    position={customerPoint}
                    icon={customerIcon}
                    eventHandlers={{
                      click: () =>
                        setSelected({ type: "delivery", item: delivery }),
                    }}
                  />
                ) : null}
              </React.Fragment>
            )
          })}
          {shouldClusterMarkers
            ? customerClusters.map((cluster) => (
                <Marker
                  key={`customer-cluster-${cluster.key}`}
                  position={cluster.point}
                  icon={clusterIcon(cluster.count)}
                  eventHandlers={{
                    click: () => {
                      const firstDelivery = cluster.items[0]
                      if (firstDelivery) {
                        setSelected({ type: "delivery", item: firstDelivery })
                      }
                    },
                  }}
                />
              ))
            : null}
          {shouldClusterMarkers
            ? riderClusters.map((cluster) => (
                <Marker
                  key={`rider-cluster-${cluster.key}`}
                  position={cluster.point}
                  icon={clusterIcon(cluster.count)}
                  eventHandlers={{
                    click: () => {
                      const firstRider = cluster.items[0]
                      if (firstRider) {
                        setSelected({ type: "rider", item: firstRider })
                      }
                    },
                  }}
                />
              ))
            : visibleRiders.map((rider) => {
                const point = getPoint(rider.currentLocation)
                if (!point) return null
                const isSelected =
                  selected?.type === "rider" && selected.item.id === rider.id
                return (
                  <Marker
                    key={`rider-${rider.id}`}
                    position={point}
                    icon={getRiderMarkerIcon(rider, isSelected)}
                    eventHandlers={{
                      click: () => setSelected({ type: "rider", item: rider }),
                    }}
                  />
                )
              })}
        </MapContainer>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-[40] p-4">
        <div className="pointer-events-auto flex w-full max-w-none flex-col items-start gap-2">
          <Card
            size="sm"
            className="border-white/70 bg-white/94 py-2 shadow-[0_20px_70px_rgba(15,23,42,.18)] backdrop-blur"
          >
            <CardContent className="px-2">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                <div className="relative min-w-0 lg:w-[25vw] lg:max-w-md lg:min-w-72">
                  <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search order, rider, restaurant, phone..."
                    className="h-9 rounded-2xl bg-white pr-9 pl-9"
                  />
                  {search ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full"
                      onClick={() => setSearch("")}
                      aria-label="Clear search"
                    >
                      <X className="size-3.5" />
                    </Button>
                  ) : null}
                </div>
                <Select
                  value={layer}
                  onValueChange={(value) => setLayer(value as LayerFilter)}
                >
                  <SelectTrigger className="h-9 w-full rounded-2xl bg-white lg:w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[1200]">
                    <SelectItem value="all">All layers</SelectItem>
                    <SelectItem value="orders">Orders only</SelectItem>
                    <SelectItem value="riders">Riders only</SelectItem>
                    <SelectItem value="restaurants">
                      Restaurants only
                    </SelectItem>
                    <SelectItem value="issues">Issues only</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant={priorityMode ? "default" : "outline"}
                  size="icon-lg"
                  className={cn(
                    "rounded-2xl",
                    priorityMode
                      ? "bg-pink-500 text-white hover:bg-pink-600"
                      : "bg-white"
                  )}
                  onClick={() => setPriorityMode((current) => !current)}
                  aria-label="Toggle priority map mode"
                >
                  <Flame className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-lg"
                  className="rounded-2xl bg-white"
                  onClick={() => setShowQuietRestaurants((current) => !current)}
                  aria-label={
                    showQuietRestaurants
                      ? "Show active stores only"
                      : "Show all stores"
                  }
                >
                  {showQuietRestaurants ? (
                    <Eye className="size-4" />
                  ) : (
                    <EyeOff className="size-4" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-lg"
                  className="rounded-2xl bg-white"
                  onClick={() => {
                    setSelected(null)
                    setFocusedSelectedKey(null)
                    setFitVersion((current) => current + 1)
                  }}
                  aria-label="Fit all markers"
                >
                  <Crosshair className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon-lg"
                  className="rounded-2xl bg-slate-950 text-white hover:bg-slate-800"
                  disabled={liveMapQuery.isFetching}
                  onClick={() => void liveMapQuery.refetch()}
                  aria-label="Refresh live map"
                >
                  {liveMapQuery.isFetching ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="size-4" />
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex max-w-[calc(100vw-2rem)] flex-wrap gap-1.5">
            <StatCard
              label="Active"
              value={liveOrderMetrics.total}
              icon={ListChecks}
              tone="bg-slate-100 text-slate-700"
            />
            <StatCard
              label="Live trips"
              value={summary?.liveTrips ?? 0}
              icon={Truck}
              tone="bg-sky-100 text-sky-700"
            />
            <StatCard
              label="Ready"
              value={summary?.readyForPickup ?? 0}
              icon={PackageCheck}
              tone="bg-pink-100 text-pink-700"
            />
            <StatCard
              label="Delayed"
              value={summary?.delayedTrips ?? 0}
              icon={AlertTriangle}
              tone="bg-rose-100 text-rose-700"
            />
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-4 left-4 z-[40] flex flex-col gap-2">
        <Button
          type="button"
          size="icon-lg"
          variant="outline"
          className="pointer-events-auto rounded-2xl border-white/80 bg-white text-slate-950 shadow-[0_18px_60px_rgba(15,23,42,.18)] hover:bg-slate-50"
          onClick={() => setLiveOrdersDrawerOpen(true)}
          aria-label={
            liveOrderMetrics.total > 0
              ? `Open active orders, ${liveOrderMetrics.total} active orders`
              : "Open active order queue"
          }
        >
          <ListChecks className="size-4" />
          {liveOrderMetrics.total > 0 ? (
            <Badge className="absolute -top-2 -right-2 rounded-full bg-pink-500 px-1.5 text-[10px] text-white">
              {liveOrderMetrics.total}
            </Badge>
          ) : null}
        </Button>
        <Button
          type="button"
          size="icon-lg"
          className="pointer-events-auto rounded-2xl bg-slate-950 text-white shadow-[0_18px_60px_rgba(15,23,42,.25)] hover:bg-slate-800"
          onClick={() => setOpsDrawerOpen(true)}
          aria-label="Open map operations"
        >
          <PanelLeftOpen className="size-4" />
          {issues.length > 0 ? (
            <Badge className="absolute -top-2 -right-2 rounded-full bg-pink-500 px-1.5 text-[10px]">
              {issues.length}
            </Badge>
          ) : null}
        </Button>
      </div>

      <div className="pointer-events-none absolute right-4 bottom-4 z-[40] flex flex-col items-end gap-3">
        <div className="pointer-events-auto w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-white/70 bg-white/94 px-3 py-2.5 text-xs text-slate-500 shadow-xl backdrop-blur">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              className={cn(
                "rounded-full",
                connectionState === "live"
                  ? "bg-emerald-600"
                  : connectionState === "connecting"
                    ? "bg-amber-500"
                    : "bg-rose-600"
              )}
            >
              {connectionState === "live" ? (
                <Signal className="size-3" />
              ) : (
                <WifiOff className="size-3" />
              )}
              {connectionState === "live"
                ? "Live"
                : connectionState === "connecting"
                  ? "Connecting"
                  : "Offline"}
            </Badge>
            <Badge variant="secondary" className="rounded-full">
              {fleetPulse.busyRiders} busy
            </Badge>
            <Badge variant="secondary" className="rounded-full">
              {fleetPulse.staleRiders} stale
            </Badge>
            {missingLocationSummary.total > 0 ? (
              <Badge variant="destructive" className="rounded-full">
                <LocateOff className="size-3" />
                {missingLocationSummary.total} hidden
              </Badge>
            ) : null}
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="font-semibold text-slate-700">
              {liveOrderMetrics.total} active -{" "}
              {liveOrderMetrics.statusCounts.ReadyForPickup} ready -{" "}
              {liveOrderMetrics.statusCounts.PickedUp} trips
            </span>
            <span className="shrink-0 text-[11px]">
              {formatDateTime(snapshot?.lastUpdatedAt)}
            </span>
          </div>
          {liveOrderMetrics.unassigned > 0 ? (
            <p className="mt-1 rounded-xl bg-orange-50 px-2 py-1 text-[11px] font-semibold text-orange-700">
              {liveOrderMetrics.unassigned} ready order needs rider assignment.
            </p>
          ) : null}
          <details className="mt-2 border-t border-slate-200 pt-2">
            <summary className="cursor-pointer text-[11px] font-semibold text-slate-600">
              Map details
            </summary>
            <div className="mt-2 space-y-1.5 text-[11px] text-slate-500">
              <p>
                Visible markers: {visibleMarkerCount}/{totalFilteredMarkerCount}
                {" - "}zoom {camera.zoom}
              </p>
              <p>
                Queue: {liveOrderMetrics.statusCounts.Preparing} preparing,{" "}
                {liveOrderMetrics.statusCounts.ReadyForPickup} ready,{" "}
                {liveOrderMetrics.statusCounts.PickedUp} on trip.
              </p>
              {missingLocationSummary.total > 0 ? (
                <p>
                  Hidden: {missingLocationSummary.hiddenOrders} orders,{" "}
                  {missingLocationSummary.hiddenRiders} riders,{" "}
                  {missingLocationSummary.hiddenRestaurants} stores.
                </p>
              ) : null}
              {visibleServiceZones.length > 0 ? (
                <div className="pt-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-slate-700">
                      Area circle
                    </span>
                    <Badge className="rounded-md bg-pink-500 text-[10px] text-white">
                      {coveragePreviewRadiusKm.toFixed(1)} km
                    </Badge>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={0.1}
                    value={coveragePreviewRadiusKm}
                    onChange={(event) =>
                      setCoveragePreviewRadiusKm(Number(event.target.value))
                    }
                    className="mt-2 h-2 w-full accent-pink-500"
                    aria-label="Selected area circle radius"
                  />
                  <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                    <span>1 km</span>
                    <span>3 km</span>
                    <span>5 km</span>
                  </div>
                </div>
              ) : null}
            </div>
          </details>
        </div>
      </div>

      <Sheet open={liveOrdersDrawerOpen} onOpenChange={setLiveOrdersDrawerOpen}>
        <SheetContent
          side="left"
          className="z-[1200] flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-xl! md:max-w-xl!"
        >
          <SheetHeader className="border-b px-6 py-5">
            <SheetTitle className="flex items-center gap-2">
              <ListChecks className="size-5 text-pink-500" />
              Active order queue
            </SheetTitle>
            <SheetDescription>
              Kitchen, pickup, trip, store load, value, and priority signals.
            </SheetDescription>
          </SheetHeader>
          <LiveOrdersDrawerContent
            deliveries={liveOrderDeliveries}
            metrics={liveOrderMetrics}
            restaurantSummary={restaurantOrderSummary}
            lastUpdatedAt={snapshot?.lastUpdatedAt ?? null}
            selectedDeliveryId={selectedDeliveryId}
            isAutoAssigning={autoAssignMutation.isPending}
            onSelect={selectDeliveryFromDrawer}
            onShowOrders={() => setLayer("orders")}
            onAutoAssign={(orderId) => autoAssignMutation.mutate(orderId)}
            onOpen={(path) => navigate(path)}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={opsDrawerOpen} onOpenChange={setOpsDrawerOpen}>
        <SheetContent
          side="left"
          className="z-[1200] flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-3xl! md:max-w-6xl!"
        >
          <SheetHeader className="border-b px-6 py-5">
            <SheetTitle className="flex items-center gap-2">
              <SlidersHorizontal className="size-5 text-pink-500" />
              Map operations
            </SheetTitle>
            <SheetDescription>
              Legend, fleet health, and critical map issues.
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-3 p-4">
              <LegendPanel />
              <FleetPulsePanel
                pulse={fleetPulse}
                dispatchSettings={dispatchSettingsQuery.data ?? null}
                isDispatchSettingsLoading={dispatchSettingsQuery.isPending}
                onOpenDispatchSettings={() => navigate("/riders#dispatch")}
              />
              <IssuePanel
                issues={issues}
                onSelect={(nextSelected) => {
                  setSelected(nextSelected)
                  setOpsDrawerOpen(false)
                }}
                onShowIssues={() => setLayer("issues")}
              />
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <Sheet
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        {selected ? (
          <DetailsPanel
            selected={selected}
            nearbyRiders={selectedNearbyRiders}
            onOpen={(path) => navigate(path)}
            onFocus={() => {
              setFocusedSelectedKey(selectedKey(selected))
              setFitVersion((current) => current + 1)
            }}
            onAutoAssign={(orderId) => autoAssignMutation.mutate(orderId)}
            isAutoAssigning={autoAssignMutation.isPending}
            riderOptions={riderAssignmentOptionsQuery.data ?? []}
            assignmentDrafts={assignmentDrafts}
            isRiderOptionsLoading={riderAssignmentOptionsQuery.isPending}
            assigningOrderId={assignRiderMutation.variables?.orderId ?? null}
            isAssigningRider={assignRiderMutation.isPending}
            liveTripContext={selectedLiveTripContext}
            activeTripPendingOrderId={
              activeTripMutation.isPending
                ? (activeTripMutation.variables?.orderId ?? "")
                : ""
            }
            onAssignmentDraftChange={handleAssignmentDraftChange}
            onAssignRider={handleManualAssign}
            onSetActiveTrip={(riderId, orderId) =>
              activeTripMutation.mutate({ riderId, orderId })
            }
            onCancelOrder={(delivery) =>
              statusMutation.mutate({
                orderId: delivery.id,
                expectedStatus: delivery.status,
                nextStatus: "Cancelled",
              })
            }
            isCancellingOrder={statusMutation.isPending}
          />
        ) : null}
      </Sheet>

      {isInitialLoading ? (
        <div className="absolute inset-0 z-[600] flex items-center justify-center bg-slate-950/45 backdrop-blur-sm">
          <div className="rounded-3xl border border-white/20 bg-white px-6 py-5 text-center shadow-2xl">
            <Loader2 className="mx-auto size-8 animate-spin text-pink-500" />
            <p className="mt-3 text-sm font-semibold text-slate-950">
              Loading live map
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Preparing riders, restaurants, and active routes.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function DetailsPanel({
  selected,
  nearbyRiders,
  onOpen,
  onFocus,
  onAutoAssign,
  isAutoAssigning,
  riderOptions,
  assignmentDrafts,
  isRiderOptionsLoading,
  assigningOrderId,
  isAssigningRider,
  liveTripContext,
  activeTripPendingOrderId,
  onAssignmentDraftChange,
  onAssignRider,
  onSetActiveTrip,
  onCancelOrder,
  isCancellingOrder,
}: {
  selected: SelectedMapItem
  nearbyRiders: NearbyRiderCandidate[]
  onOpen: (path: string) => void
  onFocus: () => void
  onAutoAssign: (orderId: string) => void
  isAutoAssigning: boolean
  riderOptions: AdminRiderAssignmentOption[]
  assignmentDrafts: Record<string, string>
  isRiderOptionsLoading: boolean
  assigningOrderId: string | null
  isAssigningRider: boolean
  liveTripContext: LiveTripSwitchContext
  activeTripPendingOrderId: string
  onAssignmentDraftChange: (orderId: string, riderId: string) => void
  onAssignRider: (orderId: string, riderId: string) => void
  onSetActiveTrip: (riderId: string, orderId: string) => void
  onCancelOrder: (delivery: AdminLiveMapDelivery) => void
  isCancellingOrder: boolean
}) {
  return (
    <SheetContent
      side="right"
      className="z-[1200] flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-xl! md:max-w-xl!"
    >
      <SheetHeader className="border-b px-6 py-5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-slate-950 text-white">
            {selected.type === "delivery" ? (
              <PackageCheck className="size-5" />
            ) : null}
            {selected.type === "rider" ? <Bike className="size-5" /> : null}
            {selected.type === "restaurant" ? (
              <Building2 className="size-5" />
            ) : null}
          </span>
          <div>
            <SheetTitle className="text-sm font-black text-slate-950">
              {getSelectedTitle(selected)}
            </SheetTitle>
            <SheetDescription className="text-xs text-slate-500">
              {selected.type === "delivery"
                ? "Active order route"
                : selected.type === "rider"
                  ? selected.item.phone || "Rider phone not added"
                  : "Restaurant operations"}
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>
      <ScrollArea className="min-h-0 flex-1">
        <Tabs defaultValue="overview" className="gap-0">
          <div className="sticky top-0 z-10 border-b bg-white px-5 py-3">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="route">Route</TabsTrigger>
              <TabsTrigger value="actions">Actions</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="overview" className="space-y-4 p-5">
            {selected.type === "delivery" ? (
              <DeliveryDetails
                delivery={selected.item}
                isAutoAssigning={isAutoAssigning}
                isCancellingOrder={isCancellingOrder}
                liveTripContext={liveTripContext}
                nearbyRiders={nearbyRiders}
                onAutoAssign={onAutoAssign}
                onCancelOrder={onCancelOrder}
                onFocus={onFocus}
                onOpen={onOpen}
              />
            ) : null}
            {selected.type === "rider" ? (
              <RiderDetails
                rider={selected.item}
                liveTripContext={liveTripContext}
                nearbyRiders={nearbyRiders}
                onFocus={onFocus}
                onOpen={onOpen}
              />
            ) : null}
            {selected.type === "restaurant" ? (
              <RestaurantDetails
                restaurant={selected.item}
                nearbyRiders={nearbyRiders}
                onFocus={onFocus}
                onOpen={onOpen}
              />
            ) : null}
          </TabsContent>
          <TabsContent value="route" className="space-y-4 p-5">
            <SelectedRouteTab
              selected={selected}
              nearbyRiders={nearbyRiders}
              onFocus={onFocus}
              onOpen={onOpen}
            />
          </TabsContent>
          <TabsContent value="actions" className="space-y-4 p-5">
            <SelectedActionsTab
              selected={selected}
              isAutoAssigning={isAutoAssigning}
              isCancellingOrder={isCancellingOrder}
              riderOptions={riderOptions}
              assignmentDrafts={assignmentDrafts}
              isRiderOptionsLoading={isRiderOptionsLoading}
              assigningOrderId={assigningOrderId}
              isAssigningRider={isAssigningRider}
              liveTripContext={liveTripContext}
              activeTripPendingOrderId={activeTripPendingOrderId}
              onAssignmentDraftChange={onAssignmentDraftChange}
              onAssignRider={onAssignRider}
              onSetActiveTrip={onSetActiveTrip}
              onAutoAssign={onAutoAssign}
              onCancelOrder={onCancelOrder}
              onFocus={onFocus}
              onOpen={onOpen}
            />
          </TabsContent>
        </Tabs>
      </ScrollArea>
    </SheetContent>
  )
}

function DetailRow({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="max-w-[230px] text-right text-sm font-semibold text-slate-950">
        {value}
      </span>
    </div>
  )
}

function SelectedRouteTab({
  selected,
  nearbyRiders,
  onFocus,
  onOpen,
}: {
  selected: SelectedMapItem
  nearbyRiders: NearbyRiderCandidate[]
  onFocus: () => void
  onOpen: (path: string) => void
}) {
  if (selected.type === "delivery") {
    const delivery = selected.item
    return (
      <>
        <DetailRow label="Map state" value={getDeliveryMapState(delivery)} />
        <DetailRow
          label="Next target"
          value={getDeliveryTargetLabel(delivery)}
        />
        <DetailRow
          label="Remaining"
          value={`${formatDistance(delivery.tracking.remainingDistanceKm)} - ${formatMinutes(delivery.tracking.remainingDurationMinutes)}`}
        />
        <NearbyRidersPanel riders={nearbyRiders} onOpen={onOpen} />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="rounded-2xl" onClick={onFocus}>
            <Crosshair className="size-4" />
            Focus
          </Button>
          <Button
            variant="outline"
            className="rounded-2xl"
            onClick={() =>
              openDirections(
                getDeliveryTargetPoint(delivery),
                getDeliveryOriginPoint(delivery)
              )
            }
          >
            <Navigation className="size-4" />
            Directions
          </Button>
        </div>
      </>
    )
  }

  if (selected.type === "rider") {
    const rider = selected.item
    const riderPoint = getPoint(rider.currentLocation)
    return (
      <>
        <DetailRow
          label="Current order"
          value={
            (rider.activeOrderNumbers ?? []).length
              ? rider.activeOrderNumbers.join(", ")
              : "No active trip"
          }
        />
        <DetailRow
          label="Active load"
          value={`${rider.activeOrderCount ?? 0} active (${rider.readyOrderCount ?? 0} ready, ${rider.pickedUpOrderCount ?? 0} trip)`}
        />
        <DetailRow label="Phone" value={rider.phone || "Not added"} />
        <DetailRow
          label="Last location"
          value={formatDateTime(rider.currentLocation?.lastUpdatedAt)}
        />
        <DetailRow
          label="Speed"
          value={`${Math.round(rider.currentLocation?.speedKmph ?? 0)} km/h`}
        />
        <NearbyRidersPanel
          riders={nearbyRiders}
          title="Riders near this trip target"
          onOpen={onOpen}
        />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="rounded-2xl" onClick={onFocus}>
            <Crosshair className="size-4" />
            Focus
          </Button>
          <Button
            variant="outline"
            className="rounded-2xl"
            onClick={() => openMapMarker(riderPoint, "Rider location")}
          >
            <Navigation className="size-4" />
            Show marker
          </Button>
        </div>
      </>
    )
  }

  const restaurant = selected.item
  return (
    <>
      <DetailRow label="Live orders" value={restaurant.activeOrders} />
      <DetailRow
        label="Ready / picked"
        value={`${restaurant.readyForPickup} ready - ${restaurant.pickedUp} picked`}
      />
      <DetailRow
        label="Address"
        value={restaurant.address || restaurant.city || "Address unavailable"}
      />
      <NearbyRidersPanel riders={nearbyRiders} onOpen={onOpen} />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="rounded-2xl" onClick={onFocus}>
          <Crosshair className="size-4" />
          Focus
        </Button>
        <Button
          variant="outline"
          className="rounded-2xl"
          onClick={() => openDirections(getPoint(restaurant))}
        >
          <Navigation className="size-4" />
          Directions
        </Button>
      </div>
    </>
  )
}

function SelectedActionsTab({
  selected,
  isAutoAssigning,
  isCancellingOrder,
  riderOptions,
  assignmentDrafts,
  isRiderOptionsLoading,
  assigningOrderId,
  isAssigningRider,
  liveTripContext,
  activeTripPendingOrderId,
  onAssignmentDraftChange,
  onAssignRider,
  onSetActiveTrip,
  onAutoAssign,
  onCancelOrder,
  onFocus,
  onOpen,
}: {
  selected: SelectedMapItem
  isAutoAssigning: boolean
  isCancellingOrder: boolean
  riderOptions: AdminRiderAssignmentOption[]
  assignmentDrafts: Record<string, string>
  isRiderOptionsLoading: boolean
  assigningOrderId: string | null
  isAssigningRider: boolean
  liveTripContext: LiveTripSwitchContext
  activeTripPendingOrderId: string
  onAssignmentDraftChange: (orderId: string, riderId: string) => void
  onAssignRider: (orderId: string, riderId: string) => void
  onSetActiveTrip: (riderId: string, orderId: string) => void
  onAutoAssign: (orderId: string) => void
  onCancelOrder: (delivery: AdminLiveMapDelivery) => void
  onFocus: () => void
  onOpen: (path: string) => void
}) {
  if (selected.type === "delivery") {
    const delivery = selected.item
    const canAutoAssign =
      delivery.status === "ReadyForPickup" && !delivery.rider
    const canCancel = delivery.status === "ReadyForPickup"
    return (
      <>
        {delivery.status === "ReadyForPickup" ? (
          <ManualRiderAssignmentControl
            delivery={delivery}
            riders={riderOptions}
            selectedRiderId={
              assignmentDrafts[delivery.id] ?? delivery.rider?.id ?? ""
            }
            isLoading={isRiderOptionsLoading}
            isAssigning={isAssigningRider && assigningOrderId === delivery.id}
            onChange={(riderId) =>
              onAssignmentDraftChange(delivery.id, riderId)
            }
            onAssign={() =>
              onAssignRider(
                delivery.id,
                assignmentDrafts[delivery.id] ?? delivery.rider?.id ?? ""
              )
            }
          />
        ) : null}
        <LiveTripSwitchPanel
          context={liveTripContext}
          pendingOrderId={activeTripPendingOrderId}
          onSetActiveTrip={onSetActiveTrip}
        />
        <div className="grid grid-cols-2 gap-2">
          <Button
            className="rounded-2xl bg-pink-500 hover:bg-pink-600"
            onClick={() => onOpen(`/orders?orderId=${delivery.id}`)}
          >
            Open order
          </Button>
          <Button variant="outline" className="rounded-2xl" onClick={onFocus}>
            <Crosshair className="size-4" />
            Focus
          </Button>
          {canAutoAssign ? (
            <Button
              className="rounded-2xl bg-slate-950 hover:bg-slate-800"
              disabled={isAutoAssigning}
              onClick={() => onAutoAssign(delivery.id)}
            >
              {isAutoAssigning ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Auto assign
            </Button>
          ) : null}
          {delivery.rider?.phone ? (
            <Button
              variant="outline"
              className="rounded-2xl"
              onClick={() => callPhone(delivery.rider?.phone)}
            >
              <Phone className="size-4" />
              Call rider
            </Button>
          ) : null}
          <Button
            variant="outline"
            className="rounded-2xl"
            onClick={() => callPhone(delivery.restaurant.phone)}
          >
            <Phone className="size-4" />
            Call store
          </Button>
          {canCancel ? (
            <Button
              variant="destructive"
              className="rounded-2xl"
              disabled={isCancellingOrder}
              onClick={() => onCancelOrder(delivery)}
            >
              {isCancellingOrder ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Ban className="size-4" />
              )}
              Cancel order
            </Button>
          ) : null}
        </div>
      </>
    )
  }

  if (selected.type === "rider") {
    const rider = selected.item
    return (
      <>
        <LiveTripSwitchPanel
          context={liveTripContext}
          pendingOrderId={activeTripPendingOrderId}
          onSetActiveTrip={onSetActiveTrip}
        />
        <div className="grid grid-cols-2 gap-2">
          <Button
            className="rounded-2xl bg-slate-950 hover:bg-slate-800"
            onClick={() =>
              onOpen(`/riders?riderId=${rider.id}&riderTab=live-assignment`)
            }
          >
            Open rider
          </Button>
          <Button
            variant="outline"
            className="rounded-2xl"
            onClick={() => callPhone(rider.phone)}
          >
            <Phone className="size-4" />
            Call rider
          </Button>
          <Button
            variant="outline"
            className="rounded-2xl"
            onClick={() =>
              openMapMarker(getPoint(rider.currentLocation), "Rider location")
            }
          >
            <Navigation className="size-4" />
            Marker
          </Button>
          {rider.liveOrderId ? (
            <Button
              variant="outline"
              className="rounded-2xl"
              onClick={() => onOpen(`/orders?orderId=${rider.liveOrderId}`)}
            >
              Open order
            </Button>
          ) : null}
        </div>
      </>
    )
  }

  const restaurant = selected.item
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button
        className="rounded-2xl bg-pink-500 hover:bg-pink-600"
        onClick={() => onOpen(`/restaurants?restaurantId=${restaurant.id}`)}
      >
        Open restaurant
      </Button>
      <Button
        variant="outline"
        className="rounded-2xl"
        onClick={() => callPhone(restaurant.phone)}
      >
        <Phone className="size-4" />
        Call store
      </Button>
      <Button
        variant="outline"
        className="rounded-2xl"
        onClick={() => openDirections(getPoint(restaurant))}
      >
        <Navigation className="size-4" />
        Directions
      </Button>
      {restaurant.latestOrder ? (
        <Button
          variant="outline"
          className="rounded-2xl"
          onClick={() =>
            onOpen(`/orders?orderId=${restaurant.latestOrder?.id}`)
          }
        >
          Open order
        </Button>
      ) : null}
    </div>
  )
}

function LiveTripSwitchPanel({
  context,
  pendingOrderId,
  onSetActiveTrip,
}: {
  context: LiveTripSwitchContext
  pendingOrderId: string
  onSetActiveTrip: (riderId: string, orderId: string) => void
}) {
  if (!context.riderId) return null

  return (
    <Card size="sm" className="border-blue-100 bg-blue-50/45 shadow-none">
      <CardHeader className="px-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-black text-slate-950">
              Live trip switch
            </CardTitle>
            <p className="mt-1 text-xs text-slate-500">
              Changes only the customer live map. It does not reassign orders.
            </p>
          </div>
          <Badge variant="outline" className="rounded-full bg-white">
            {context.trips.length} trip
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-4">
        {context.trips.length === 0 ? (
          <div className="rounded-2xl bg-white px-3 py-2 text-sm font-medium text-slate-500">
            No picked-up trip is available for this rider.
          </div>
        ) : null}
        {context.trips.map((trip) => {
          const isPending = pendingOrderId === trip.id
          const isAnyPending = Boolean(pendingOrderId)
          return (
            <div
              key={trip.id}
              className={cn(
                "rounded-2xl border bg-white px-3 py-2",
                trip.isLive ? "border-blue-200 ring-1 ring-blue-100" : ""
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-black text-slate-950">
                      {trip.orderNumber}
                    </span>
                    {trip.isLive ? (
                      <Badge className="rounded-full bg-blue-600">
                        Live now
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {trip.restaurantName} - {trip.customerName}
                  </p>
                  <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">
                    {trip.etaLabel ?? trip.realtimeLabel}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={trip.isLive ? "secondary" : "outline"}
                  className="rounded-full bg-white"
                  disabled={trip.isLive || isAnyPending}
                  onClick={() => onSetActiveTrip(context.riderId, trip.id)}
                >
                  {isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Route className="size-3.5" />
                  )}
                  {trip.isLive ? "Active" : "Make live"}
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-full bg-white",
                    getDeliveryStatusBadgeClass(trip.status)
                  )}
                >
                  {getDeliveryStatusLabel(trip.status)}
                </Badge>
                <span>
                  Last GPS {formatDateTime(trip.trackingLastUpdatedAt)}
                </span>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

function ManualRiderAssignmentControl({
  delivery,
  riders,
  selectedRiderId,
  isLoading,
  isAssigning,
  onChange,
  onAssign,
}: {
  delivery: AdminLiveMapDelivery
  riders: AdminRiderAssignmentOption[]
  selectedRiderId: string
  isLoading: boolean
  isAssigning: boolean
  onChange: (riderId: string) => void
  onAssign: () => void
}) {
  const canAssign = delivery.status === "ReadyForPickup"
  const currentRiderId = delivery.rider?.id ?? ""
  const hasSelectionChanged =
    Boolean(selectedRiderId) && selectedRiderId !== currentRiderId
  const activeOptions = riders.filter(
    (rider) => rider.isAvailableForAssignments || rider.id === currentRiderId
  )

  return (
    <Card size="sm" className="border-pink-100 bg-pink-50/40 shadow-none">
      <CardHeader className="px-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-black text-slate-950">
              Rider assignment
            </CardTitle>
            <p className="mt-1 text-xs text-slate-500">
              {canAssign
                ? "Choose the best rider for this ready order."
                : "Manual assignment unlocks when the order is ready for pickup."}
            </p>
          </div>
          <Badge
            variant={canAssign ? "default" : "secondary"}
            className={cn("rounded-full", canAssign ? "bg-pink-500" : "")}
          >
            {canAssign ? "Ready" : delivery.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-4">
        {delivery.rider ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2 text-xs">
            <span className="font-semibold text-slate-500">Current rider</span>
            <span className="truncate text-sm font-black text-slate-950">
              {delivery.rider.fullName}
            </span>
          </div>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <Select
            value={selectedRiderId || undefined}
            onValueChange={onChange}
            disabled={!canAssign || isLoading || activeOptions.length === 0}
          >
            <SelectTrigger className="rounded-2xl bg-white">
              <SelectValue
                placeholder={
                  isLoading
                    ? "Loading riders"
                    : activeOptions.length === 0
                      ? "No eligible rider"
                      : "Choose rider"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {activeOptions.map((rider) => (
                <SelectItem key={rider.id} value={rider.id}>
                  {rider.fullName} - {rider.activeOrders} active
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            className="rounded-2xl bg-slate-950 hover:bg-slate-800"
            disabled={!canAssign || !hasSelectionChanged || isAssigning}
            onClick={onAssign}
          >
            {isAssigning ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Truck className="size-4" />
            )}
            {delivery.rider ? "Reassign" : "Assign"}
          </Button>
        </div>
        {canAssign && activeOptions.length === 0 && !isLoading ? (
          <p className="rounded-2xl bg-white px-3 py-2 text-xs font-medium text-amber-700">
            No eligible rider is available right now. Check rider availability
            or use dispatch controls.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function LegendPanel() {
  const items = [
    {
      label: "Available rider",
      color: "bg-sky-500",
      detail: "ready for assignment",
    },
    { label: "Busy rider", color: "bg-pink-500", detail: "currently assigned" },
    { label: "Stale rider", color: "bg-amber-500", detail: "GPS is old" },
    {
      label: "Live-order store",
      color: "bg-pink-500",
      detail: "has active order",
    },
    {
      label: "Online store",
      color: "bg-emerald-500",
      detail: "open but quiet",
    },
    {
      label: "Quiet store",
      color: "bg-white ring-1 ring-slate-900",
      detail: "no live order",
    },
    { label: "Customer", color: "bg-emerald-500", detail: "dropoff point" },
    {
      label: "Critical issue",
      color: "bg-rose-600",
      detail: "needs attention",
    },
  ]

  return (
    <Card
      size="sm"
      className="pointer-events-auto border-white/70 bg-white/94 shadow-xl backdrop-blur"
    >
      <CardHeader className="flex flex-row items-center justify-between gap-3 px-3">
        <CardTitle className="text-xs font-black tracking-[0.18em] text-slate-500 uppercase">
          Map legend
        </CardTitle>
        <Badge variant="secondary" className="rounded-full text-[10px]">
          Live
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3 px-3">
        <div className="grid grid-cols-2 gap-2">
          {items.map((item) => (
            <div
              key={item.label}
              className="flex items-start gap-2 text-xs text-slate-600"
            >
              <span
                className={cn(
                  "mt-0.5 size-3 rounded-full shadow-sm",
                  item.color
                )}
              />
              <span className="min-w-0">
                <span className="block font-bold text-slate-800">
                  {item.label}
                </span>
                <span className="block truncate text-[10px] text-slate-500">
                  {item.detail}
                </span>
              </span>
            </div>
          ))}
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <p>
            <span className="font-bold text-pink-600">Pink dashed</span> means
            rider is going to restaurant.
          </p>
          <p>
            <span className="font-bold text-sky-600">Blue solid</span> means
            rider is delivering to customer.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function FleetPulsePanel({
  pulse,
  dispatchSettings,
  isDispatchSettingsLoading,
  onOpenDispatchSettings,
}: {
  pulse: {
    staleRiders: number
    busyRiders: number
    readyWithoutRider: number
    activeStores: number
  }
  dispatchSettings: AdminDispatchSettings | null
  isDispatchSettingsLoading: boolean
  onOpenDispatchSettings: () => void
}) {
  const items = [
    {
      label: "Busy riders",
      value: pulse.busyRiders,
      tone: "bg-sky-50 text-sky-700",
      icon: Bike,
    },
    {
      label: "Unassigned",
      value: pulse.readyWithoutRider,
      tone: "bg-rose-50 text-rose-700",
      icon: Send,
    },
    {
      label: "Stale GPS",
      value: pulse.staleRiders,
      tone: "bg-amber-50 text-amber-700",
      icon: Navigation,
    },
    {
      label: "Active stores",
      value: pulse.activeStores,
      tone: "bg-pink-50 text-pink-700",
      icon: Store,
    },
  ]

  return (
    <Card
      size="sm"
      className="pointer-events-auto border-white/70 bg-white/94 shadow-xl backdrop-blur"
    >
      <CardHeader className="flex flex-row items-start justify-between gap-3 px-3">
        <div>
          <CardTitle className="text-xs font-black tracking-[0.18em] text-slate-500 uppercase">
            Fleet pulse
          </CardTitle>
          <p className="text-xs text-slate-500">
            Live signals and assignment policy.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 rounded-full bg-white px-2.5 text-[11px] font-bold"
          onClick={onOpenDispatchSettings}
        >
          {isDispatchSettingsLoading ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Route className="size-3" />
          )}
          {getDispatchAlgorithmLabel(dispatchSettings)}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 px-3">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 rounded-2xl border bg-white px-3 py-2 text-left transition hover:border-pink-200 hover:bg-pink-50"
          onClick={onOpenDispatchSettings}
        >
          <span>
            <span className="block text-xs font-black text-slate-950">
              {getDispatchAlgorithmLabel(dispatchSettings)}
            </span>
            <span className="block text-[11px] text-slate-500">
              {getDispatchAlgorithmDetail(dispatchSettings)}
            </span>
          </span>
          <SlidersHorizontal className="size-4 text-pink-500" />
        </button>
        <div className="grid grid-cols-2 gap-2">
          {items.map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.label}
                className={cn("rounded-2xl px-3 py-2", item.tone)}
              >
                <div className="flex items-center justify-between gap-2">
                  <Icon className="size-4" />
                  <span className="text-base font-black">{item.value}</span>
                </div>
                <p className="mt-1 text-[11px] font-semibold">{item.label}</p>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function IssuePanel({
  issues,
  onSelect,
  onShowIssues,
}: {
  issues: LiveMapIssue[]
  onSelect: (selected: SelectedMapItem) => void
  onShowIssues: () => void
}) {
  return (
    <Card
      size="sm"
      className="pointer-events-auto overflow-hidden border-white/70 bg-white/94 shadow-xl backdrop-blur"
    >
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b px-3">
        <div>
          <CardTitle className="text-sm font-black text-slate-950">
            Critical issues
          </CardTitle>
          <p className="text-xs text-slate-500">
            Delayed, stale, and unassigned work.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="rounded-full"
          onClick={onShowIssues}
        >
          Issues
        </Button>
      </CardHeader>
      <ScrollArea className="max-h-64">
        <div className="space-y-2 p-3">
          {issues.length === 0 ? (
            <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              No live operational issue right now.
            </div>
          ) : null}
          {issues.map((issue) => (
            <button
              key={issue.id}
              type="button"
              className="w-full rounded-2xl border bg-white px-3 py-2 text-left transition hover:border-pink-200 hover:bg-pink-50"
              onClick={() => onSelect(issue.selected)}
            >
              <div className="flex items-start gap-2">
                <span
                  className={cn(
                    "mt-1 size-2.5 shrink-0 rounded-full",
                    issue.severity === "critical"
                      ? "bg-rose-600"
                      : "bg-amber-500"
                  )}
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-slate-950">
                    {issue.title}
                  </span>
                  <span className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                    {issue.description}
                  </span>
                </span>
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </Card>
  )
}

function LiveOrdersDrawerContent({
  deliveries,
  metrics,
  restaurantSummary,
  lastUpdatedAt,
  selectedDeliveryId,
  onSelect,
  onShowOrders,
  onAutoAssign,
  isAutoAssigning,
  onOpen,
}: {
  deliveries: AdminLiveMapDelivery[]
  metrics: {
    total: number
    routeOrders: number
    liveTrips: number
    totalValue: number
    statusCounts: Record<AdminLiveMapDelivery["status"], number>
    delayed: number
    unassigned: number
    topOrder: AdminLiveMapDelivery | null
  }
  restaurantSummary: Array<{
    id: string
    name: string
    count: number
    totalValue: number
    delayed: number
    ready: number
    pickedUp: number
  }>
  lastUpdatedAt: string | null
  selectedDeliveryId: string | null
  onSelect: (delivery: AdminLiveMapDelivery, shouldFocus?: boolean) => void
  onShowOrders: () => void
  onAutoAssign: (orderId: string) => void
  isAutoAssigning: boolean
  onOpen: (path: string) => void
}) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-2">
          <LiveOrderMetricChip
            label="Active queue"
            value={metrics.total}
            icon={ListChecks}
            tone="border-pink-200 bg-pink-50 text-pink-700"
          />
          <LiveOrderMetricChip
            label="Total value"
            value={formatCurrency(metrics.totalValue)}
            icon={PackageCheck}
            tone="border-emerald-200 bg-emerald-50 text-emerald-700"
          />
          <LiveOrderMetricChip
            label="Ready/trips"
            value={metrics.routeOrders}
            icon={Send}
            tone="border-orange-200 bg-orange-50 text-orange-700"
          />
          <LiveOrderMetricChip
            label="Live map trips"
            value={metrics.liveTrips}
            icon={Route}
            tone="border-blue-200 bg-blue-50 text-blue-700"
          />
          <LiveOrderMetricChip
            label="Delayed"
            value={metrics.delayed}
            icon={AlertTriangle}
            tone="border-rose-200 bg-rose-50 text-rose-700"
          />
        </div>

        <Card size="sm" className="border-slate-200 bg-white shadow-none">
          <CardContent className="space-y-3 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              {liveOrderDrawerStatuses.map((status) => (
                <Badge
                  key={status}
                  variant="outline"
                  className={cn(
                    "rounded-full",
                    getDeliveryStatusBadgeClass(status)
                  )}
                >
                  {getDeliveryStatusLabel(status)}{" "}
                  {metrics.statusCounts[status]}
                </Badge>
              ))}
            </div>
            <div className="rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <p className="font-semibold text-slate-950">
                Top priority:{" "}
                {metrics.topOrder
                  ? `${metrics.topOrder.orderNumber} - ${getDeliveryQueueReason(metrics.topOrder)}`
                  : "No active order"}
              </p>
              <p className="mt-1">
                Last synced {formatDateTime(lastUpdatedAt)}
              </p>
              {metrics.unassigned > 0 ? (
                <p className="mt-1 font-semibold text-orange-600">
                  {metrics.unassigned} ready order needs rider assignment.
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card
          size="sm"
          className="overflow-hidden border-slate-200 bg-white shadow-none"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-3 border-b px-4">
            <div>
              <CardTitle className="text-sm font-black text-slate-950">
                Restaurant load
              </CardTitle>
              <p className="text-xs text-slate-500">
                Active queue and value by store.
              </p>
            </div>
            <Badge variant="secondary" className="rounded-full">
              {restaurantSummary.length} stores
            </Badge>
          </CardHeader>
          <div className="max-h-44 overflow-y-auto p-3">
            {restaurantSummary.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-500">
                No restaurant has an active order right now.
              </div>
            ) : null}
            <div className="space-y-2">
              {restaurantSummary.map((restaurant, index) => (
                <div
                  key={restaurant.id}
                  className="rounded-2xl border bg-white px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-950 text-[11px] font-black text-white">
                        {index + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-black text-slate-950">
                          {restaurant.name}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {restaurant.count} orders -{" "}
                          {formatCurrency(restaurant.totalValue)}
                        </span>
                      </span>
                    </span>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      {restaurant.ready > 0 ? (
                        <Badge className="rounded-full bg-pink-500">
                          {restaurant.ready} ready
                        </Badge>
                      ) : null}
                      {restaurant.pickedUp > 0 ? (
                        <Badge className="rounded-full bg-blue-500">
                          {restaurant.pickedUp} trip
                        </Badge>
                      ) : null}
                      {restaurant.delayed > 0 ? (
                        <Badge className="rounded-full bg-rose-600">
                          {restaurant.delayed} delayed
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card
          size="sm"
          className="overflow-hidden border-slate-200 bg-white shadow-none"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-3 border-b px-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm font-black text-slate-950">
                <ListChecks className="size-4 text-pink-500" />
                Active order queue
              </CardTitle>
              <p className="text-xs text-slate-500">
                Priority sorted from current operations data.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={onShowOrders}
            >
              Show layer
            </Button>
          </CardHeader>
          <div className="space-y-2 p-3">
            {deliveries.length === 0 ? (
              <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                No active order right now.
              </div>
            ) : null}
            {deliveries.map((delivery, index) => {
              const isSelected = selectedDeliveryId === delivery.id
              const canAutoAssign =
                delivery.status === "ReadyForPickup" && !delivery.rider
              const etaLabel = getDeliveryEtaLabel(delivery)
              const showReasonBadge = shouldShowDeliveryReasonBadge(delivery)

              return (
                <div
                  key={delivery.id}
                  className={cn(
                    "rounded-2xl border bg-white p-2.5 transition",
                    isSelected
                      ? "border-pink-300 bg-pink-50"
                      : "hover:border-pink-200"
                  )}
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => onSelect(delivery)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex min-w-0 items-start gap-2">
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-slate-950 text-[10px] font-black text-white">
                          {index + 1}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-black text-slate-950">
                            {delivery.orderNumber}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-slate-500">
                            {delivery.restaurant.name} -{" "}
                            {delivery.customer.name}
                          </span>
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded-full",
                            getDeliveryStatusBadgeClass(delivery.status)
                          )}
                        >
                          {getDeliveryStatusLabel(delivery.status)}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded-full",
                            getPaymentMethodBadgeClass(delivery.paymentMethod)
                          )}
                        >
                          {getPaymentMethodLabel(delivery.paymentMethod)}
                        </Badge>
                        {showReasonBadge ? (
                          <Badge
                            className={cn(
                              "rounded-full",
                              getDeliveryReasonBadgeClass(delivery)
                            )}
                          >
                            {getDeliveryQueueReason(delivery)}
                          </Badge>
                        ) : null}
                      </span>
                    </div>
                    <div className="mt-2 grid gap-1.5 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="size-3.5" />
                        {getDeliveryRealtimeLabel(delivery)}
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold text-slate-700">
                          {getDeliveryMapState(delivery)}
                        </span>
                        <span className="shrink-0 font-black text-slate-950">
                          {formatCurrency(delivery.total)}
                        </span>
                      </span>
                      {etaLabel ? (
                        <span className="flex items-center gap-1 font-semibold text-blue-600">
                          <Route className="size-3.5" />
                          {etaLabel}
                        </span>
                      ) : null}
                    </div>
                  </button>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-xl text-xs"
                      onClick={() => onSelect(delivery, true)}
                    >
                      <Crosshair className="size-4" />
                      Focus
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-xl text-xs"
                      onClick={() => onOpen(`/orders?orderId=${delivery.id}`)}
                    >
                      <ExternalLink className="size-4" />
                      Open
                    </Button>
                    {canAutoAssign ? (
                      <Button
                        size="sm"
                        className="col-span-2 h-8 rounded-xl bg-slate-950 text-xs hover:bg-slate-800"
                        disabled={isAutoAssigning}
                        onClick={() => onAutoAssign(delivery.id)}
                      >
                        {isAutoAssigning ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Send className="size-4" />
                        )}
                        Auto assign rider
                      </Button>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    </ScrollArea>
  )
}

function LiveOrderMetricChip({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  tone: string
}) {
  return (
    <div className={cn("rounded-2xl border px-3 py-2", tone)}>
      <div className="flex items-center justify-between gap-2">
        <Icon className="size-4" />
        <span className="text-base font-black">{value}</span>
      </div>
      <p className="mt-1 text-[11px] font-semibold">{label}</p>
    </div>
  )
}

function NearbyRidersPanel({
  riders,
  title = "Nearest riders",
  onOpen,
}: {
  riders: NearbyRiderCandidate[]
  title?: string
  onOpen: (path: string) => void
}) {
  if (!riders.length) {
    return (
      <div className="rounded-2xl border border-dashed bg-slate-50 px-4 py-3 text-sm font-medium text-slate-500">
        No nearby rider location is available right now.
      </div>
    )
  }

  return (
    <Card size="sm" className="bg-white">
      <CardHeader className="flex flex-row items-center justify-between gap-3 px-3">
        <CardTitle className="text-sm font-black text-slate-950">
          {title}
        </CardTitle>
        <Route className="size-4 text-pink-500" />
      </CardHeader>
      <CardContent className="space-y-2 px-3">
        {riders.map((candidate) => (
          <div
            key={candidate.rider.id}
            className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-950">
                {candidate.rider.fullName}
              </p>
              <p className="text-xs text-slate-500">
                {formatDistance(candidate.distanceKm)} away
                {(candidate.rider.activeOrderNumbers ?? []).length
                  ? ` - on ${candidate.rider.activeOrderNumbers.join(", ")}`
                  : ""}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Badge
                variant={
                  candidate.freshness === "live" ? "default" : "destructive"
                }
                className="rounded-full"
              >
                {candidate.freshness}
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                className="size-8 rounded-full p-0"
                onClick={() =>
                  onOpen(
                    `/riders?riderId=${candidate.rider.id}&riderTab=live-assignment`
                  )
                }
              >
                <ExternalLink className="size-4" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function DeliveryDetails({
  delivery,
  isAutoAssigning,
  isCancellingOrder,
  liveTripContext,
  nearbyRiders,
  onAutoAssign,
  onCancelOrder,
  onFocus,
  onOpen,
}: {
  delivery: AdminLiveMapDelivery
  isAutoAssigning: boolean
  isCancellingOrder: boolean
  liveTripContext: LiveTripSwitchContext
  nearbyRiders: NearbyRiderCandidate[]
  onAutoAssign: (orderId: string) => void
  onCancelOrder: (delivery: AdminLiveMapDelivery) => void
  onFocus: () => void
  onOpen: (path: string) => void
}) {
  const canAutoAssign = delivery.status === "ReadyForPickup" && !delivery.rider
  const canCancel = delivery.status === "ReadyForPickup"
  const destinationPoint = getDeliveryTargetPoint(delivery)
  const originPoint = getDeliveryOriginPoint(delivery)

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Badge className="rounded-full bg-slate-950">{delivery.status}</Badge>
        <Badge
          variant="outline"
          className={cn(
            "rounded-full",
            getPaymentMethodBadgeClass(delivery.paymentMethod)
          )}
        >
          {getPaymentMethodLabel(delivery.paymentMethod)}
        </Badge>
        {delivery.delaySeverity !== "none" ? (
          <Badge
            className={cn(
              "rounded-full",
              delivery.delaySeverity === "critical"
                ? "bg-rose-600"
                : "bg-amber-500"
            )}
          >
            {delivery.delayReason || "Needs attention"}
          </Badge>
        ) : (
          <Badge variant="secondary" className="rounded-full">
            On track
          </Badge>
        )}
      </div>
      <DetailRow label="Restaurant" value={delivery.restaurant.name} />
      <DetailRow label="Customer" value={delivery.customer.name} />
      <DetailRow
        label="Rider"
        value={delivery.rider?.fullName || "Unassigned"}
      />
      {delivery.rider ? (
        <DetailRow
          label="Rider load"
          value={`${delivery.rider.activeOrderCount ?? 0} active (${delivery.rider.readyOrderCount ?? 0} ready, ${delivery.rider.pickedUpOrderCount ?? 0} trip)`}
        />
      ) : null}
      {delivery.rider ? (
        <DetailRow
          label="Live trip"
          value={getLiveTripSummary(liveTripContext)}
        />
      ) : null}
      <DetailRow label="Next target" value={getDeliveryTargetLabel(delivery)} />
      <DetailRow label="Map state" value={getDeliveryMapState(delivery)} />
      <DetailRow
        label="Remaining"
        value={`${formatDistance(delivery.tracking.remainingDistanceKm)} - ${formatMinutes(delivery.tracking.remainingDurationMinutes)}`}
      />
      <DetailRow
        label="Last tracking"
        value={formatDateTime(delivery.tracking.lastUpdatedAt)}
      />
      <DetailRow
        label="Dropoff"
        value={
          delivery.customer.deliveryAddress.addressLine || "Address unavailable"
        }
      />
      <NearbyRidersPanel riders={nearbyRiders} onOpen={onOpen} />
      <div className="grid grid-cols-2 gap-2">
        <Button
          className="rounded-2xl bg-pink-500 hover:bg-pink-600"
          onClick={() => onOpen(`/orders?orderId=${delivery.id}`)}
        >
          Open order
        </Button>
        <Button
          variant="outline"
          className="rounded-2xl"
          onClick={() => openDirections(destinationPoint, originPoint)}
        >
          <Navigation className="size-4" />
          Directions
        </Button>
        <Button variant="outline" className="rounded-2xl" onClick={onFocus}>
          <Crosshair className="size-4" />
          Focus route
        </Button>
        <Button
          variant="outline"
          className="rounded-2xl"
          onClick={() =>
            onOpen(
              `/riders${delivery.rider?.id ? `?riderId=${delivery.rider.id}&riderTab=live-assignment` : ""}`
            )
          }
        >
          View rider
        </Button>
        {canAutoAssign ? (
          <Button
            className="rounded-2xl bg-slate-950 hover:bg-slate-800"
            disabled={isAutoAssigning}
            onClick={() => onAutoAssign(delivery.id)}
          >
            {isAutoAssigning ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Auto assign
          </Button>
        ) : null}
        {delivery.rider?.phone ? (
          <Button
            variant="outline"
            className="rounded-2xl"
            onClick={() => callPhone(delivery.rider?.phone)}
          >
            <Phone className="size-4" />
            Call rider
          </Button>
        ) : null}
        <Button
          variant="outline"
          className="rounded-2xl"
          onClick={() => callPhone(delivery.restaurant.phone)}
        >
          <Phone className="size-4" />
          Call store
        </Button>
        {canCancel ? (
          <Button
            variant="destructive"
            className="rounded-2xl"
            disabled={isCancellingOrder}
            onClick={() => onCancelOrder(delivery)}
          >
            {isCancellingOrder ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Ban className="size-4" />
            )}
            Cancel order
          </Button>
        ) : null}
      </div>
    </>
  )
}

function RiderDetails({
  rider,
  liveTripContext,
  nearbyRiders,
  onFocus,
  onOpen,
}: {
  rider: AdminLiveMapRider
  liveTripContext: LiveTripSwitchContext
  nearbyRiders: NearbyRiderCandidate[]
  onFocus: () => void
  onOpen: (path: string) => void
}) {
  const freshness = riderFreshness(rider)
  const riderPoint = getPoint(rider.currentLocation)
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Badge
          className={cn(
            "rounded-full",
            rider.isAvailableForAssignments ? "bg-emerald-600" : "bg-slate-700"
          )}
        >
          {rider.isAvailableForAssignments ? "Available" : "Unavailable"}
        </Badge>
        <Badge
          variant={freshness === "live" ? "default" : "destructive"}
          className="rounded-full"
        >
          {freshness === "live" ? "Live location" : "Stale location"}
        </Badge>
      </div>
      <DetailRow label="Phone" value={rider.phone || "Not added"} />
      <DetailRow
        label="Current order"
        value={
          (rider.activeOrderNumbers ?? []).length
            ? rider.activeOrderNumbers.join(", ")
            : "No active trip"
        }
      />
      <DetailRow
        label="Active load"
        value={`${rider.activeOrderCount ?? 0} active (${rider.readyOrderCount ?? 0} ready, ${rider.pickedUpOrderCount ?? 0} trip)`}
      />
      <DetailRow
        label="Live trip"
        value={getLiveTripSummary(liveTripContext)}
      />
      <DetailRow
        label="Last location"
        value={formatDateTime(rider.currentLocation?.lastUpdatedAt)}
      />
      <DetailRow
        label="Speed"
        value={`${Math.round(rider.currentLocation?.speedKmph ?? 0)} km/h`}
      />
      {(rider.activeOrderCount ?? 0) > 0 ? (
        <NearbyRidersPanel
          riders={nearbyRiders}
          title="Riders near this trip target"
          onOpen={onOpen}
        />
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Button
          className="rounded-2xl bg-slate-950 hover:bg-slate-800"
          onClick={() =>
            onOpen(`/riders?riderId=${rider.id}&riderTab=live-assignment`)
          }
        >
          Open rider
        </Button>
        <Button variant="outline" className="rounded-2xl" onClick={onFocus}>
          <Crosshair className="size-4" />
          Focus
        </Button>
        <Button
          variant="outline"
          className="rounded-2xl"
          onClick={() => openMapMarker(riderPoint, "Rider location")}
        >
          <Navigation className="size-4" />
          Marker
        </Button>
        <Button
          variant="outline"
          className="rounded-2xl"
          onClick={() => callPhone(rider.phone)}
        >
          <Phone className="size-4" />
          Call rider
        </Button>
        {rider.liveOrderId ? (
          <Button
            variant="outline"
            className="rounded-2xl"
            onClick={() => onOpen(`/orders?orderId=${rider.liveOrderId}`)}
          >
            Open order
          </Button>
        ) : null}
      </div>
    </>
  )
}

function RestaurantDetails({
  restaurant,
  nearbyRiders,
  onFocus,
  onOpen,
}: {
  restaurant: AdminLiveMapRestaurant
  nearbyRiders: NearbyRiderCandidate[]
  onFocus: () => void
  onOpen: (path: string) => void
}) {
  const statusEntries = liveOrderDrawerStatuses
    .map((status) => ({
      status,
      count: restaurant.statusCounts[status] ?? 0,
    }))
    .filter((entry) => entry.count > 0)

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Badge
          className={cn(
            "rounded-full",
            restaurant.isOnline ? "bg-emerald-600" : "bg-slate-700"
          )}
        >
          {restaurant.isOnline ? "Online" : "Offline"}
        </Badge>
        {restaurant.delayedOrders > 0 ? (
          <Badge className="rounded-full bg-rose-600">
            {restaurant.delayedOrders} delayed
          </Badge>
        ) : (
          <Badge variant="secondary" className="rounded-full">
            No delay
          </Badge>
        )}
      </div>
      <DetailRow label="Live orders" value={restaurant.activeOrders} />
      <DetailRow
        label="Ready / picked"
        value={`${restaurant.readyForPickup} ready - ${restaurant.pickedUp} picked`}
      />
      <DetailRow
        label="Latest order"
        value={restaurant.latestOrder?.orderNumber || "No active order"}
      />
      {statusEntries.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 rounded-2xl bg-slate-50 px-4 py-3">
          {statusEntries.map((entry) => (
            <Badge
              key={entry.status}
              variant="outline"
              className={cn(
                "rounded-full",
                getDeliveryStatusBadgeClass(entry.status)
              )}
            >
              {getDeliveryStatusLabel(entry.status)} {entry.count}
            </Badge>
          ))}
        </div>
      ) : null}
      <DetailRow label="Phone" value={restaurant.phone || "Not added"} />
      <DetailRow
        label="Address"
        value={restaurant.address || restaurant.city || "Address unavailable"}
      />
      <NearbyRidersPanel riders={nearbyRiders} onOpen={onOpen} />
      <div className="grid grid-cols-2 gap-2">
        <Button
          className="rounded-2xl bg-pink-500 hover:bg-pink-600"
          onClick={() => onOpen(`/restaurants?restaurantId=${restaurant.id}`)}
        >
          Open restaurant
        </Button>
        <Button
          variant="outline"
          className="rounded-2xl"
          onClick={() => openDirections(getPoint(restaurant))}
        >
          <Navigation className="size-4" />
          Directions
        </Button>
        <Button variant="outline" className="rounded-2xl" onClick={onFocus}>
          <Crosshair className="size-4" />
          Focus
        </Button>
        <Button
          variant="outline"
          className="rounded-2xl"
          onClick={() => callPhone(restaurant.phone)}
        >
          <Phone className="size-4" />
          Call store
        </Button>
      </div>
      {restaurant.latestOrder ? (
        <Button
          variant="outline"
          className="w-full rounded-2xl"
          onClick={() =>
            onOpen(`/orders?orderId=${restaurant.latestOrder?.id}`)
          }
        >
          Open latest order
        </Button>
      ) : null}
    </>
  )
}
