export const TRACKING_NEARBY_DISTANCE_METERS = 260;
export const TRACKING_ARRIVED_DISTANCE_METERS = 80;

export type TrackingCameraBand = "far" | "mid" | "close" | "near" | "arrived";
export type TrackingViewportRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type TrackingCoordinate = {
  latitude: number;
  longitude: number;
};

export function calculateDistanceMeters(
  from: TrackingCoordinate,
  to: TrackingCoordinate,
) {
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const startLatitude = toRadians(from.latitude);
  const endLatitude = toRadians(to.latitude);

  const a =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(longitudeDelta / 2) *
      Math.sin(longitudeDelta / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
}

export function getTrackingBaseProgress(status: string) {
  switch (status) {
    case "New":
      return 0.04;
    case "Accepted":
      return 0.08;
    case "Preparing":
      return 0.14;
    case "ReadyForPickup":
      return 0.24;
    case "PickedUp":
      return 0.38;
    case "Delivered":
      return 1;
    default:
      return 0.04;
  }
}

export function getTrackingCameraBand(distanceMeters: number): TrackingCameraBand {
  if (distanceMeters <= TRACKING_ARRIVED_DISTANCE_METERS) {
    return "arrived";
  }

  if (distanceMeters <= TRACKING_NEARBY_DISTANCE_METERS) {
    return "near";
  }

  if (distanceMeters <= 700) {
    return "close";
  }

  if (distanceMeters <= 1600) {
    return "mid";
  }

  return "far";
}

export function getTrackingViewportRegion(
  riderLocation: TrackingCoordinate,
  customerLocation: TrackingCoordinate,
  distanceMeters: number,
): TrackingViewportRegion {
  const band = getTrackingCameraBand(distanceMeters);
  const focusProgress =
    band === "far"
      ? 0.5
      : band === "mid"
        ? 0.56
        : band === "close"
          ? 0.64
          : band === "near"
            ? 0.72
            : 0.8;
  const spanMultiplier =
    band === "far"
      ? 1.9
      : band === "mid"
        ? 1.5
        : band === "close"
          ? 1.24
          : band === "near"
            ? 1.08
            : 0.98;
  const minLatitudeDelta =
    band === "far"
      ? 0.012
      : band === "mid"
        ? 0.0088
        : band === "close"
          ? 0.0052
          : band === "near"
            ? 0.0029
            : 0.0019;
  const minLongitudeDelta =
    band === "far"
      ? 0.012
      : band === "mid"
        ? 0.0088
        : band === "close"
          ? 0.0052
          : band === "near"
            ? 0.003
            : 0.002;
  const center = interpolateCoordinate(
    riderLocation,
    customerLocation,
    focusProgress,
  );
  const latitudeSpan = Math.abs(customerLocation.latitude - riderLocation.latitude);
  const longitudeSpan = Math.abs(
    customerLocation.longitude - riderLocation.longitude,
  );

  return {
    latitude: center.latitude,
    longitude: center.longitude,
    latitudeDelta: Math.max(minLatitudeDelta, latitudeSpan * spanMultiplier),
    longitudeDelta: Math.max(minLongitudeDelta, longitudeSpan * spanMultiplier),
  };
}

export function interpolateCoordinate(
  start: TrackingCoordinate,
  end: TrackingCoordinate,
  progress: number,
): TrackingCoordinate {
  const safeProgress = Math.max(0, Math.min(progress, 1));

  return {
    latitude: start.latitude + (end.latitude - start.latitude) * safeProgress,
    longitude: start.longitude + (end.longitude - start.longitude) * safeProgress,
  };
}

export function offsetCoordinateByDistance(
  origin: TrackingCoordinate,
  distanceMeters: number,
  bearingDegrees: number,
): TrackingCoordinate {
  const earthRadiusMeters = 6_371_000;
  const angularDistance = distanceMeters / earthRadiusMeters;
  const bearing = toRadians(bearingDegrees);
  const originLatitude = toRadians(origin.latitude);
  const originLongitude = toRadians(origin.longitude);

  const nextLatitude = Math.asin(
    Math.sin(originLatitude) * Math.cos(angularDistance) +
      Math.cos(originLatitude) * Math.sin(angularDistance) * Math.cos(bearing),
  );

  const nextLongitude =
    originLongitude +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(originLatitude),
      Math.cos(angularDistance) -
        Math.sin(originLatitude) * Math.sin(nextLatitude),
    );

  return {
    latitude: (nextLatitude * 180) / Math.PI,
    longitude: (nextLongitude * 180) / Math.PI,
  };
}

export function buildCurvedRoutePoints(
  start: TrackingCoordinate,
  end: TrackingCoordinate,
  segments = 24,
) {
  const latitudeMidpoint = (start.latitude + end.latitude) / 2;
  const longitudeMidpoint = (start.longitude + end.longitude) / 2;
  const latitudeDelta = end.latitude - start.latitude;
  const longitudeDelta = end.longitude - start.longitude;
  const controlPoint = {
    latitude: latitudeMidpoint + longitudeDelta * 0.18,
    longitude: longitudeMidpoint - latitudeDelta * 0.18,
  };

  return Array.from({ length: segments + 1 }, (_, index) => {
    const t = index / segments;
    const inverse = 1 - t;

    return {
      latitude:
        inverse * inverse * start.latitude +
        2 * inverse * t * controlPoint.latitude +
        t * t * end.latitude,
      longitude:
        inverse * inverse * start.longitude +
        2 * inverse * t * controlPoint.longitude +
        t * t * end.longitude,
    };
  });
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}
