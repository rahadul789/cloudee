import * as React from "react"
import L from "leaflet"
import {
  Circle,
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet"
import "leaflet/dist/leaflet.css"
// NOTE: leaflet.heat is a classic plugin that references a bare global `L` at load time,
// which does not exist under ESM bundling ("L is not defined" → white screen). It is loaded
// lazily inside LeafletHeatLayer AFTER exposing `window.L`, never as a static top-level import.
import {
  CircleF,
  GoogleMap,
  HeatmapLayerF,
  InfoWindowF,
  MarkerF,
  useJsApiLoader,
} from "@react-google-maps/api"
import { useQuery } from "@tanstack/react-query"
import {
  Coins,
  Grid3x3,
  Hash,
  Loader2,
  LocateFixed,
  MapPinned,
  ShoppingBag,
  Flame,
} from "lucide-react"

import {
  getAdminOrderMap,
  type AdminOrderMapPoint,
} from "@/lib/admin-api"
import {
  getAdminZoneScopeKey,
  subscribeAdminZoneScope,
} from "@/lib/admin-zone-scope"

declare global {
  interface Window {
    // Google Maps calls this global on auth/billing/quota failures.
    gm_authFailure?: () => void
  }
}

// Browser Maps JavaScript API key. Set VITE_GOOGLE_MAPS_API_KEY in admin-web to use
// Google Maps; when it's absent OR Google fails at runtime (billing/quota/referrer error,
// script load error, or any render error) the page automatically falls back to Leaflet+OSM.
const GOOGLE_MAPS_KEY =
  (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() ?? ""
// Stable ref — useJsApiLoader warns if this array identity changes between renders.
const GOOGLE_MAPS_LIBRARIES: ("visualization")[] = ["visualization"]

// Netrokona town centre — fallback camera when there are no points to fit.
const NETROKONA_CENTER: [number, number] = [24.8835, 90.7271]
const DEFAULT_ZOOM = 14
// Comfortable zoom when centring on the admin's own GPS position.
const LOCATE_ZOOM = 15
// Never zoom past this when auto-fitting, so a single order (or a tight cluster) still
// shows some surrounding context instead of slamming to max zoom.
const MAX_FIT_ZOOM = 16
// In grid view, at/above this zoom individual order points are also revealed.
const POINTS_REVEAL_ZOOM = 15
// Grid cell size in degrees (~250m) for the aggregated demand view.
const GRID_SIZE_DEG = 0.0025

type ViewMode = "grid" | "points" | "heat"
type Metric = "amount" | "count"
type DatePresetValue = "today" | "yesterday" | "7d" | "30d" | "month" | "all"
type StatusValue =
  | "all"
  | "Delivered"
  | "PickedUp"
  | "Preparing"
  | "New"
  | "Cancelled"

const DATE_PRESETS: Array<{ value: DatePresetValue; label: string }> = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "month", label: "This month" },
  { value: "all", label: "All time" },
]

const STATUS_OPTIONS: Array<{ value: StatusValue; label: string }> = [
  { value: "all", label: "All orders" },
  { value: "Delivered", label: "Delivered" },
  { value: "PickedUp", label: "Picked up" },
  { value: "Preparing", label: "Preparing" },
  { value: "New", label: "New" },
  { value: "Cancelled", label: "Cancelled" },
]

function backendPreset(value: DatePresetValue): string | undefined {
  switch (value) {
    case "today":
      return "today"
    case "yesterday":
      return "yesterday"
    case "30d":
      return "last30Days"
    case "month":
      return "thisMonth"
    case "all":
      return "lifetime"
    case "7d":
    default:
      return undefined
  }
}

const HEAT_STOPS = [
  "#fde68a",
  "#fdba74",
  "#fb923c",
  "#f97316",
  "#ef4444",
  "#b91c1c",
]
function heatColor(t: number) {
  const clamped = Math.min(1, Math.max(0, t))
  const idx = Math.min(HEAT_STOPS.length - 1, Math.floor(clamped * HEAT_STOPS.length))
  return HEAT_STOPS[idx]
}

function formatTk(value: number) {
  return `৳${Math.round(value).toLocaleString("en-US")}`
}

