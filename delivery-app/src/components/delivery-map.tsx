import { HEADING_ARROW, PIN_ANCHOR_Y, pinImage } from "@/src/lib/marker-images";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
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
  // Short code shown beside the pin (e.g. "#7583" — order id last 4) so the rider can tell
  // apart multiple customer pins at a glance. Rendered under the pin for drop stops.
  tag?: string;
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

const ROUTE_COLOR = "#EC1C63";
const ROUTE_COLOR_FADED = "rgba(236,28,99,0.45)";

// Default native Google map: shops, landmarks, buildings and road names stay visible —
// riders navigate by them ("the pharmacy next to the mosque").

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
  /** Navigator: camera follows the rider, turns with the phone (heading-up), tilted. */
  navigating?: boolean;
  /** Rider dragged the map while navigating → leave navigator mode. */
  onExitNavigation?: () => void;
  showTraffic?: boolean;
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
    navigating = false,
    onExitNavigation,
    showTraffic = false,
  },
  ref,
) {
  const mapRef = useRef<MapView | null>(null);
  const [tracksChanges, setTracksChanges] = useState(true);
  const lastZoomDelta = useRef(0);
  const retrackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (retrackTimer.current) clearTimeout(retrackTimer.current);
  }, []);
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
        `${stop.id}:${stop.focused ? 1 : 0}:${stop.count ?? ""}:${stop.live ? 1 : 0}:${stop.alert ?? ""}:${stop.alertMinutes ?? ""}:${stop.statusColor ?? ""}:${stop.tag ?? ""}`,
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

  // Navigator camera: follow + heading-up + tilt. Throttled (≤4/s, only on a real move or
  // turn) so it stays smooth without burning CPU/battery.
  const lastCamera = useRef({ at: 0, heading: Number.NaN, latitude: 0, longitude: 0 });
  useEffect(() => {
    if (!navigating || !meCoord || !mapRef.current) return;
    const heading = deviceHeading ?? 0;
    const now = Date.now();
    const prev = lastCamera.current;
    const turned = Number.isNaN(prev.heading) ||
      Math.abs(((heading - prev.heading + 540) % 360) - 180) > 5;
    const moved = Math.abs(meCoord.latitude - prev.latitude) + Math.abs(meCoord.longitude - prev.longitude) > 0.00003;
    if (now - prev.at < 250 || (!turned && !moved && now - prev.at < 3000)) return;
    lastCamera.current = { at: now, heading, latitude: meCoord.latitude, longitude: meCoord.longitude };
    mapRef.current.animateCamera(
      { center: meCoord, heading, pitch: 50, zoom: 17.5 },
      { duration: 350 },
    );
  }, [navigating, meCoord, deviceHeading]);

  // Leaving navigator: flatten + north-up, then show everything again.
  const wasNavigating = useRef(false);
  useEffect(() => {
    if (wasNavigating.current && !navigating) {
      lastCamera.current = { at: 0, heading: Number.NaN, latitude: 0, longitude: 0 };
      mapRef.current?.animateCamera({ heading: 0, pitch: 0 }, { duration: 300 });
      setTimeout(() => fitAll(), 320);
    }
    wasNavigating.current = navigating;
  }, [navigating, fitAll]);

  // Auto-fit ONLY when the set of stops changes (a new/removed order) — never on periodic
  // refreshes or rider movement, so the rider's chosen zoom/pan is preserved.
  useEffect(() => {
    if (!navigating) fitAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopIdsKey]);

  return (
    <MapView
      ref={mapRef}
      provider={PROVIDER_GOOGLE}
      style={[styles.map, style]}
      initialRegion={FALLBACK_REGION}
      liteMode={liteMode}
      showsUserLocation={showUserLocation}
      showsMyLocationButton={false}
      showsPointsOfInterest
      showsBuildings
      showsTraffic={showTraffic}
      showsCompass={navigating}
      toolbarEnabled={false}
      pitchEnabled
      rotateEnabled
      onPanDrag={navigating ? () => onExitNavigation?.() : undefined}
      moveOnMarkerPress={false}
      loadingEnabled
      onMapReady={() => setTracksChanges(true)}
      onRegionChangeComplete={(region) => {
        // A zoom changes how Google scales the cached marker bitmap; re-capture briefly so
        // pins never come back cropped. Pans/rotations don't need it.
        const last = lastZoomDelta.current;
        lastZoomDelta.current = region.latitudeDelta;
        if (!last || Math.abs(Math.log(region.latitudeDelta / last)) < 0.15) return;
        setTracksChanges(true);
        if (retrackTimer.current) clearTimeout(retrackTimer.current);
        retrackTimer.current = setTimeout(() => setTracksChanges(false), 700);
      }}
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
          anchor={{ x: 0.5, y: PIN_ANCHOR_Y }}
          image={pinImage(
            stop.kind === "pickup" ? "pickup" : "drop",
            stop.alert === "late" ? "late" : stop.focused || stop.live ? "focused" : "normal",
            stop.count,
          )}
          zIndex={stop.focused ? 5 : stop.kind === "pickup" ? 3 : 4}
 />
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
          anchor={{ x: 0.5, y: 0.5 }}
          image={HEADING_ARROW}
          flat
          rotation={deviceHeading ?? 0}
          tracksViewChanges={tracksChanges}
          // Under the pins (3–5) so the translucent light never tints a restaurant/customer pin.
          zIndex={1}
        />
      ) : null}
    </MapView>
  );
});

const styles = StyleSheet.create({
  map: { flex: 1 },
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
});
