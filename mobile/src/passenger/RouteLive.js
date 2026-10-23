import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { minutesText, usePoll } from '../api'
import { levelColors, useTheme } from '../theme'
import { Badge, Meter, Muted } from '../ui'
import BusMap from './BusMap'

// what the passenger needs to know about a bus: are there seats?
function seatsText(b) {
  if (b.crowd === 'green') return `${Math.max(0, b.seats - b.passengers)} seats free`
  if (b.crowd === 'orange') return 'No seats, you can stand'
  return 'Full, no room'
}

function Legend() {
  const t = useTheme()
  const items = [['green', 'Seats available'], ['orange', 'Standing room'], ['red', 'Full']]
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 8, backgroundColor: t.surface, borderBottomWidth: 1, borderBottomColor: t.line }}>
      {items.map(([level, label]) => (
        <View key={level} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: levelColors(t, level).dot }} />
          <Text style={{ color: t.ink, fontWeight: '600', fontSize: 13 }}>{label}</Text>
        </View>
      ))}
    </View>
  )
}

/** One route, live: map with the buses (coloured by how full they are) and the list of buses. */
export default function RouteLive({ ctx, routeId, stopId: firstStop, pos, onBack }) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const { data: route } = usePoll(ctx.server, `/api/route?route=${routeId}`, 0)
  const { data: state } = usePoll(ctx.server, `/api/state?route=${routeId}`, 2000)
  const [stopId, setStopId] = useState(firstStop ?? null)
  const [busId, setBusId] = useState(null)
  const { data: eta } = usePoll(ctx.server, stopId !== null ? `/api/stops/${stopId}/eta?route=${routeId}` : null, 2000)

  useEffect(() => { setStopId(firstStop ?? null); setBusId(null) }, [routeId, firstStop])

  const buses = state?.buses || []
  const stopName = route && stopId !== null ? route.stops[stopId]?.name : null
  const etaOf = id => eta?.buses?.find(x => x.bus === id)

  // when a stop is chosen, the buses coming to it are listed first
  const sorted = [...buses].sort((a, b) => {
    const ea = etaOf(a.id)?.eta_min ?? 1e9
    const eb = etaOf(b.id)?.eta_min ?? 1e9
    return ea - eb || a.id.localeCompare(b.id)
  })

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      {/* title bar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: t.surface }}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back"
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: t.ink, fontSize: 22, fontWeight: '700' }}>{'‹'}</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.ink, fontSize: 19, fontWeight: '800' }} numberOfLines={1}>{route?.name || '...'}</Text>
          <Muted>{state ? `${buses.length} buses live · ${state.time}` : 'Loading...'}</Muted>
        </View>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: ctx.online ? t.green : t.red }} />
      </View>
      {state?.alert ? (
        <View style={{ backgroundColor: levelColors(t, 'orange').bg, paddingVertical: 8, paddingHorizontal: 14 }}>
          <Text style={{ color: levelColors(t, 'orange').ink, fontWeight: '700' }}>{state.alert}</Text>
        </View>
      ) : null}

      {/* map */}
      <View style={{ flex: 5, backgroundColor: t.surface2 }}>
        {route ? (
          <BusMap route={route} buses={state?.buses} userPos={pos} stopId={stopId} busId={busId}
            onStop={id => { setStopId(id); setBusId(null) }} onBus={id => setBusId(id)} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={t.ink} /></View>
        )}
      </View>
      <Legend />

      {/* stop + buses */}
      <ScrollView style={{ flex: 6 }} contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: insets.bottom + 24 }}>
        <View style={{ backgroundColor: t.surface, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: t.line }}>
          {stopName ? (
            <>
              <Muted>Your stop</Muted>
              <Text style={{ color: t.ink, fontSize: 20, fontWeight: '800' }}>{stopName}</Text>
              {eta?.buses?.length ? eta.buses.slice(0, 3).map(b => (
                <View key={b.bus} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.ink, fontWeight: '700' }}>{b.bus}</Text>
                    <Muted>to {b.heading.replace(' Bus Stand', '')}</Muted>
                  </View>
                  <Badge level={b.crowd} label={b.crowd_label} />
                  <Text style={{ color: t.ink, fontSize: 19, fontWeight: '800', width: 74, textAlign: 'right' }}>{minutesText(b.eta_min)}</Text>
                </View>
              )) : <Muted style={{ marginTop: 6 }}>No bus is heading to this stop right now.</Muted>}
            </>
          ) : (
            <>
              <Text style={{ color: t.ink, fontSize: 17, fontWeight: '800' }}>Where are you waiting?</Text>
              <Muted>Tap a stop (white dot) on the map to see when the next bus arrives.</Muted>
            </>
          )}
        </View>

        <Text style={{ color: t.muted, fontWeight: '700', fontSize: 13, letterSpacing: 0.6, textTransform: 'uppercase' }}>Buses on this route</Text>
        {sorted.map(b => {
          const sel = b.id === busId
          const e = etaOf(b.id)
          const c = levelColors(t, b.crowd)
          return (
            <Pressable key={b.id} onPress={() => setBusId(sel ? null : b.id)} accessibilityRole="button"
              style={({ pressed }) => ({ backgroundColor: t.surface, borderRadius: 18, padding: 14, borderWidth: sel ? 2 : 1,
                borderColor: sel ? t.ink : t.line, opacity: pressed ? 0.85 : 1 })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.dot, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: b.crowd === 'orange' ? '#3b2f00' : '#fff', fontWeight: '800', fontSize: 16 }}>{b.passengers}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 17, fontWeight: '800' }}>{b.id}</Text>
                  <Muted>to {b.direction_label} {b.trip_active ? '· trip started' : ''}</Muted>
                </View>
                <Badge level={b.crowd} label={b.crowd_label} />
              </View>
              <View style={{ marginTop: 10 }}><Meter count={b.passengers} seats={b.seats} level={b.crowd} /></View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                <Text style={{ color: t.ink, fontWeight: '600' }}>{b.passengers} on board &middot; {seatsText(b)}</Text>
              </View>
              <Muted style={{ marginTop: 4 }}>
                Next stop {b.next_stop} in {minutesText(b.eta_next_min)}
                {e && stopName ? ` · reaches ${stopName} in ${minutesText(e.eta_min)}` : ''}
              </Muted>
            </Pressable>
          )
        })}
        {!buses.length && <Muted>{ctx.online ? 'No buses on this route right now.' : 'Waiting for the server...'}</Muted>}
      </ScrollView>
    </View>
  )
}
