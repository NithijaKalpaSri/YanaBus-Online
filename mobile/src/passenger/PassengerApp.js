import { useCallback, useEffect, useState } from 'react'
import { BackHandler, Text, View } from 'react-native'
import { usePoll, useServer } from '../api'
import { getPosition } from '../locate'
import { useTheme } from '../theme'
import Home from './Home'
import RouteLive from './RouteLive'

/**
 * "YanaBus" for passengers:
 *   Home (finds the routes near your location, or search) -> a route with its live buses on the map.
 */
export default function PassengerApp() {
  const t = useTheme()
  const [server, custom, setCustom] = useServer()
  const { online } = usePoll(server, '/api/state', 4000)
  const [pos, setPos] = useState(undefined)        // undefined = looking, null = not available, {denied} / {lat, lng}
  const [open, setOpen] = useState(null)           // { routeId, stopId } while a route is open

  const findPosition = useCallback(async () => {
    setPos(undefined)
    setPos((await getPosition()) ?? null)
  }, [])
  useEffect(() => { if (server) findPosition() }, [server, findPosition])

  // the phone's back button closes the route and returns to the home screen
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (open) { setOpen(null); return true }
      return false
    })
    return () => sub.remove()
  }, [open])

  if (!server) {
    return <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: t.muted }}>Loading...</Text></View>
  }
  const ctx = { server, custom, setCustom, online }

  if (open) {
    return <RouteLive ctx={ctx} routeId={open.routeId} stopId={open.stopId} pos={pos} onBack={() => setOpen(null)} />
  }
  return <Home ctx={ctx} pos={pos} onRetryLocation={findPosition} onOpen={(routeId, stopId) => setOpen({ routeId, stopId })} />
}
