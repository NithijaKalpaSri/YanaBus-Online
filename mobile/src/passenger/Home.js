import { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import { minutesText, usePoll } from '../api'
import { distanceText } from '../locate'
import { levelColors, useTheme } from '../theme'
import { Badge, Button, Card, Header, Muted, Screen, ServerPanel } from '../ui'

const NEAR_M = 1500       // a route is "near you" when its road is closer than this

function RouteCard({ r, onPress, showStop }) {
  const t = useTheme()
  const nb = r.next_bus
  const c = nb ? levelColors(t, nb.crowd) : null
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open route ${r.name}`}
      style={({ pressed }) => ({ backgroundColor: t.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: t.line, opacity: pressed ? 0.85 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: t.ink, fontSize: 20, fontWeight: '800', flex: 1 }}>{r.name}</Text>
        <Text style={{ color: t.muted, fontSize: 26 }}>{'›'}</Text>
      </View>
      <Muted>{r.from} {'→'} {r.to} &middot; {r.length_km} km &middot; {r.buses} buses</Muted>
      {showStop && r.nearest_stop ? (
        <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.line, gap: 6 }}>
          <Text style={{ color: t.ink, fontWeight: '700' }}>
            {r.nearest_stop.name} <Text style={{ color: t.muted, fontWeight: '500' }}>&middot; stop {distanceText(r.nearest_stop.distance_m)} away</Text>
          </Text>
          {nb ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ color: t.ink, fontSize: 18, fontWeight: '800' }}>{minutesText(nb.eta_min)}</Text>
              <Muted>next bus to {nb.heading.replace(' Bus Stand', '')}</Muted>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.bg, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.dot }} />
                <Text style={{ color: c.ink, fontWeight: '700', fontSize: 12 }}>{nb.crowd_label}</Text>
              </View>
            </View>
          ) : <Muted>No bus is heading to this stop right now.</Muted>}
        </View>
      ) : null}
    </Pressable>
  )
}

function SectionTitle({ children }) {
  const t = useTheme()
  return <Text style={{ color: t.muted, fontWeight: '700', fontSize: 13, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 6 }}>{children}</Text>
}

/**
 * Home screen: finds the routes near the phone's location, or lets the passenger search a route or a stop.
 * `pos`: undefined = still looking, null = not available, { denied: true } = no permission, { lat, lng } = found.
 */
export default function Home({ ctx, pos, onRetryLocation, onOpen }) {
  const t = useTheme()
  const [q, setQ] = useState('')
  const [showServer, setShowServer] = useState(false)
  const hasPos = !!pos && pos.lat !== undefined
  const { data: routes } = usePoll(ctx.server, '/api/routes', 0)
  const { data: nearby } = usePoll(ctx.server, hasPos ? `/api/routes/nearby?lat=${pos.lat}&lng=${pos.lng}` : null, 5000)

  const near = (nearby || []).filter(r => r.distance_m <= NEAR_M)
  const others = (nearby || []).filter(r => r.distance_m > NEAR_M)

  // search: a route name, or any stop on a route
  const query = q.trim().toLowerCase()
  const results = useMemo(() => {
    if (!query || !routes) return []
    return routes.map(r => {
      const stopIdx = r.stops.findIndex(n => n.toLowerCase().includes(query))
      if (stopIdx >= 0) return { r, stopIdx, label: `Stop: ${r.stops[stopIdx]}` }
      if (r.name.toLowerCase().includes(query)) return { r, stopIdx: null, label: 'Route' }
      return null
    }).filter(Boolean)
  }, [query, routes])

  const nearestStop = near[0]?.nearest_stop?.name
  return (
    <Screen>
      <Header title="YanaBus" subtitle="Find your bus" online={ctx.online} onSettings={() => setShowServer(!showServer)} />
      {showServer && <ServerPanel url={ctx.server} custom={ctx.custom} setCustom={ctx.setCustom} online={ctx.online} onClose={() => setShowServer(false)} />}

      {/* where am I */}
      <Card>
        {pos === undefined ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <ActivityIndicator color={t.ink} />
            <Text style={{ color: t.ink, fontWeight: '700' }}>Finding your location...</Text>
          </View>
        ) : hasPos ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.muted, fontWeight: '600' }}>Your location</Text>
              <Text style={{ color: t.ink, fontSize: 19, fontWeight: '800' }}>
                {nearby ? (nearestStop ? `Near ${nearestStop}` : 'Not close to a bus route') : 'Looking for routes...'}
              </Text>
            </View>
            <Pressable onPress={onRetryLocation} accessibilityRole="button"><Text style={{ color: t.accent, fontWeight: '700' }}>Refresh</Text></Pressable>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <Text style={{ color: t.ink, fontSize: 17, fontWeight: '800' }}>
              {pos?.denied ? 'Location is turned off for YanaBus' : 'We could not find your location'}
            </Text>
            <Muted>Turn it on to see the routes near you, or search for a route or stop below.</Muted>
            <Button title="Use my location" onPress={onRetryLocation} style={{ paddingVertical: 12 }} />
          </View>
        )}
      </Card>

      {/* search */}
      <TextInput value={q} onChangeText={setQ} placeholder="Search a route or stop, e.g. Matara or Koggala"
        placeholderTextColor={t.muted} autoCorrect={false} autoCapitalize="none" returnKeyType="search" clearButtonMode="while-editing"
        style={{ borderWidth: 1, borderColor: t.line, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, color: t.ink, backgroundColor: t.surface, fontSize: 17 }} />

      {query ? (
        <>
          <SectionTitle>{results.length ? 'Search results' : 'No match'}</SectionTitle>
          {results.map(({ r, stopIdx, label }) => (
            <Pressable key={r.id} onPress={() => onOpen(r.id, stopIdx)} accessibilityRole="button"
              style={({ pressed }) => ({ backgroundColor: t.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: t.line, opacity: pressed ? 0.85 : 1 })}>
              <Text style={{ color: t.ink, fontSize: 18, fontWeight: '800' }}>{r.name}</Text>
              <Muted>{label} &middot; {r.from} {'→'} {r.to}</Muted>
            </Pressable>
          ))}
          {!results.length && <Muted>No route or stop matches "{q.trim()}". Try a town name like Galle, Weligama or Hikkaduwa.</Muted>}
        </>
      ) : hasPos ? (
        <>
          <SectionTitle>Routes near you</SectionTitle>
          {near.map(r => <RouteCard key={r.id} r={r} showStop onPress={() => onOpen(r.id, r.nearest_stop.id)} />)}
          {nearby && !near.length && <Muted>No bus route passes within 1.5 km of you. Search above, or pick a route below.</Muted>}
          {others.length ? <SectionTitle>Other routes</SectionTitle> : null}
          {others.map(r => (
            <RouteCard key={r.id} r={r} onPress={() => onOpen(r.id, null)} />
          ))}
        </>
      ) : (
        <>
          <SectionTitle>All routes</SectionTitle>
          {(routes || []).map(r => <RouteCard key={r.id} r={r} onPress={() => onOpen(r.id, null)} />)}
          {!routes && <Muted>{ctx.online ? 'Loading routes...' : 'Waiting for the server...'}</Muted>}
        </>
      )}
    </Screen>
  )
}
