import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import MapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  type Region,
} from "react-native-maps";

import type { LatLng } from "@/src/lib/polyline";
import { useDeviceHeading } from "@/src/hooks/use-device-heading";

export type MapRoute = {
  key: string;
  coords: LatLng[];
  // Dashed = a secondary/estimated leg (a non-live order, or a straight-line fallback);
  // solid = the order currently sharing live location.
  dashed?: boolean;
};

export type MapStop = {
  id: string;
  kind: "pickup" | "drop";
  latitude: number;
  longitude: number;
  label?: string;
  // For pickup pins: how many orders sit at this restaurant (shown as a count badge so the
  // rider can see where orders cluster and plan a batched pickup/drop route).
  count?: number;
  // Ring color reflecting order status (preparing = amber, ready = green, delivering = …)
  // so the rider can read state at a glance. Defaults to white.
  statusColor?: string;
  // This stop's order is the one currently sharing live location — show a red LIVE dot.
  live?: boolean;
  // Pin corner indicator: "prep" = amber clock (a nearly-ready heads-up, NOT an alarm);
  // "late" = red alert (pickup/delivery is actually past its threshold — act now).
  alert?: "prep" | "late";
  // Minutes past the late threshold, shown beside the red alert icon (e.g. "3m").
  alertMinutes?: number;
  focused?: boolean;
};

export type MapRider = {
  latitude: number;
  longitude: number;
  heading?: number | null;
};

export type DeliveryMapHandle = {
  animateTo: (coord: LatLng, delta?: number) => void;
  fit: () => void;
};

const PICKUP_COLOR = "#EC1C63";
const DROP_COLOR = "#16A34A";
const RIDER_COLOR = "#2563EB";
const ROUTE_COLOR = "#EC1C63";
const ROUTE_COLOR_FADED = "rgba(236,28,99,0.45)";

// Minimal map: hide business POIs, transit, and road icons so the rider's own pins stand
// out and the map isn't cluttered with information they don't need.
const MAP_STYLE = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
];

const FALLBACK_REGION: Region = {
  latitude: 23.78,
  longitude: 90.4,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

function isValidCoord(lat?: number | null, lng?: number | null) {
  return (
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    typeof lng === "number" &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0)
  );
}

