export type DecodedPoint = { latitude: number; longitude: number };

// Decode a Google "encoded polyline" string into lat/lng points.
// Standard algorithm (https://developers.google.com/maps/documentation/utilities/polylinealgorithm).
export function decodePolyline(encoded?: string | null): DecodedPoint[] {
  if (!encoded || typeof encoded !== "string") return [];

  const points: DecodedPoint[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const length = encoded.length;

  while (index < length) {
    let result = 0;
    let shift = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < length);
    const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < length);
    const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return points;
}
