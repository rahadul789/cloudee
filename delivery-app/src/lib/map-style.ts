import type { MapStyleElement } from "react-native-maps";

export type DeliveryMapStyleContext =
  | "delivery.order_details"
  | "delivery.map_tab";

export type PlatformMapStyleSettings = {
  styles?: {
    id?: string;
    name?: string;
    isActive?: boolean;
    styleJson?: Record<string, unknown>[];
  }[];
  assignments?: Record<string, string | undefined>;
};

export const DEFAULT_DELIVERY_MAP_STYLE: MapStyleElement[] = [
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#CFE8C7" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
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
  { featureType: "road.local", elementType: "geometry", stylers: [{ color: "#F9FBF7" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#E4EAF0" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#FBD0E2" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#475569" }] },
  { featureType: "road", elementType: "labels.text.stroke", stylers: [{ color: "#FFFFFF" }] },
  { featureType: "water", stylers: [{ color: "#9FD9EF" }] },
  { featureType: "landscape", stylers: [{ color: "#EEF4E8" }] },
  { featureType: "landscape.man_made", stylers: [{ color: "#F4EFE7" }] },
];

export function resolvePlatformMapStyle(
  settings: PlatformMapStyleSettings | null | undefined,
  context: DeliveryMapStyleContext,
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