// Safe, reusable rider map. Renders custom pins + route, exposes an imperative handle for
// recenter/fit. When `showUserLocation` is on it uses the OS blue-dot (real GPS); otherwise
// it draws the rider dot from the `rider` prop (the already-tracked location).
export const DeliveryMap = forwardRef<DeliveryMapHandle, {
  stops: MapStop[];
  rider?: MapRider | null;
  routeCoords?: LatLng[];
  routeDashed?: boolean;
  // Multiple routes at once (home map): the live order solid, the rest dashed.
  routes?: MapRoute[];
  style?: StyleProp<ViewStyle>;
  liteMode?: boolean;
  showUserLocation?: boolean;
  fitPadding?: { top: number; right: number; bottom: number; left: number };
  onStopPress?: (id: string) => void;
}>(function DeliveryMap(
  {
    stops,
    rider,
    routeCoords,
    routeDashed = false,
    routes,
    style,
    liteMode = false,
    showUserLocation = false,
    fitPadding,
    onStopPress,
  },
  ref,
) {
  const mapRef = useRef<MapView | null>(null);
  const [tracksChanges, setTracksChanges] = useState(true);
  // The native blue dot's own live coordinate, captured from `onUserLocationChange` — the SAME
  // location client the dot already uses (no extra GPS client), so our facing arrow can sit
  // exactly on the dot instead of drifting to the (laggy) server `rider` prop.
  const [userCoord, setUserCoord] = useState<LatLng | null>(null);

  const riderCoord =
    rider && isValidCoord(rider.latitude, rider.longitude)
      ? { latitude: rider.latitude, longitude: rider.longitude }
      : null;
  // Best-known rider position: the native dot's live coordinate when available, else the
  // server prop. Used to anchor the facing arrow and to fit-bounds.
  const meCoord = (showUserLocation ? userCoord : null) ?? riderCoord;
  const deviceHeading = useDeviceHeading(!!meCoord);
  const showHeading = !!meCoord && deviceHeading != null;

  const validStops = useMemo(
    () => stops.filter((stop) => isValidCoord(stop.latitude, stop.longitude)),
    [stops],
  );
  const stopSignature = `${validStops
    .map(
      (stop) =>
        `${stop.id}:${stop.focused ? 1 : 0}:${stop.count ?? ""}:${stop.live ? 1 : 0}:${stop.alert ?? ""}:${stop.alertMinutes ?? ""}:${stop.statusColor ?? ""}`,
    )
    .join("|")}|hd:${showHeading ? 1 : 0}`;
  // Only the SET of stops (new/removed order) — used to decide when to auto-fit. Status,
  // count, focus, live and rider-movement changes must NOT re-fit (that would fight the
  // rider's own zoom/pan on every data poll).
  const stopIdsKey = validStops.map((stop) => stop.id).sort().join("|");

  const fitAll = useMemo(
    () => () => {
      const points: LatLng[] = validStops.map((stop) => ({
        latitude: stop.latitude,
        longitude: stop.longitude,
      }));
      if (meCoord) {
        points.push(meCoord);
      }
      if (!mapRef.current || points.length === 0) return;
      if (points.length === 1) {
        mapRef.current.animateToRegion(
          { ...points[0], latitudeDelta: 0.02, longitudeDelta: 0.02 },
          350,
        );
        return;
      }
      mapRef.current.fitToCoordinates(points, {
        edgePadding: fitPadding ?? { top: 90, right: 60, bottom: 320, left: 60 },
        animated: true,
      });
    },
    [validStops, meCoord, fitPadding],
  );

  useImperativeHandle(ref, () => ({
    animateTo: (coord, delta = 0.012) => {
      mapRef.current?.animateToRegion(
        {
          latitude: coord.latitude,
          longitude: coord.longitude,
          latitudeDelta: delta,
          longitudeDelta: delta,
        },
        400,
      );
    },
    fit: fitAll,
  }));

  // Vector markers must stay "tracking" long enough to paint fully into the native
  // snapshot, then stop (permanent tracking = per-frame re-rasterise / jank). Capturing too
  // early is what makes a marker render half-painted / cropped — so use a generous window
  // and repaint again once the map is ready.
  useEffect(() => {
    setTracksChanges(true);
    const timer = setTimeout(() => setTracksChanges(false), 1400);
    return () => clearTimeout(timer);
  }, [stopSignature]);

  // Auto-fit ONLY when the set of stops changes (a new/removed order) — never on periodic
  // refreshes or rider movement, so the rider's chosen zoom/pan is preserved.
  useEffect(() => {
    fitAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopIdsKey]);

  return (
    <MapView
      ref={mapRef}
      provider={PROVIDER_GOOGLE}
      style={[styles.map, style]}
      initialRegion={FALLBACK_REGION}
      customMapStyle={MAP_STYLE}
      liteMode={liteMode}
      showsUserLocation={showUserLocation}
      showsMyLocationButton={false}
      showsPointsOfInterest={false}
      showsBuildings={false}
      showsCompass={false}
      toolbarEnabled={false}
      pitchEnabled={false}
      moveOnMarkerPress={false}
      loadingEnabled
      onMapReady={() => setTracksChanges(true)}
      onUserLocationChange={
        showUserLocation
          ? (event) => {
              const c = event.nativeEvent.coordinate;
              if (c && isValidCoord(c.latitude, c.longitude)) {
                setUserCoord({ latitude: c.latitude, longitude: c.longitude });
              }
            }
          : undefined
      }
    >
      {/* Multiple legs at once: the live order is solid + full colour, the rest are dashed
          and faded so the rider reads which leg is actively sharing location at a glance. */}
      {(routes ?? []).map((route) =>
        route.coords.length > 1 ? (
          <Polyline
            key={route.key}
            coordinates={route.coords}
            strokeColor={route.dashed ? ROUTE_COLOR_FADED : ROUTE_COLOR}
            strokeWidth={route.dashed ? 4 : 5}
            lineCap="round"
            lineJoin="round"
            lineDashPattern={route.dashed ? [2, 10] : undefined}
            zIndex={route.dashed ? 1 : 2}
          />
        ) : null,
      )}

      {routeCoords && routeCoords.length > 1 ? (
        <Polyline
          coordinates={routeCoords}
          strokeColor={ROUTE_COLOR}
          strokeWidth={routeDashed ? 4 : 5}
          lineCap="round"
          lineJoin="round"
          lineDashPattern={routeDashed ? [2, 10] : undefined}
        />
      ) : null}

      {validStops.map((stop) => (
        <Marker
          key={stop.id}
          coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
          onPress={() => onStopPress?.(stop.id)}
          tracksViewChanges={tracksChanges}
          anchor={{ x: 0.5, y: 0.82 }}
          zIndex={stop.focused ? 5 : stop.kind === "pickup" ? 3 : 4}
        >
          <StopPin stop={stop} />
        </Marker>
      ))}

      {/* When the caller opts out of the native dot but still gives a coordinate (rare), draw
          a simple blue dot so the rider is still on the map. */}
      {!showUserLocation && riderCoord ? (
        <Marker
          coordinate={riderCoord}
          anchor={{ x: 0.5, y: 0.5 }}
          flat
          tracksViewChanges={tracksChanges}
          zIndex={6}
        >
          <View collapsable={false} pointerEvents="none" style={styles.puckHalo}>
            <View collapsable={false} style={styles.puckDot} />
          </View>
        </Marker>
      ) : null}

      {/* Real-time facing direction: a small arrow that pivots on the rider's dot and points
          where the phone is aimed (compass). Rotated natively via the Marker's `rotation`, so
          spinning it never re-snapshots the view. */}
      {showHeading && meCoord ? (
        <Marker
          coordinate={meCoord}
          anchor={{ x: 0.5, y: 1 }}
          flat
          rotation={deviceHeading ?? 0}
          tracksViewChanges={tracksChanges}
          zIndex={7}
        >
          <View collapsable={false} pointerEvents="none" style={styles.headingWrap}>
            <View collapsable={false} style={styles.headingLayer}>
              <View collapsable={false} style={styles.headingArrowOutline} />
            </View>
            <View collapsable={false} style={styles.headingLayer}>
              <View collapsable={false} style={styles.headingArrow} />
            </View>
          </View>
        </Marker>
      ) : null}
    </MapView>
  );
});

