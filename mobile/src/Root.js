import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { usePoll, useServer } from './api'
import { useTheme } from './theme'
import { findMe } from './locate'
import Login from './Login'
import RoleSelect from './RoleSelect'
import RouteSelect from './RouteSelect'
import DriverApp from './DriverApp'
import ConductorApp from './ConductorApp'

const SESSION_KEY = 'yanabus-session'

/**
 * The "YanaBus - Drivers" app in one place:
 *   sign in -> choose Driver or Conductor (the app finds your location) -> choose your route -> choose your bus -> your screen
 */
export default function Root() {
  const t = useTheme()
  const [server, custom, setCustom] = useServer()
  const [routeId, setRouteId] = useState(null)
  const { data: state, online, setData } = usePoll(server, routeId ? `/api/state?route=${routeId}` : '/api/state', 2000)
  const ctx = { server, custom, setCustom, state, online, setData, routeId }

  const [session, setSession] = useState(undefined)     // undefined = still reading storage, null = signed out
  const [role, setRole] = useState(null)
  const [finding, setFinding] = useState(null)          // the role being set up while we look for the location
  const [where, setWhere] = useState(null)              // result of findMe()

  useEffect(() => {
    AsyncStorage.getItem(SESSION_KEY)
      .then(v => setSession(v ? JSON.parse(v) : null))
      .catch(() => setSession(null))
  }, [])

  const signIn = s => {
    setSession(s)
    AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s)).catch(() => {})
  }
  const signOut = () => {
    setSession(null)
    setRole(null)
    setRouteId(null)
    setWhere(null)
    AsyncStorage.removeItem(SESSION_KEY).catch(() => {})
  }
  const switchRole = () => { setRole(null); setRouteId(null) }
  const chooseRole = async r => {
    setFinding(r)
    setWhere(await findMe(server))
    setFinding(null)
    setRole(r)
  }

  if (session === undefined || !server) {
    return <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: t.muted }}>Loading...</Text></View>
  }
  if (!session) return <Login ctx={ctx} onSignIn={signIn} />
  if (!role) return <RoleSelect ctx={ctx} session={session} finding={finding} onChoose={chooseRole} onSignOut={signOut} />
  if (!routeId) {
    return <RouteSelect ctx={ctx} session={session} role={role} where={where} onPick={setRouteId} onSwitchRole={switchRole} onSignOut={signOut} />
  }

  const props = { ctx, session, where, onSwitchRole: switchRole, onChangeRoute: () => setRouteId(null), onSignOut: signOut }
  return role === 'driver' ? <DriverApp {...props} /> : <ConductorApp {...props} />
}