function formatDateTime(value: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

type GridCell = {
  key: string
  lat: number
  lng: number
  count: number
  amount: number
}

function aggregateToGrid(points: AdminOrderMapPoint[]): GridCell[] {
  const cells = new Map<string, GridCell>()
  for (const point of points) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue
    const gy = Math.floor(point.lat / GRID_SIZE_DEG)
    const gx = Math.floor(point.lng / GRID_SIZE_DEG)
    const key = `${gy}:${gx}`
    const existing = cells.get(key)
    if (existing) {
      existing.count += 1
      existing.amount += point.amount
    } else {
      cells.set(key, {
        key,
        lat: (gy + 0.5) * GRID_SIZE_DEG,
        lng: (gx + 0.5) * GRID_SIZE_DEG,
        count: 1,
        amount: point.amount,
      })
    }
  }
  return [...cells.values()]
}

type Bounds = { minLat: number; maxLat: number; minLng: number; maxLng: number }

function computeBounds(points: AdminOrderMapPoint[]): Bounds | null {
  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity
  for (const point of points) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue
    minLat = Math.min(minLat, point.lat)
    maxLat = Math.max(maxLat, point.lat)
    minLng = Math.min(minLng, point.lng)
    maxLng = Math.max(maxLng, point.lng)
  }
  if (!Number.isFinite(minLat)) return null
  return { minLat, maxLat, minLng, maxLng }
}

function cellPopupHtml(cell: GridCell) {
  return {
    amount: formatTk(cell.amount),
    count: `${cell.count} order${cell.count === 1 ? "" : "s"} in this area`,
    avg: `Avg ${formatTk(cell.amount / Math.max(1, cell.count))}`,
  }
}

type UserLocation = { lat: number; lng: number; accuracy: number } | null

// Watches the admin's own GPS so the map can show a "you are here" blue dot. Silent on
// denial/unavailable — it's an optional aid, never blocks the map.
function useUserLocation() {
  const [location, setLocation] = React.useState<UserLocation>(null)
  React.useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return
    const watchId = navigator.geolocation.watchPosition(
      (position) =>
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 },
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [])
  return location
}

type AreaStat = { area: string; count: number; amount: number }

function topAreas(points: AdminOrderMapPoint[], metric: Metric): AreaStat[] {
  const byArea = new Map<string, AreaStat>()
  for (const point of points) {
    const area = point.area?.trim() || "Unknown area"
    const existing = byArea.get(area) ?? { area, count: 0, amount: 0 }
    existing.count += 1
    existing.amount += point.amount
    byArea.set(area, existing)
  }
  return [...byArea.values()]
    .sort((a, b) =>
      metric === "amount" ? b.amount - a.amount : b.count - a.count,
    )
    .slice(0, 5)
}

type SharedMapProps = {
  points: AdminOrderMapPoint[]
  cells: GridCell[]
  view: ViewMode
  metric: Metric
  maxCellValue: number
  revealPoints: boolean
  bounds: Bounds | null
  fitKey: string
  onZoom: (zoom: number) => void
  userLocation: UserLocation
  flyToUserSignal: number
}

/* ────────────────────────── Leaflet map (fallback + default) ────────────────────────── */

// Exposes Leaflet as a global and loads the leaflet.heat plugin once, on demand. Returns a
// promise that resolves when L.heatLayer is available. Kept module-level so repeated mounts
// share a single load.
let leafletHeatPromise: Promise<void> | null = null
function ensureLeafletHeat(): Promise<void> {
  if (typeof (L as unknown as { heatLayer?: unknown }).heatLayer === "function") {
    return Promise.resolve()
  }
  if (!leafletHeatPromise) {
    // The plugin reads a bare global `L` at evaluation — set it BEFORE importing it.
    ;(window as unknown as { L: typeof L }).L = L
    leafletHeatPromise = import("leaflet.heat").then(() => undefined)
  }
  return leafletHeatPromise
}

