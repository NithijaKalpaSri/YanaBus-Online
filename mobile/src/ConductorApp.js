import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { get, minutesText, post } from './api'
import { levelColors, useTheme } from './theme'
import { Badge, Button, Card, Chip, Chips, Header, Meter, Muted, Screen, ServerPanel, SessionBar, Title } from './ui'
import SelectBus from './SelectBus'

const SEAT_OPTIONS = [
  ['green', 'Seats available', 'Plenty of empty seats'],
  ['orange', 'Standing room', 'No seats left, people can stand'],
  ['red', 'Full', 'No room for more people'],
]

/**
 * The conductor never starts a trip. The driver does. This screen follows the bus the conductor chose:
 * until the driver starts, it waits; once the trip is running it shows the people on board, the direction
 * and the next stop, and lets the conductor set the seat status and issue tickets.
 */
export default function ConductorApp({ ctx, session, where, onSwitchRole, onChangeRoute, onSignOut }) {
  const t = useTheme()
  const { server, custom, setCustom, state, online, setData } = ctx
  const [route, setRoute] = useState(null)
  const [showServer, setShowServer] = useState(false)
  const [busId, setBusId] = useState(null)
  const [dest, setDest] = useState(null)
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)
  const wasOn = useRef(null)

  useEffect(() => { if (server && online && !route) get(server, `/api/route?route=${ctx.routeId}`).then(setRoute).catch(() => {}) }, [server, online, route, ctx.routeId])
  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(''), 2600)
    return () => clearTimeout(timer)
  }, [toast])

  const buses = state?.buses || []
  const bus = buses.find(b => b.id === busId)          // chosen on the bus screen
  const tripOn = !!bus?.trip_active

  // say so when the driver starts or ends the trip (not when the conductor first opens the bus)
  useEffect(() => { wasOn.current = null }, [busId])
  useEffect(() => {
    if (!bus) return
    if (wasOn.current !== null && wasOn.current !== tripOn) setToast(tripOn ? 'The driver started the trip' : 'The driver ended the trip')
    wasOn.current = tripOn
  }, [tripOn, bus?.id])   // eslint-disable-line react-hooks/exhaustive-deps

  // stops this bus still visits, in the order it reaches them
  const ahead = !bus || !route ? [] : bus.direction === 1
    ? route.stops.filter(s => s.id >= bus.next_stop_id)
    : route.stops.filter(s => s.id <= bus.next_stop_id).reverse()
  const destId = ahead.some(s => s.id === dest) ? dest : ahead[0]?.id
  const destName = route?.stops[destId]?.name

  // send something to the server and show the bus it returns straight away
  const act = async (path, body, okText) => {
    setBusy(true)
    try {
      const updated = await post(server, path, body)
      setData(s => ({ ...s, buses: s.buses.map(b => (b.id === updated.id ? updated : b)) }))
      setToast(okText)
    } catch (e) {
      setToast(e.message)
    } finally {
      setBusy(false)
    }
  }
  const setSeats = (level, label) => act('/api/conductor/crowd', { bus_id: bus.id, level }, label)
  const issueTicket = () => act('/api/conductor/ticket', { bus_id: bus.id, to_stop: destId }, `Ticket issued to ${destName}`)

  // First: choose the bus
  if (!busId) {
    return (
      <SelectBus ctx={ctx} session={session} role="conductor" where={where} onSwitchRole={onSwitchRole} onChangeRoute={onChangeRoute} onSignOut={onSignOut}
        onPick={b => { setBusId(b.id); setDest(null) }} />
    )
  }

  const first = ctx.state?.route_name?.split(' - ')[0] || ''
  const last = ctx.state?.route_name?.split(' - ')[1] || ''
  const from = bus?.direction === 1 ? first : last
  const to = bus?.direction === 1 ? last : first

  return (
    <Screen toast={toast}>
      <Header title="Conductor" subtitle={state?.route_name || 'Tell passengers how full the bus is'} online={online} onSettings={() => setShowServer(!showServer)} />
      {showServer && <ServerPanel url={server} custom={custom} setCustom={setCustom} online={online} onClose={() => setShowServer(false)} />}
      <SessionBar session={session} role="Conductor" onSwitchRole={onSwitchRole} onSignOut={onSignOut} />

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Muted>Your bus</Muted>
            <Text style={{ color: t.ink, fontSize: 24, fontWeight: '800' }}>{busId}</Text>
          </View>
          <Button title="Change bus" kind="ghost" onPress={() => setBusId(null)} style={{ paddingVertical: 10, paddingHorizontal: 16 }} />
        </View>
      </Card>

      {bus && !tripOn && (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <ActivityIndicator color={t.ink} />
            <Text style={{ color: t.ink, fontSize: 20, fontWeight: '800', flex: 1 }}>Waiting for the driver</Text>
          </View>
          <Muted style={{ marginTop: 10, fontSize: 16 }}>
            The driver of {bus.id} has not started the trip yet. Only the driver can start it.
          </Muted>
          <Muted style={{ marginTop: 8 }}>
            This screen updates by itself when the trip starts. You will then see the people on board, the direction and the next stop.
          </Muted>
        </Card>
      )}

      {bus && tripOn && (
        <>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.greenBg, borderRadius: 999,
                paddingVertical: 4, paddingHorizontal: 10 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.green }} />
                <Text style={{ color: t.greenInk, fontWeight: '700', fontSize: 13 }}>Trip in progress</Text>
              </View>
              {bus.trip_started ? <Muted>Started {bus.trip_started}</Muted> : null}
            </View>
            <Text style={{ color: t.ink, fontSize: 18, fontWeight: '700', marginTop: 10 }}>{from} {'→'} {to}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginVertical: 8 }}>
              <Text style={{ color: t.ink, fontSize: 56, fontWeight: '800', letterSpacing: -2 }}>
                {bus.passengers}<Text style={{ fontSize: 18, fontWeight: '600', letterSpacing: 0 }}> on board</Text>
              </Text>
              <Badge level={bus.crowd} label={bus.crowd_label} />
            </View>
            <Meter count={bus.passengers} seats={bus.seats} level={bus.crowd} />
            <Muted style={{ marginTop: 10 }}>Next stop: {bus.next_stop}, in about {minutesText(bus.eta_next_min)}</Muted>
          </Card>

          <Card>
            <Title>How full is the bus?</Title>
            <View style={{ gap: 10 }}>
              {SEAT_OPTIONS.map(([level, label, hint]) => {
                const c = levelColors(t, level)
                const on = bus.crowd === level
                return (
                  <Pressable key={level} disabled={busy} onPress={() => setSeats(level, `Marked: ${label}`)} accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16,
                      borderWidth: 2, borderColor: on ? c.dot : t.line, backgroundColor: on ? c.bg : t.surface, opacity: pressed ? 0.85 : 1 })}>
                    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.dot }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: on ? c.ink : t.ink, fontSize: 18, fontWeight: '800' }}>{label}</Text>
                      <Text style={{ color: on ? c.ink : t.muted }}>{hint}</Text>
                    </View>
                    {on ? <Text style={{ color: c.ink, fontSize: 22, fontWeight: '800' }}>{'✓'}</Text> : null}
                  </Pressable>
                )
              })}
            </View>
            <Pressable onPress={() => setSeats('auto', 'Back to automatic')} style={{ paddingVertical: 12 }}>
              <Text style={{ color: t.accent, fontWeight: '700' }}>Back to automatic (from tickets)</Text>
            </Pressable>
            <Muted>Your choice stays until the bus reaches the next stop.</Muted>
          </Card>

          <Card>
            <Title>Issue a ticket</Title>
            <Muted style={{ marginBottom: 8 }}>Passenger gets off at</Muted>
            <Chips>
              {ahead.map(s => <Chip key={s.id} label={s.name} on={s.id === destId} onPress={() => setDest(s.id)} />)}
            </Chips>
            <Button title={destName ? `Issue ticket to ${destName}` : 'Issue ticket'} onPress={issueTicket}
              disabled={busy || destId === undefined} style={{ marginTop: 14 }} />
          </Card>
        </>
      )}
    </Screen>
  )
}
