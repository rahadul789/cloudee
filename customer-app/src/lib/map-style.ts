import type { MapStyleElement } from "react-native-maps";

export type CustomerMapStyleContext =
  | "customer.location_picker"
  | "customer.order_tracking";

export type PlatformMapStyleSettings = {
  styles?: {
    id?: string;
    name?: string;
    isActive?: boolean;
    styleJson?: Record<string, unknown>[];
  }[];
  assignments?: Record<string, string | undefined>;
};

export const DEFAULT_CUSTOMER_MAP_STYLE: MapStyleElement[] = [
  {
    featureType: "poi",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "poi.business",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "poi.school",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "poi.medical",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "poi.place_of_worship",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#CFE8C7" }],
  },
  {
    featureType: "transit",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "administrative",
    elementType: "labels.text.fill",
    stylers: [{ color: "#334155" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#FFFFFF" }, { weight: 1.35 }],
  },
  {
    featureType: "road.local",
    elementType: "geometry",
    stylers: [{ color: "#F9FBF7" }],
  },
  {
    featureType: "road.arterial",
    elementType: "geometry",
    stylers: [{ color: "#DCE4EC" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#F7A8C9" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#334155" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#FFFFFF" }],
  },
  {
    featureType: "water",
    stylers: [{ color: "#99D8EF" }],
  },
  {
    featureType: "landscape",
    stylers: [{ color: "#EAF4E4" }],
  },
  {
    featureType: "landscape.man_made",
    stylers: [{ color: "#F3EEE6" }],
  },
];

export function resolvePlatformMapStyle(
  settings: PlatformMapStyleSettings | null | undefined,
  context: CustomerMapStyleContext,
) {
  const assignedStyleId =
    settings?.assignments?.[context] ?? settings?.assignments?.default;
  const selectedStyle = settings?.styles?.find(
    (style) =>
      style.id === assignedStyleId &&
      style.isActive !== false &&
      Array.isArray(style.styleJson) &&
      style.styleJson.length > 0,
  );

  return selectedStyle?.styleJson
    ? (selectedStyle.styleJson as MapStyleElement[])
    : null;
}

export function getMapStyleSignature(style: MapStyleElement[] | null | undefined) {
  if (!style?.length) return "app-default";

  const serialized = JSON.stringify(style);
  let hash = 0;
  for (let index = 0; index < serialized.length; index += 1) {
    hash = (hash * 31 + serialized.charCodeAt(index)) | 0;
  }

  return `${style.length}-${Math.abs(hash)}`;
}