function LeafletHeatLayer({
  points,
  metric,
}: {
  points: AdminOrderMapPoint[]
  metric: Metric
}) {
  const map = useMap()
  const [ready, setReady] = React.useState(
    typeof (L as unknown as { heatLayer?: unknown }).heatLayer === "function",
  )
  React.useEffect(() => {
    let active = true
    void ensureLeafletHeat().then(() => {
      if (active) setReady(true)
    })
    return () => {
      active = false
    }
  }, [])
  React.useEffect(() => {
    if (!ready || !points.length) return undefined
    const maxAmount = Math.max(1, ...points.map((point) => point.amount))
    const heatData: [number, number, number][] = points
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
      .map((point) => [
        point.lat,
        point.lng,
        metric === "amount" ? point.amount / maxAmount : 1,
      ])
    const layer = (
      L as unknown as {
        heatLayer: (data: [number, number, number][], options: object) => L.Layer
      }
    ).heatLayer(heatData, {
      radius: 26,
      blur: 20,
      maxZoom: 17,
      max: metric === "amount" ? 3 : 6,
      gradient: {
        0.2: "#fde68a",
        0.4: "#fb923c",
        0.65: "#f97316",
        0.85: "#ef4444",
        1: "#b91c1c",
      },
    })
    layer.addTo(map)
    return () => {
      map.removeLayer(layer)
    }
  }, [map, points, metric, ready])
  return null
}

function LeafletZoomTracker({ onZoom }: { onZoom: (zoom: number) => void }) {
  const map = useMapEvents({
    zoomend: (event) => onZoom((event.target as L.Map).getZoom()),
  })
  React.useEffect(() => {
    onZoom(map.getZoom())
  }, [map, onZoom])
  return null
}

function LeafletFitBounds({
  bounds,
  fitKey,
}: {
  bounds: Bounds | null
  fitKey: string
}) {
  const map = useMap()
  React.useEffect(() => {
    if (!bounds) {
      map.setView(NETROKONA_CENTER, DEFAULT_ZOOM)
      return
    }
    const latLngBounds = L.latLngBounds(
      [bounds.minLat, bounds.minLng],
      [bounds.maxLat, bounds.maxLng],
    )
    map.fitBounds(latLngBounds, { padding: [60, 60], maxZoom: MAX_FIT_ZOOM })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey])
  return null
}

