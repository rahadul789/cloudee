import { useState } from "react";
import { ActivityIndicator, StyleSheet, View, useWindowDimensions } from "react-native";
import { WebView } from "react-native-webview";

// YouTube's official player inside a WebView (16:9, full width) — the plain embed, same look as
// before. The page is served from our own origin so YouTube gets a proper referrer (embeds
// without one fail with "error 153"). With enablejsapi=1 the embed reports its state back over
// postMessage, so we can tell the app when a video ENDS ("ended" → autoplay the next one) without
// loading YouTube's extra player script.
function buildPlayerHtml(youtubeId: string, autoplay: boolean) {
  const src = `https://www.youtube.com/embed/${youtubeId}?playsinline=1&rel=0&modestbranding=1&autoplay=${autoplay ? 1 : 0}&enablejsapi=1&origin=https%3A%2F%2Ffoodbela.com`;
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<style>html,body{margin:0;height:100%;background:#000}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style>
</head><body>
<iframe id="yt" src="${src}"
 allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen
 referrerpolicy="strict-origin-when-cross-origin"></iframe>
<script>
(function(){
  var frame=document.getElementById('yt'), heard=false, ended=false;
  function send(m){try{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(m)}catch(e){}}
  function listen(){try{frame.contentWindow.postMessage(JSON.stringify({event:'listening',id:'fb',channel:'widget'}),'*')}catch(e){}}
  frame.addEventListener('load',function(){var n=0;var t=setInterval(function(){if(heard||++n>30){clearInterval(t);return}listen()},500)});
  window.addEventListener('message',function(e){
    if(String(e.origin).indexOf('youtube')<0)return;
    var d;try{d=typeof e.data==='string'?JSON.parse(e.data):e.data}catch(x){return}
    if(!d)return;heard=true;
    var state=d.event==='onStateChange'?d.info:(d.event==='infoDelivery'&&d.info&&typeof d.info.playerState==='number'?d.info.playerState:null);
    if(state===0&&!ended){ended=true;send('ended')}
    if(state===1)ended=false;
  });
})();
</script>
</body></html>`;
}

export function YoutubePlayer({
  youtubeId,
  autoplay = true,
  onEnded,
}: {
  youtubeId: string;
  autoplay?: boolean;
  /** Called when the video finishes (used for "Up next" autoplay). */
  onEnded?: () => void;
}) {
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
        onMessage={(event) => {
          if (event.nativeEvent.data === "ended") onEnded?.();
        }}
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