// Teardrop pin modeled on the customer-app's tracking markers (which render crisply and
// never crop): every View is `collapsable={false}` so Android doesn't flatten/clip it, a
// rotated square forms the point, and a soft lift-shadow grounds it. A count badge rides on
// top when a restaurant has more than one order.
function StopPin({ stop }: { stop: MapStop }) {
  const color = stop.kind === "pickup" ? PICKUP_COLOR : DROP_COLOR;
  const icon = stop.kind === "pickup" ? "storefront" : "home";
  const ring = stop.statusColor ?? "#FFFFFF";
  return (
    <View collapsable={false} pointerEvents="none" style={styles.markerRoot}>
      <View collapsable={false} style={styles.markerLiftShadow} />
      <View collapsable={false} style={[styles.markerPointer, { backgroundColor: color }]} />
      <View
        collapsable={false}
        style={[
          styles.markerPin,
          { backgroundColor: color, borderColor: ring },
          stop.focused && styles.markerPinFocused,
        ]}
      >
        <Ionicons name={icon} size={13} color="#FFFFFF" />
      </View>
      {stop.count && stop.count > 1 ? (
        <View collapsable={false} style={styles.countBadge}>
          <Text style={styles.countText}>{stop.count}</Text>
        </View>
      ) : null}
      {stop.live ? (
        <View collapsable={false} style={styles.liveDotOuter}>
          <View collapsable={false} style={styles.liveDotInner} />
        </View>
      ) : null}
      {stop.alert === "late" ? (
        <View collapsable={false} style={styles.latePill}>
          <Ionicons name="alert" size={9} color="#FFFFFF" />
          {typeof stop.alertMinutes === "number" && stop.alertMinutes > 0 ? (
            <Text style={styles.latePillText}>{stop.alertMinutes}m</Text>
          ) : null}
        </View>
      ) : stop.alert === "prep" ? (
        <View collapsable={false} style={styles.prepBadge}>
          <Ionicons name="time" size={11} color="#FFFFFF" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  // Tight, fixed bounds (the pin never changes size — focus is shown by the ring only, so
  // the native snapshot size is stable and never clips). Mirrors the customer-app teardrop.
  // Small, fixed, crop-proof: no Android `elevation` (its shadow renders outside the marker
  // bounds and gets clipped — a common crop cause); grounding is the flat liftShadow only.
  markerRoot: {
    width: 38,
    height: 44,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 8,
  },
  markerLiftShadow: {
    position: "absolute",
    bottom: 4,
    width: 15,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.22)",
    transform: [{ scaleX: 1.18 }],
  },
  markerPointer: {
    position: "absolute",
    top: 26,
    width: 8,
    height: 8,
    borderRadius: 2,
    transform: [{ rotate: "45deg" }],
    zIndex: 1,
  },
  markerPin: {
    width: 26,
    height: 26,
    borderRadius: 999,
    borderWidth: 2.5,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  markerPinFocused: { borderWidth: 3.5 },
  countBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: "#111827",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },
  countText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  liveDotOuter: {
    position: "absolute",
    top: 1,
    left: 1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "rgba(220,38,38,0.28)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },
  liveDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#DC2626",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  prepBadge: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#F59E0B",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },
  // Late alert as a small corner pill on the pin: the warning icon + minutes past the
  // threshold (e.g. "⚠ 3m"). Top-left corner, within the marker's fixed width so it can't crop.
  latePill: {
    position: "absolute",
    top: 0,
    left: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
    height: 15,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: "#DC2626",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    zIndex: 4,
  },
  latePillText: { color: "#FFFFFF", fontSize: 9, fontWeight: "900" },
  // Fallback blue-dot puck (only when the native dot is disabled): Google-blue dot + white
  // ring + soft halo. Fixed pixel size so it reads the same at every zoom.
  puckHalo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(66,133,244,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  puckDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#4285F4",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#1A73E8",
    shadowOpacity: 0.45,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 4,
  },
  // Real-time facing arrow: a slim white-outlined blue arrowhead that floats just off the dot
  // and points where the phone faces. The Marker anchor {0.5,1} = the wrap's bottom-centre,
  // which sits on the dot; the arrow tip is at the top, so it points outward from the dot.
  headingWrap: {
    width: 22,
    height: 34,
  },
  headingLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  headingArrowOutline: {
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 24,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#FFFFFF",
  },
  headingArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6.5,
    borderRightWidth: 6.5,
    borderBottomWidth: 19,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#1A73E8",
    marginTop: 2.5,
  },
});
