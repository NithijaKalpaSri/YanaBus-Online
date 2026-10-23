import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { describeLocation, distanceText } from './locate'
import { useTheme } from './theme'
import { Header, Muted, Screen, ServerPanel, SessionBar } from './ui'

/**
 * Pick the bus you are working on. The bus nearest to your phone (if you are on the route) is
 * suggested first. In a real system the bus would be assigned when you sign in.
 */
export default function SelectBus({ ctx, session, role, where, onPick, onSwitchRole, onChangeRoute, onSignOut }) {
  const t = useTheme()
  const [showServer, setShowServer] = useState(false)
  const buses = ctx.state?.buses || []
  // the suggestion only counts when the phone is on the route that was chosen
  const nearest = where?.route_id === ctx.routeId ? where?.nearest_bus : null
  const sorted = nearest ? [...buses].sort((a, b) => (b.id === nearest.id) - (a.id === nearest.id)) : buses
  const heading = b => b.direction_label

  return (
    <Screen>
      <Header title={role === 'driver' ? 'Driver' : 'Conductor'} subtitle="Select your bus to continue"
        online={ctx.online} onSettings={() => setShowServer(!showServer)} />
      {showServer && <ServerPanel url={ctx.server} custom={ctx.custom} setCustom={ctx.setCustom} online={ctx.online} onClose={() => setShowServer(false)} />}
      <SessionBar session={session} role={role === 'driver' ? 'Driver' : 'Conductor'} onSwitchRole={onSwitchRole} onSignOut={onSignOut} />

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: t.surface,
        borderRadius: 14, borderWidth: 1, borderColor: t.line, paddingVertical: 10, paddingHorizontal: 14 }}>
        <View>
          <Muted>Route</Muted>
          <Text style={{ color: t.ink, fontWeight: '800', fontSize: 17 }}>{ctx.state?.route_name || '...'}</Text>
        </View>
        <Pressable onPress={onChangeRoute} accessibilityRole="button"><Text style={{ color: t.accent, fontWeight: '700' }}>Change route</Text></Pressable>
      </View>

      <View>
        <Text style={{ color: t.ink, fontSize: 22, fontWeight: '800' }}>Which bus are you on?</Text>
        <Muted style={{ marginTop: 4 }}>
          Choose your bus number plate. The driver and the conductor of the same bus must choose the same bus.
        </Muted>
        {where ? <Muted style={{ marginTop: 8 }}>{describeLocation(where)}</Muted> : null}
      </View>

      {sorted.map(b => {
        const isNearest = nearest && b.id === nearest.id
        return (
          <Pressable key={b.id} onPress={() => onPick(b)} accessibilityRole="button" accessibilityLabel={`Select bus ${b.id}`}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 18,
              backgroundColor: t.surface, borderWidth: isNearest ? 2 : 1, borderColor: isNearest ? t.green : t.line, opacity: pressed ? 0.85 : 1 })}>
            <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: t.brandInk, fontWeight: '800', fontSize: 13 }}>BUS</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: t.ink, fontSize: 20, fontWeight: '800' }}>{b.id}</Text>
              <Muted>To {heading(b)} &middot; next stop {b.next_stop}</Muted>
              <Text style={{ color: b.trip_active ? t.green : t.muted, fontWeight: '700' }}>
                {b.trip_active ? `Trip in progress${b.trip_started ? ` since ${b.trip_started}` : ''}` : 'Trip not started'}
              </Text>
              {isNearest ? (
                <Text style={{ color: t.green, fontWeight: '700', marginTop: 2 }}>Nearest to you &middot; {distanceText(nearest.distance_m)} away</Text>
              ) : null}
            </View>
            <Text style={{ color: t.muted, fontSize: 26 }}>{'›'}</Text>
          </Pressable>
        )
      })}
      {!buses.length && <Muted>{ctx.online ? 'No buses found.' : 'Waiting for the server...'}</Muted>}
    </Screen>
  )
}
