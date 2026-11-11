import { Redirect } from "expo-router";

// Favourites moved off the tab bar (the Hype tab took its slot). Old links land on the screen.
export default function FavoritesTabRedirect() {
  return <Redirect href="/favorite-restaurants" />;
}
