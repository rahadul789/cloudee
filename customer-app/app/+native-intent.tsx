// Normalize verified website URLs without changing existing app-only deep links.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (!/^https?:\/\//i.test(path)) return path;
    const url = new URL(path);
    if (url.protocol !== "https:" || url.hostname !== "foodbela.com") return "/(tabs)";
    if (url.pathname === "/") return "/(tabs)";
    if (/^\/restaurants\/[A-Za-z0-9_-]+\/?$/.test(url.pathname) || /^\/orders\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) {
      return `${url.pathname.replace(/\/$/, "")}${url.search}`;
    }
    return "/(tabs)";
  } catch {
    return "/(tabs)";
  }
}
