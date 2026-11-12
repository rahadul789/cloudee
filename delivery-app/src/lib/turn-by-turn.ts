import { Linking, Platform } from "react-native";

// Driving mode (mode=d): the most complete road coverage around Netrakona (cycle routes
// are patchy). The car/arrow icon is the rider's own Google Maps setting. Hand the rider to Google Maps' own turn-by-turn navigation (voice "in 200 m turn right",
// lane guidance, rerouting — in Bangla if the phone is set to Bangla). Opening the plain
// "/maps/dir" web link only PREVIEWS a route; the navigation intent starts guidance at once.
// Falls back to the web link (with dir_action=navigate) when the intent can't be opened.
export async function openTurnByTurn(destination: string | { latitude: number; longitude: number } | null | undefined) {
  if (!destination) return;
  const query = typeof destination === "string"
    ? destination.trim()
    : `${destination.latitude},${destination.longitude}`;
  if (!query) return;

  if (Platform.OS === "android") {
    try {
      await Linking.openURL(`google.navigation:q=${encodeURIComponent(query)}&mode=d`);
      return;
    } catch {
      // Google Maps missing/disabled → web link below
    }
  }
  try {
    await Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}&travelmode=driving&dir_action=navigate`,
    );
  } catch {
    // no browser/maps available — nothing else to do
  }
}
