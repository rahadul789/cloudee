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