function LeafletFlyToUser({
  userLocation,
  signal,
}: {
  userLocation: UserLocation
  signal: number
}) {
  const map = useMap()
  React.useEffect(() => {
    if (signal > 0 && userLocation) {
      map.setView(
        [userLocation.lat, userLocation.lng],
        Math.max(map.getZoom(), LOCATE_ZOOM),
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal])
  return null
}

function LeafletOrderMap({
  points,
  cells,
  view,
  metric,
  maxCellValue,
  revealPoints,
  bounds,
  fitKey,
  onZoom,
  userLocation,
  flyToUserSignal,
}: SharedMapProps) {
  return (
    <MapContainer
      center={NETROKONA_CENTER}
      zoom={DEFAULT_ZOOM}
      className="h-full w-full"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <LeafletFitBounds bounds={bounds} fitKey={fitKey} />
      <LeafletZoomTracker onZoom={onZoom} />
      <LeafletFlyToUser userLocation={userLocation} signal={flyToUserSignal} />

      {userLocation ? (
        <>
          <Circle
            center={[userLocation.lat, userLocation.lng]}
            radius={Math.min(userLocation.accuracy, 200)}
            pathOptions={{
              color: "#1a73e8",
              weight: 1,
              fillColor: "#1a73e8",
              fillOpacity: 0.1,
            }}
          />
          <CircleMarker
            center={[userLocation.lat, userLocation.lng]}
            radius={7}
            pathOptions={{
              color: "#ffffff",
              weight: 2.5,
              fillColor: "#1a73e8",
              fillOpacity: 1,
            }}
          >
            <Popup>Your location</Popup>
          </CircleMarker>
        </>
      ) : null}

      {view === "heat" ? (
        <LeafletHeatLayer points={points} metric={metric} />
      ) : null}

      {view === "grid"
        ? cells.map((cell) => {
            const value = metric === "amount" ? cell.amount : cell.count
            const t = maxCellValue > 0 ? value / maxCellValue : 0
            const color = heatColor(t)
            const popup = cellPopupHtml(cell)
            return (
              <CircleMarker
                key={cell.key}
                center={[cell.lat, cell.lng]}
                radius={13 + t * 22}
                pathOptions={{
                  color,
                  weight: 1.5,
                  fillColor: color,
                  fillOpacity: 0.6,
                }}
              >
                <Popup>
                  <div className="space-y-1 text-xs">
                    <div className="text-sm font-semibold text-rose-700">
                      {popup.amount}
                    </div>
                    <div className="text-slate-600">{popup.count}</div>
                    <div className="text-slate-500">{popup.avg}</div>
                  </div>
                </Popup>
              </CircleMarker>
            )
          })
        : null}

      {view === "points" || revealPoints
        ? points.map((point, index) => (
            <CircleMarker
              key={`${point.orderNumber}-${index}`}
              center={[point.lat, point.lng]}
              radius={7}
              pathOptions={{
                color: "#be123c",
                weight: 1.5,
                fillColor: "#fb7185",
                fillOpacity: 0.9,
              }}
            >
              <Popup>
                <PointPopupBody point={point} />
              </Popup>
            </CircleMarker>
          ))
        : null}
    </MapContainer>
  )
}

function PointPopupBody({ point }: { point: AdminOrderMapPoint }) {
  return (
    <div className="space-y-1 text-xs">
      <div className="text-sm font-semibold text-rose-700">
        {formatTk(point.amount)}
      </div>
      <div className="font-medium text-slate-800">#{point.orderNumber || "—"}</div>
      {point.restaurantName ? (
        <div className="text-slate-600">{point.restaurantName}</div>
      ) : null}
      {point.area ? <div className="text-slate-500">{point.area}</div> : null}
      <div className="flex items-center justify-between gap-3 pt-1 text-slate-500">
        <span>{point.status}</span>
        <span>{formatDateTime(point.createdAt)}</span>
      </div>
    </div>
  )
}

/* ────────────────────────── Google map ────────────────────────── */

type GoogleSelection =
  | { kind: "cell"; cell: GridCell }
  | { kind: "point"; point: AdminOrderMapPoint }
  | null

function GoogleOrderMap({
  props,
  onFail,
}: {
  props: SharedMapProps
  onFail: () => void
}) {
  const {
    points,
    cells,
    view,
    metric,
    maxCellValue,
    revealPoints,
    bounds,
    fitKey,
    onZoom,
    userLocation,
    flyToUserSignal,
  } = props
  const { isLoaded, loadError } = useJsApiLoader({
    id: "foodbela-google-map",
    googleMapsApiKey: GOOGLE_MAPS_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
  })
  const mapRef = React.useRef<google.maps.Map | null>(null)
  const [selection, setSelection] = React.useState<GoogleSelection>(null)

  // Script/network load failure → fall back to Leaflet.
  React.useEffect(() => {
    if (loadError) onFail()
  }, [loadError, onFail])

  const fitToBounds = React.useCallback(() => {
    const map = mapRef.current
    if (!map) return
    if (!bounds) {
      map.setCenter({ lat: NETROKONA_CENTER[0], lng: NETROKONA_CENTER[1] })
      map.setZoom(DEFAULT_ZOOM)
      return
    }
    const latLngBounds = new google.maps.LatLngBounds(
      { lat: bounds.minLat, lng: bounds.minLng },
      { lat: bounds.maxLat, lng: bounds.maxLng },
    )
    map.fitBounds(latLngBounds, 60)
    google.maps.event.addListenerOnce(map, "idle", () => {
      const zoom = map.getZoom()
      if (typeof zoom === "number" && zoom > MAX_FIT_ZOOM) map.setZoom(MAX_FIT_ZOOM)
    })
  }, [bounds])

  // Refit whenever the data set changes.
  React.useEffect(() => {
    fitToBounds()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, isLoaded])

  // Centre on the admin's own GPS when the locate button is pressed.
  React.useEffect(() => {
    const map = mapRef.current
    if (flyToUserSignal > 0 && userLocation && map) {
      map.panTo({ lat: userLocation.lat, lng: userLocation.lng })
      const zoom = map.getZoom()
      if (typeof zoom === "number" && zoom < LOCATE_ZOOM) map.setZoom(LOCATE_ZOOM)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyToUserSignal])

  const heatmapData = React.useMemo(() => {
    if (!isLoaded || view !== "heat") return []
    const maxAmount = Math.max(1, ...points.map((point) => point.amount))
    return points
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
      .map((point) => ({
        location: new google.maps.LatLng(point.lat, point.lng),
        weight: metric === "amount" ? point.amount / maxAmount : 1,
      }))
  }, [isLoaded, view, points, metric])

  if (loadError) return null
  if (!isLoaded) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-100">
        <Loader2 className="size-6 animate-spin text-slate-400" />
      </div>
    )
  }

  const circleSymbol = (
    color: string,
    scale: number,
    fillOpacity: number,
  ): google.maps.Symbol => ({
    path: google.maps.SymbolPath.CIRCLE,
    scale,
    fillColor: color,
    fillOpacity,
    strokeColor: color,
    strokeWeight: 1,
  })

  return (
    <GoogleMap
      mapContainerClassName="h-full w-full"
      center={{ lat: NETROKONA_CENTER[0], lng: NETROKONA_CENTER[1] }}
      zoom={DEFAULT_ZOOM}
      onLoad={(map) => {
        mapRef.current = map
        fitToBounds()
      }}
      onUnmount={() => {
        mapRef.current = null
      }}
      onZoomChanged={() => {
        const zoom = mapRef.current?.getZoom()
        if (typeof zoom === "number") onZoom(zoom)
      }}
      onClick={() => setSelection(null)}
      options={{
        streetViewControl: false,
        mapTypeControl: true,
        fullscreenControl: false,
        clickableIcons: false,
      }}
    >
      {view === "heat" ? (
        <HeatmapLayerF
          data={heatmapData}
          options={{
            radius: 26,
            opacity: 0.7,
            maxIntensity: metric === "amount" ? 3 : 6,
          }}
        />
      ) : null}

      {view === "grid"
        ? cells.map((cell) => {
            const value = metric === "amount" ? cell.amount : cell.count
            const t = maxCellValue > 0 ? value / maxCellValue : 0
            const color = heatColor(t)
            return (
              <MarkerF
                key={cell.key}
                position={{ lat: cell.lat, lng: cell.lng }}
                icon={circleSymbol(color, 10 + t * 24, 0.6)}
                onClick={() => setSelection({ kind: "cell", cell })}
              />
            )
          })
        : null}

      {view === "points" || revealPoints
        ? points.map((point, index) => (
            <MarkerF
              key={`${point.orderNumber}-${index}`}
              position={{ lat: point.lat, lng: point.lng }}
              icon={circleSymbol("#e11d48", 7, 0.9)}
              onClick={() => setSelection({ kind: "point", point })}
            />
          ))
        : null}

      {userLocation ? (
        <>
          <CircleF
            center={{ lat: userLocation.lat, lng: userLocation.lng }}
            radius={Math.min(userLocation.accuracy, 200)}
            options={{
              strokeColor: "#1a73e8",
              strokeWeight: 1,
              fillColor: "#1a73e8",
              fillOpacity: 0.1,
              clickable: false,
            }}
          />
          <MarkerF
            position={{ lat: userLocation.lat, lng: userLocation.lng }}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: 7,
              fillColor: "#1a73e8",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2.5,
            }}
            zIndex={9999}
          />
        </>
      ) : null}

      {selection?.kind === "cell" ? (
        <InfoWindowF
          position={{ lat: selection.cell.lat, lng: selection.cell.lng }}
          onCloseClick={() => setSelection(null)}
        >
          <div className="space-y-1 text-xs">
            <div className="text-sm font-semibold text-rose-700">
              {cellPopupHtml(selection.cell).amount}
            </div>
            <div className="text-slate-600">
              {cellPopupHtml(selection.cell).count}
            </div>
            <div className="text-slate-500">
              {cellPopupHtml(selection.cell).avg}
            </div>
          </div>
        </InfoWindowF>
      ) : null}

      {selection?.kind === "point" ? (
        <InfoWindowF
          position={{ lat: selection.point.lat, lng: selection.point.lng }}
          onCloseClick={() => setSelection(null)}
        >
          <PointPopupBody point={selection.point} />
        </InfoWindowF>
      ) : null}
    </GoogleMap>
  )
}

