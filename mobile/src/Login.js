import { useState } from 'react'
import { Text } from 'react-native'
import { post } from './api'
import { useTheme } from './theme'
import { Button, Card, Field, Header, Muted, Screen, ServerPanel, Title } from './ui'

/** Staff sign in. The server checks the staff ID and PIN against data/staff.json (demo accounts). */
export default function Login({ ctx, onSignIn }) {
  const t = useTheme()
  const [staffId, setStaffId] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showServer, setShowServer] = useState(false)

  const submit = async () => {
    if (!staffId.trim() || !pin.trim()) { setError('Enter your staff ID and PIN.'); return }
    setBusy(true)
    setError('')
    try {
      onSignIn(await post(ctx.server, '/api/auth/login', { staff_id: staffId, pin }))
    } catch (e) {
      setError(e.message === 'Network request failed' || e.name === 'AbortError' ? 'Cannot reach the server. Check the Wi-Fi.' : e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <Header title="YanaBus - Drivers" subtitle="Driver and conductor sign in" online={ctx.online} onSettings={() => setShowServer(!showServer)} />
      {showServer && <ServerPanel url={ctx.server} custom={ctx.custom} setCustom={ctx.setCustom} online={ctx.online} onClose={() => setShowServer(false)} />}

      <Card>
        <Title>Sign in</Title>
        <Field label="Staff ID" value={staffId} onChangeText={setStaffId} autoCapitalize="characters" />
        <Field label="PIN" value={pin} onChangeText={setPin} secure keyboardType="number-pad" onSubmit={submit} />
        {error ? <Text style={{ color: t.red, fontWeight: '600', marginBottom: 10 }}>{error}</Text> : null}
        <Button title={busy ? 'Signing in...' : 'Sign in'} onPress={submit} disabled={busy || !ctx.online} />
        <Muted style={{ marginTop: 12 }}>
          Demo accounts are listed in data/staff.json on the laptop that runs YanaBus.
        </Muted>
      </Card>
    </Screen>
  )
}
