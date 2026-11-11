import { Redirect } from "expo-router";

// The Browse tab was retired (its place in the tab bar is now Favourites, and Home lists
// every restaurant). The route stays so old links — admin CMS CTAs default to
// "/(tabs)/browse", pushes, deep links — still land somewhere useful: the search screen.
export default function BrowseRedirect() {
  return <Redirect href="/search" />;
}
