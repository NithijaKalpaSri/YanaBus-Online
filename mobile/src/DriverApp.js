import { useEffect, useMemo, useRef, useState } from 'react'
import { Text, View } from 'react-native'
import * as Location from 'expo-location'
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'
import { get, minutesText, post, useNow } from './api'
import { describeLocation } from './locate'
import { useTheme } from './theme'
import { Badge, Button, Card, Chip, Chips, Header, Muted, Screen, ServerPanel, SessionBar, Title } from './ui'
import SelectBus from './SelectBus'

// The demo GPS drives this many times faster than real time, like the simulated buses (SIM_SPEED in config.py)
const DEMO_SCALE = 5
const DEMO_SPEEDS = [[30, 'Free road'], [15, 'Slow traffic'], [7, 'Traffic jam']]

// ---- helpers for the demo GPS: walk along the route line ----
function prepareRoute(line) {
  const cum = [0]
  for (let i = 1; i < line.length; i++) {
    const [la1, lo1] = line[i - 1]
    const [la2, lo2] = line[i]
    const k = Math.cos((la1 * Math.PI) / 180)
    cum.push(cum[i - 1] + Math.hypot((la2 - la1) * 110.57, (lo2 - lo1) * 111.32 * k))
  }
  return { line, cum, length: cum[cum.length - 1] }
}
function pointAt(r, km) {
  let i = 1
  while (i < r.cum.length - 1 && r.cum[i] < km) i++
  const span = r.cum[i] - r.cum[i - 1]
  const f = span === 0 ? 0 : (km - r.cum[i - 1]) / span
  return {
    lat: r.line[i - 1][0] + f * (r.line[i][0] - r.line[i - 1][0]),
    lng: r.line[i - 1][1] + f * (r.line[i][1] - r.line[i - 1][1]),
  }
}

