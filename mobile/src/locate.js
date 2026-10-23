import * as Location from 'expo-location'
import { get } from './api'

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))])

/** The phone's position, or null when location is off, not allowed, or not available. */
export async function getPosition() {
  try {
    const perm = await Location.requestForegroundPermissionsAsync()
    if (perm.status !== 'granted') return { denied: true }
    // plain GPS, and no Android pop-up asking to switch on "Location Accuracy" (it would interrupt the flow)
    const pos = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High, mayShowUserSettingsDialog: false }), 12000)
    return { lat: pos.coords.latitude, lng: pos.coords.longitude }
  } catch (e) {
    return null
  }
}

/**
 * Finds out where the phone is and how that compares with the routes (used by the drivers' app).
 * Returns { status: 'ok' | 'denied' | 'unavailable', route_id, route_name, on_route, off_route_m, near_stop, nearest_bus }.
 */
export async function findMe(server) {
  const pos = await getPosition()
  if (pos?.denied) return { status: 'denied' }
  if (!pos) return { status: 'unavailable' }
  try {
    const info = await get(server, `/api/locate?lat=${pos.lat}&lng=${pos.lng}`)
    return { status: 'ok', ...info }
  } catch (e) {
    return { status: 'unavailable' }
  }
}

export const distanceText = m => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.round(m)} m`)

/** One plain sentence about the phone's location. */
export function describeLocation(l) {
  if (!l) return ''
  if (l.status === 'denied') return 'Location permission was not given.'
  if (l.status !== 'ok') return 'Your location is not available right now.'
  if (l.on_route) return `You are on the ${l.route_name} route, near ${l.near_stop}.`
  return `You are ${distanceText(l.off_route_m)} from the nearest route (${l.route_name}).`
}
