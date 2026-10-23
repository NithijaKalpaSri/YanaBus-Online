import { useEffect } from 'react'
import L from 'leaflet'
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'

// OpenStreetMap tiles; styles.css softens their colours (and inverts them in dark mode)
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

// Stops bus markers from "gliding" while the map zooms (they would drift out of place)
function ZoomGuard() {
  const map = useMap()
  useMapEvents({
    zoomstart: () => map.getContainer().classList.add('map-zooming'),
    zoomend: () => map.getContainer().classList.remove('map-zooming'),
  })
  return null
}

// Fits the map to `points`; `inset` keeps them clear of the bottom sheet / side panel
export function FitTo({ points, inset = true }) {
  const map = useMap()
  useEffect(() => {
    if (!points || !points.length) return undefined
    const fit = () => {
      map.invalidateSize()
      const wide = window.innerWidth >= 900
      const opts = !inset
        ? { padding: [24, 24] }
        : wide
          ? { paddingTopLeft: [440, 80], paddingBottomRight: [40, 40] }
          : { paddingTopLeft: [30, 80], paddingBottomRight: [30, window.innerHeight * 0.42 + 20] }
      map.fitBounds(points, { ...opts, animate: false })
    }
    fit()
    const timer = setTimeout(fit, 350)
    window.addEventListener('resize', fit)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', fit)
    }
  }, [map, points, inset])
  return null
}

export default function BaseMap({ children, zoomControl = true }) {
  return (
    <div className="map-wrap">
      <MapContainer center={[6.08, 80.16]} zoom={12} zoomSnap={0.25} zoomControl={false} attributionControl>
        <TileLayer
          url={TILES}
          className="base-tiles"
          maxZoom={19}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <ZoomGuard />
        {zoomControl && <ZoomPosition />}
        {children}
      </MapContainer>
    </div>
  )
}

// Zoom buttons sit at the bottom right (clear of the top bar and the side panel)
function ZoomPosition() {
  const map = useMap()
  useEffect(() => {
    const ctl = L.control.zoom({ position: 'bottomright' }).addTo(map)
    return () => ctl.remove()
  }, [map])
  return null
}
