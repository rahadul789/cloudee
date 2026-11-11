import { useState } from "react";
import { ActivityIndicator, StyleSheet, View, useWindowDimensions } from "react-native";
import { WebView } from "react-native-webview";

// YouTube's official player inside a WebView (16:9, full width). The page is served from our
// own origin so YouTube gets a proper referrer — embeds without one fail with "error 153".
function buildPlayerHtml(youtubeId: string, autoplay: boolean) {
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<style>html,body{margin:0;height:100%;background:#000}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style>
</head><body>
<iframe src="https://www.youtube.com/embed/${youtubeId}?playsinline=1&rel=0&modestbranding=1&autoplay=${autoplay ? 1 : 0}"
 allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen
 referrerpolicy="strict-origin-when-cross-origin"></iframe>
</body></html>`;
}

export function YoutubePlayer({ youtubeId, autoplay = true }: { youtubeId: string; autoplay?: boolean }) {
  const { width } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const height = Math.round((width * 9) / 16);

  return (
    <View style={[styles.player, { height }]}>
      <WebView
        key={youtubeId}
        source={{ html: buildPlayerHtml(youtubeId, autoplay), baseUrl: "https://foodbela.com" }}
        style={styles.webview}
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        setSupportMultipleWindows={false}
      />
      {loading ? (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color="#FFFFFF" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  player: { backgroundColor: "#000000" },
  webview: { flex: 1, backgroundColor: "#000000" },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
});
