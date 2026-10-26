(() => {
  const banner = document.getElementById("android-app-link");
  if (!banner || !/Android/i.test(navigator.userAgent)) return;
  const dismissedKey = "foodbela-android-app-dismissed";
  try {
    if (sessionStorage.getItem(dismissedKey)) return;
  } catch { /* Browser storage is optional. */ }
  const store = "https://play.google.com/store/apps/details?id=com.foodbela.app";
  document.getElementById("android-app-open").href = `intent:///#Intent;scheme=foodbela;package=com.foodbela.app;S.browser_fallback_url=${encodeURIComponent(store)};end`;
  banner.hidden = false;
  document.getElementById("android-app-dismiss").addEventListener("click", () => {
    banner.hidden = true;
    try { sessionStorage.setItem(dismissedKey, "1"); } catch { /* Optional preference. */ }
  });
})();
