import { useEffect, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'
import { WebView } from 'react-native-webview'

// Bus colours on the map: green = seats available, yellow = no seats but standing room, red = full
const COLORS = { green: '#16a34a', orange: '#eab308', red: '#dc2626' }

/** The map page (Leaflet + OpenStreetMap) drawn inside a WebView. The route is built into the page. */
function buildHtml(route) {
  const data = JSON.stringify({ line: route.line, stops: route.stops, colors: COLORS })
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>
html,body,#map{height:100%;margin:0;background:#e8ecef;font-family:sans-serif}
.leaflet-control-attribution{font-size:9px}
.bus{transition:transform 1.8s linear}
.zooming .bus{transition:none}
.pin{width:36px;height:36px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.45);
  display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:13px;position:relative}
.pin.orange{color:#3b2f00}
.pin.sel{transform:scale(1.35);box-shadow:0 0 0 4px rgba(17,20,24,.55),0 2px 8px rgba(0,0,0,.5)}
.pin .dir{position:absolute;right:-7px;bottom:-5px;width:16px;height:16px;border-radius:50%;background:#111418;color:#fff;
  font-size:10px;display:flex;align-items:center;justify-content:center;border:1.5px solid #fff}
.plate{position:absolute;top:-19px;left:50%;transform:translateX(-50%);background:#111418;color:#fff;border-radius:6px;
  padding:1px 6px;font-size:10px;white-space:nowrap}
.me{width:18px;height:18px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 6px rgba(37,99,235,.25)}
</style></head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const D = ${data};
const post = m => window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(m));
const map = L.map('map', {zoomControl:false});
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'&copy; OpenStreetMap'}).addTo(map);
map.on('zoomstart', () => map.getContainer().classList.add('zooming'));
map.on('zoomend', () => map.getContainer().classList.remove('zooming'));
const line = L.polyline(D.line, {color:'#fff', weight:10, opacity:.95}).addTo(map);
L.polyline(D.line, {color:'#111418', weight:5}).addTo(map);
map.fitBounds(line.getBounds(), {padding:[26,26]});
const stopMarkers = {};
D.stops.forEach(s => {
  const m = L.circleMarker([s.lat, s.lng], {radius:6, color:'#111418', weight:3, fillColor:'#fff', fillOpacity:1}).addTo(map);
  m.bindTooltip(s.name, {direction:'top', offset:[0,-6]});
  m.on('click', () => post({type:'stop', id:s.id}));
  stopMarkers[s.id] = m;
});
let selStop = null;
window.selectStop = function(id, pan) {
  if (selStop !== null && stopMarkers[selStop]) stopMarkers[selStop].setStyle({radius:6, color:'#111418', fillColor:'#fff'});
  selStop = id;
  const m = stopMarkers[id]; if (!m) return;
  m.setStyle({radius:10, color:'#2563eb', fillColor:'#2563eb'}); m.bringToFront();
  m.openTooltip();
  if (pan) map.setView(m.getLatLng(), Math.max(map.getZoom(), 14), {animate:true});
};
const buses = {};
window.updateBuses = function(list, selectedId) {
  const seen = {};
  list.forEach(b => {
    seen[b.id] = 1;
    const sel = b.id === selectedId;
    const html = '<div class="pin ' + b.crowd + (sel ? ' sel' : '') + '" style="background:' + D.colors[b.crowd] + '">' +
      (sel ? '<span class="plate">' + b.id.replace('SP ','') + '</span>' : '') + b.passengers +
      '<span class="dir">' + (b.direction === 1 ? '&rarr;' : '&larr;') + '</span></div>';
    const icon = L.divIcon({className:'bus', html:html, iconSize:[36,36], iconAnchor:[18,18]});
    if (!buses[b.id]) {
      buses[b.id] = L.marker([b.lat, b.lng], {icon:icon, zIndexOffset:1000}).addTo(map);
      buses[b.id].on('click', () => post({type:'bus', id:b.id}));
    } else {
      buses[b.id].setLatLng([b.lat, b.lng]);
      buses[b.id].setIcon(icon);
      buses[b.id].setZIndexOffset(sel ? 2000 : 1000);
    }
  });
  Object.keys(buses).forEach(id => { if (!seen[id]) { map.removeLayer(buses[id]); delete buses[id]; } });
};
window.focusBus = function(id) { const m = buses[id]; if (m) map.setView(m.getLatLng(), Math.max(map.getZoom(), 14), {animate:true}); };
let me = null;
window.setUser = function(lat, lng) {
  if (me) { me.setLatLng([lat, lng]); return; }
  me = L.marker([lat, lng], {icon:L.divIcon({className:'', html:'<div class="me"></div>', iconSize:[18,18], iconAnchor:[9,9]}), zIndexOffset:500}).addTo(map);
};
window.fitRoute = function() { map.fitBounds(line.getBounds(), {padding:[26,26]}); };
post({type:'ready'});
</script></body></html>`
}

/**
 * The live map. `buses` come from the server every 2 seconds; each bus pin shows how many people are on board
 * and is coloured by how full the bus is.
 */
export default function BusMap({ route, buses, userPos, stopId, busId, onStop, onBus }) {
  const web = useRef(null)
  const [ready, setReady] = useState(false)
  const html = useMemo(() => buildHtml(route), [route.id])      // the page only changes when the route changes

  const run = js => web.current?.injectJavaScript(`try{${js}}catch(e){};true;`)

  useEffect(() => { setReady(false) }, [route.id])
  useEffect(() => { if (ready && buses) run(`window.updateBuses(${JSON.stringify(buses)}, ${JSON.stringify(busId)});`) }, [ready, buses, busId])
  useEffect(() => { if (ready && stopId !== null && stopId !== undefined) run(`window.selectStop(${stopId}, false);`) }, [ready, stopId])
  useEffect(() => { if (ready && userPos?.lat) run(`window.setUser(${userPos.lat}, ${userPos.lng});`) }, [ready, userPos?.lat, userPos?.lng])
  useEffect(() => { if (ready && busId) run(`window.focusBus(${JSON.stringify(busId)});`) }, [ready, busId])

  return (
    <View style={{ flex: 1, overflow: 'hidden' }}>
      <WebView
        key={route.id}
        ref={web}
        originWhitelist={['*']}
        source={{ html, baseUrl: 'https://yanabus.app/' }}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        setSupportMultipleWindows={false}
        onMessage={e => {
          const m = JSON.parse(e.nativeEvent.data)
          if (m.type === 'ready') setReady(true)
          if (m.type === 'stop') onStop?.(m.id)
          if (m.type === 'bus') onBus?.(m.id)
        }}
      />
    </View>
  )
}