export default function DriverApp({ ctx, session, where, onSwitchRole, onChangeRoute, onSignOut }) {
  const t = useTheme()
  const { server, custom, setCustom, state, online } = ctx
  const now = useNow()

  // The location decides the GPS mode: on the route -> real phone GPS, anywhere else -> demo GPS
  const onRoute = where?.status === 'ok' && where.on_route && where.route_id === ctx.routeId
  const [showServer, setShowServer] = useState(false)
  const [busId, setBusId] = useState(null)
  const [direction, setDirection] = useState(1)
  const [source, setSource] = useState(onRoute ? 'real' : 'demo')   // 'real' | 'demo'
  const [demoSpeed, setDemoSpeed] = useState(30)
  const [trip, setTrip] = useState(null)                   // { busId, direction, source } while sharing
  const [fix, setFix] = useState({ at: null, status: '', offRoute: 0, error: '' })
  const [atEnd, setAtEnd] = useState(false)
  const demoSpeedRef = useRef(demoSpeed)
  demoSpeedRef.current = demoSpeed

  const buses = state?.buses || []
  const selected = busId                               // chosen on the bus screen
  const mine = trip ? buses.find(b => b.id === trip.busId) : null

  // ---- keep the screen on while sharing ----
  useEffect(() => {
    if (!trip) return undefined
    activateKeepAwakeAsync('yanabus-trip').catch(() => {})
    return () => { Promise.resolve(deactivateKeepAwake('yanabus-trip')).catch(() => {}) }
  }, [trip])

  // ---- send the location while a trip is running ----
  useEffect(() => {
    if (!trip || !server) return undefined
    let stopped = false
    let cleanup = () => {}

    const send = async (lat, lng, kmh) => {
      try {
        const r = await post(server, '/api/driver/location', { bus_id: trip.busId, lat, lng, speed_kmh: kmh })
        if (!stopped) setFix({ at: Date.now(), status: r.status, offRoute: r.off_route_m, error: '' })
      } catch (e) {
        if (!stopped) setFix(f => ({ ...f, error: 'No connection, retrying...' }))
      }
    }

    ;(async () => {
      if (trip.source === 'real') {
        const perm = await Location.requestForegroundPermissionsAsync()
        if (perm.status !== 'granted') {
          if (!stopped) setFix(f => ({ ...f, error: 'Location permission was denied. Allow it in the phone settings.' }))
          return
        }
        const sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 0 },
          pos => {
            const ms = pos.coords.speed                       // metres per second, null or -1 if unknown
            send(pos.coords.latitude, pos.coords.longitude, ms != null && ms >= 0 ? ms * 3.6 : null)
          },
        )
        if (stopped) sub.remove()
        else cleanup = () => sub.remove()
      } else {
        const data = await get(server, `/api/route?route=${ctx.routeId}`)
        if (stopped) return
        const r = prepareRoute(data.line)
        let km = trip.direction === 1 ? 0 : r.length
        const timer = setInterval(() => {
          const kmh = demoSpeedRef.current
          km = Math.min(r.length, Math.max(0, km + trip.direction * (kmh * DEMO_SCALE) / 3600))
          const end = trip.direction === 1 ? km >= r.length : km <= 0
          setAtEnd(end)
          const p = pointAt(r, km)
          send(p.lat, p.lng, end ? 0 : kmh)
        }, 1000)
        cleanup = () => clearInterval(timer)
      }
    })()

    return () => { stopped = true; cleanup() }
  }, [trip, server, ctx.routeId])

  const startTrip = async () => {
    try {
      await post(server, '/api/driver/start', { bus_id: selected, direction })
      setFix({ at: null, status: '', offRoute: 0, error: '' })
      setAtEnd(false)
      setTrip({ busId: selected, direction, source })
    } catch (e) {
      setFix(f => ({ ...f, error: e.message }))
    }
  }
  const endTrip = async () => {
    const id = trip.busId
    setTrip(null)
    try { await post(server, '/api/driver/stop', { bus_id: id }) } catch (e) { /* the server stops listening after 20 s anyway */ }
  }

  const ago = fix.at ? Math.max(0, Math.round((now - fix.at) / 1000)) : null
  const [first = '', last = ''] = (state?.route_name || '').split(' - ')
  const heading = d => (d === 1 ? last : first)
  const routeName = state?.route_name || 'the route'
  const styles = useMemo(() => ({
    big: { color: t.ink, fontSize: 64, fontWeight: '800', letterSpacing: -2 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  }), [t])

  // First: choose the bus
  if (!busId) {
    return (
      <SelectBus ctx={ctx} session={session} role="driver" where={where} onSwitchRole={onSwitchRole} onChangeRoute={onChangeRoute} onSignOut={onSignOut}
        onPick={b => { setBusId(b.id); setDirection(b.direction) }} />
    )
  }

  const modeNote = where?.status === 'ok'
    ? (onRoute ? 'Your phone is on the route, so real GPS was chosen.' : `${describeLocation(where)} Demo GPS was chosen.`)
    : `${describeLocation(where)} Demo GPS was chosen.`

  return (
    <Screen>
      <Header title="Driver" subtitle={state?.route_name || 'Share your bus location'} online={online} onSettings={() => setShowServer(!showServer)} />
      {showServer && <ServerPanel url={server} custom={custom} setCustom={setCustom} online={online} onClose={() => setShowServer(false)} />}
      {!trip && <SessionBar session={session} role="Driver" onSwitchRole={onSwitchRole} onSignOut={onSignOut} />}

      {!trip ? (
        <>
          <Card>
            <View style={styles.row}>
              <View>
                <Muted>Your bus</Muted>
                <Text style={{ color: t.ink, fontSize: 24, fontWeight: '800' }}>{selected}</Text>
              </View>
              <Button title="Change bus" kind="ghost" onPress={() => setBusId(null)} style={{ paddingVertical: 10, paddingHorizontal: 16 }} />
            </View>
          </Card>

          <Card>
            <Title>Direction</Title>
            <Chips>
              <Chip label={`To ${last}`} on={direction === 1} onPress={() => setDirection(1)} />
              <Chip label={`To ${first}`} on={direction === -1} onPress={() => setDirection(-1)} />
            </Chips>
          </Card>

          <Card>
            <Title>Location source</Title>
            <Chips>
              <Chip label="Demo GPS" on={source === 'demo'} onPress={() => setSource('demo')} />
              <Chip label="Real phone GPS" on={source === 'real'} onPress={() => setSource('real')} />
            </Chips>
            <Muted style={{ marginTop: 10 }}>{modeNote}</Muted>
            <Muted style={{ marginTop: 4 }}>
              {source === 'demo'
                ? `Demo GPS: the phone drives along the ${routeName} route by itself.`
                : `Real GPS: the bus only moves while the phone is within 500 m of the ${routeName} road.`}
            </Muted>
          </Card>

          <Button title="Start trip" onPress={startTrip} disabled={!online || !selected} />
          {fix.error ? <Text style={{ color: t.red, fontWeight: '600' }}>{fix.error}</Text> : null}
        </>
      ) : (
        <>
          <Card>
            <View style={styles.row}>
              <View>
                <Muted>{trip.busId} to {heading(trip.direction)}</Muted>
                <Text style={styles.big}>{Math.round(mine?.speed_kmh ?? 0)}<Text style={{ fontSize: 22, letterSpacing: 0 }}> km/h</Text></Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: fix.error || fix.status === 'off_route' ? t.red : t.green }} />
                  <Text style={{ color: t.ink, fontWeight: '700' }}>{fix.error ? 'Not sending' : fix.status === 'off_route' ? 'Off route' : 'Sharing'}</Text>
                </View>
                <Muted>{ago === null ? 'Waiting for GPS...' : `sent ${ago} s ago`}</Muted>
              </View>
            </View>
            {fix.error ? <Text style={{ color: t.red, fontWeight: '600', marginTop: 10 }}>{fix.error}</Text> : null}
            {fix.status === 'off_route' ? (
              <Text style={{ color: t.red, fontWeight: '600', marginTop: 10 }}>
                You are {fix.offRoute >= 1000 ? `${(fix.offRoute / 1000).toFixed(0)} km` : `${fix.offRoute} m`} from the route, so passengers cannot see you moving.
                {trip.source === 'real' ? ' End the trip and choose Demo GPS to test the app.' : ''}
              </Text>
            ) : null}
            {atEnd ? <Text style={{ color: t.muted, marginTop: 10 }}>End of the route reached. You can end the trip.</Text> : null}
          </Card>

          {mine && (
            <Card>
              <Title>Passengers see</Title>
              <Text style={{ color: t.ink, fontSize: 20, fontWeight: '700' }}>Next stop: {mine.next_stop}</Text>
              <Muted>arriving in about {minutesText(mine.eta_next_min)}</Muted>
              <View style={{ marginTop: 10 }}><Badge level={mine.crowd} label={mine.crowd_label} /></View>
              <Muted style={{ marginTop: 6 }}>The conductor sets how full the bus is.</Muted>
            </Card>
          )}

          {trip.source === 'demo' && (
            <Card>
              <Title>Demo traffic</Title>
              <Chips>
                {DEMO_SPEEDS.map(([v, label]) => <Chip key={v} label={`${label} (${v} km/h)`} on={demoSpeed === v} onPress={() => setDemoSpeed(v)} />)}
              </Chips>
              <Muted style={{ marginTop: 10 }}>Slow down here and watch the passengers' arrival times grow.</Muted>
            </Card>
          )}

          <Button title="End trip" kind="ghost" onPress={endTrip} />
        </>
      )}
    </Screen>
  )
}
