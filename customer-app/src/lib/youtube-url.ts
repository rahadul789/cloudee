export function isTrustedYoutubeUrl(value?: string | null) {
  const url = value?.trim();
  if (!url) return false;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    return (
      parsed.protocol === "https:" &&
      (host === "youtu.be" ||
        host === "youtube.com" ||
        host.endsWith(".youtube.com") ||
        host === "youtube-nocookie.com" ||
        host.endsWith(".youtube-nocookie.com"))
    );
  } catch {
    return false;
  }
}

/** 11-char YouTube id from any common link (watch, youtu.be, shorts, embed), or "". */
export function parseYoutubeId(input?: string | null) {
  const value = String(input ?? "").trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
  const patterns = [
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtube(?:-nocookie)?\.com\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) return match[1];
  }
  return "";
}
