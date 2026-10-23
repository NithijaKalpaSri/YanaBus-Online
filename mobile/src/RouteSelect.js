import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { usePoll } from './api'
import { describeLocation, distanceText } from './locate'
import { useTheme } from './theme'
import { Header, Muted, Screen, ServerPanel, SessionBar } from './ui'

/**
 * Staff step: choose the route you are working on. If the phone is on a route, that route is suggested first.
 */
export default function RouteSelect({ ctx, session, role, where, onPick, onSwitchRole, onSignOut }) {
  const t = useTheme()
  const [showServer, setShowServer] = useState(false)
  const { data: routes } = usePoll(ctx.server, '/api/routes', 0)
  const known = where?.status === 'ok'
  const sorted = routes && known ? [...routes].sort((a, b) => (b.id === where.route_id) - (a.id === where.route_id)) : routes

  return (
    <Screen>
      <Header title={role === 'driver' ? 'Driver' : 'Conductor'} subtitle="Choose your route to continue"
        online={ctx.online} onSettings={() => setShowServer(!showServer)} />
      {showServer && <ServerPanel url={ctx.server} custom={ctx.custom} setCustom={ctx.setCustom} online={ctx.online} onClose={() => setShowServer(false)} />}
      <SessionBar session={session} role={role === 'driver' ? 'Driver' : 'Conductor'} onSwitchRole={onSwitchRole} onSignOut={onSignOut} />

      <View>
        <Text style={{ color: t.ink, fontSize: 22, fontWeight: '800' }}>Which route are you working on?</Text>
        {where ? <Muted style={{ marginTop: 6 }}>{describeLocation(where)}</Muted> : null}
      </View>

      {(sorted || []).map(r => {
        const suggested = known && r.id === where.route_id && where.on_route
        return (
          <Pressable key={r.id} onPress={() => onPick(r.id)} accessibilityRole="button" accessibilityLabel={`Select route ${r.name}`}
            style={({ pressed }) => ({ padding: 16, borderRadius: 18, backgroundColor: t.surface, opacity: pressed ? 0.85 : 1,
              borderWidth: suggested ? 2 : 1, borderColor: suggested ? t.green : t.line })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: t.ink, fontSize: 20, fontWeight: '800', flex: 1 }}>{r.name}</Text>
              <Text style={{ color: t.muted, fontSize: 26 }}>{'›'}</Text>
            </View>
            <Muted>{r.length_km} km &middot; {r.buses} buses &middot; {r.trips_running} trip{r.trips_running === 1 ? '' : 's'} running</Muted>
            {suggested ? <Text style={{ color: t.green, fontWeight: '700', marginTop: 4 }}>You are on this route</Text> : null}
          </Pressable>
        )
      })}
      {!routes && <Muted>{ctx.online ? 'Loading routes...' : 'Waiting for the server...'}</Muted>}
    </Screen>
  )
}