/* ────────────────────────── Error boundary (any Google failure → Leaflet) ────────────────────────── */

class GoogleMapErrorBoundary extends React.Component<
  { onError: () => void; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch() {
    this.props.onError()
  }
  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}

/* ────────────────────────── Page ────────────────────────── */

export function OrderMapPage() {
  const [preset, setPreset] = React.useState<DatePresetValue>("today")
  const [status, setStatus] = React.useState<StatusValue>("all")
  const [view, setView] = React.useState<ViewMode>("grid")
  const [metric, setMetric] = React.useState<Metric>("amount")
  const [zoom, setZoom] = React.useState(DEFAULT_ZOOM)
  const [scopeKey, setScopeKey] = React.useState(() => getAdminZoneScopeKey())
  const [googleFailed, setGoogleFailed] = React.useState(false)
  const [flyToUserSignal, setFlyToUserSignal] = React.useState(0)
  const userLocation = useUserLocation()

  React.useEffect(
    () => subscribeAdminZoneScope(() => setScopeKey(getAdminZoneScopeKey())),
    [],
  )

  // Google fires this global on billing/quota/referrer auth errors (which happen AFTER the
  // script loads) — the signal that Google is no longer usable → switch to Leaflet.
  React.useEffect(() => {
    if (!GOOGLE_MAPS_KEY) return
    const previous = window.gm_authFailure
    window.gm_authFailure = () => setGoogleFailed(true)
    return () => {
      window.gm_authFailure = previous
    }
  }, [])

  const query = useQuery({
    queryKey: ["admin-order-map", preset, status, scopeKey],
    queryFn: () =>
      getAdminOrderMap({
        preset: backendPreset(preset),
        status: status === "all" ? undefined : status,
      }),
  })

  const points = React.useMemo(() => query.data?.points ?? [], [query.data])
  const summary = query.data?.summary
  const cells = React.useMemo(() => aggregateToGrid(points), [points])
  const maxCellValue = React.useMemo(
    () =>
      cells.reduce(
        (max, cell) => Math.max(max, metric === "amount" ? cell.amount : cell.count),
        0,
      ),
    [cells, metric],
  )
  const bounds = React.useMemo(() => computeBounds(points), [points])
  const fitKey = `${preset}:${status}:${scopeKey}:${points.length}`
  const revealPoints = view === "grid" && zoom >= POINTS_REVEAL_ZOOM
  const areas = React.useMemo(() => topAreas(points, metric), [points, metric])

  const useGoogle = Boolean(GOOGLE_MAPS_KEY) && !googleFailed
  const sharedProps: SharedMapProps = {
    points,
    cells,
    view,
    metric,
    maxCellValue,
    revealPoints,
    bounds,
    fitKey,
    onZoom: setZoom,
    userLocation,
    flyToUserSignal,
  }

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] overflow-hidden bg-slate-950">
      <div className="absolute inset-0 z-0 [&_.leaflet-control-container]:!z-[20] [&_.leaflet-pane]:!z-[1]">
        {useGoogle ? (
          <GoogleMapErrorBoundary onError={() => setGoogleFailed(true)}>
            <GoogleOrderMap props={sharedProps} onFail={() => setGoogleFailed(true)} />
          </GoogleMapErrorBoundary>
        ) : (
          <LeafletOrderMap {...sharedProps} />
        )}
      </div>

      {/* Controls panel */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[30] flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur sm:w-auto">
          <div className="flex items-center gap-2">
            <MapPinned className="size-5 text-rose-600" />
            <h1 className="text-base font-semibold text-slate-900">Order Map</h1>
            {query.isFetching ? (
              <Loader2 className="size-4 animate-spin text-slate-400" />
            ) : null}
            <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
              {useGoogle ? "Google" : "OSM"}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Where customers order from, and how much.
          </p>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <SummaryTile
              icon={<ShoppingBag className="size-3.5" />}
              label="Orders"
              value={(summary?.totalOrders ?? 0).toLocaleString("en-US")}
            />
            <SummaryTile
              icon={<Coins className="size-3.5" />}
              label="Amount"
              value={formatTk(summary?.totalAmount ?? 0)}
            />
            <SummaryTile
              icon={<Hash className="size-3.5" />}
              label="Avg order"
              value={formatTk(summary?.averageOrderValue ?? 0)}
            />
          </div>
          {summary?.truncated ? (
            <p className="mt-2 text-[11px] text-amber-600">
              Showing the latest {summary.totalOrders.toLocaleString("en-US")} of{" "}
              {summary.totalMatching.toLocaleString("en-US")} orders. Narrow the date
              range to see all.
            </p>
          ) : null}

          <div className="mt-3 space-y-2">
            <ChipRow<DatePresetValue>
              options={DATE_PRESETS}
              value={preset}
              onChange={setPreset}
            />
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as StatusValue)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {areas.length > 0 ? (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Top areas
              </div>
              <div className="space-y-1">
                {areas.map((area, index) => (
                  <div
                    key={area.area}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="text-slate-400">{index + 1}.</span>
                      <span className="truncate text-slate-700">{area.area}</span>
                    </span>
                    <span className="shrink-0 font-medium text-slate-900">
                      {metric === "amount"
                        ? formatTk(area.amount)
                        : `${area.count} order${area.count === 1 ? "" : "s"}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {points.length === 0 && !query.isLoading ? (
            <p className="mt-3 rounded-lg bg-slate-50 px-2 py-2 text-center text-xs text-slate-500">
              No mappable orders in this range.
            </p>
          ) : null}
        </div>

        <div className="pointer-events-auto flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-xl backdrop-blur">
          <div className="flex gap-1">
            <ToggleButton
              active={view === "grid"}
              onClick={() => setView("grid")}
              icon={<Grid3x3 className="size-4" />}
              label="Grid"
            />
            <ToggleButton
              active={view === "points"}
              onClick={() => setView("points")}
              icon={<MapPinned className="size-4" />}
              label="Points"
            />
            <ToggleButton
              active={view === "heat"}
              onClick={() => setView("heat")}
              icon={<Flame className="size-4" />}
              label="Heat"
            />
          </div>
          <div className="flex gap-1">
            <ToggleButton
              active={metric === "amount"}
              onClick={() => setMetric("amount")}
              icon={<Coins className="size-4" />}
              label="৳ Amount"
            />
            <ToggleButton
              active={metric === "count"}
              onClick={() => setMetric("count")}
              icon={<Hash className="size-4" />}
              label="Count"
            />
          </div>
          <button
            type="button"
            onClick={() => setFlyToUserSignal((value) => value + 1)}
            disabled={!userLocation}
            title={
              userLocation
                ? "Centre on my location"
                : "Waiting for GPS permission…"
            }
            className={
              userLocation
                ? "flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                : "flex items-center justify-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-400"
            }
          >
            <LocateFixed className="size-4" />
            My location
          </button>
        </div>
      </div>

      {view !== "points" ? (
        <div className="pointer-events-none absolute bottom-6 left-4 z-[30] rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-[11px] shadow-lg backdrop-blur">
          <div className="mb-1 font-medium text-slate-700">
            {metric === "amount" ? "Order value" : "Order count"}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-slate-400">Low</span>
            <div className="flex">
              {HEAT_STOPS.map((color) => (
                <span
                  key={color}
                  className="h-3 w-5"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <span className="text-slate-400">High</span>
          </div>
          {view === "grid" ? (
            <div className="mt-1 text-slate-400">Zoom in for exact order points</div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function SummaryTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-400">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  )
}

function ChipRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={
            option.value === value
              ? "rounded-full bg-rose-600 px-2.5 py-1 text-xs font-medium text-white"
              : "rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function ToggleButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "flex items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white"
          : "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
      }
    >
      {icon}
      {label}
    </button>
  )
}
