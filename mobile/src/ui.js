import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { get } from './api'
import { LEVEL_TEXT, levelColors, useTheme } from './theme'

export function Screen({ children, toast }) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 14, maxWidth: 560, width: '100%', alignSelf: 'center' }}
        keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {toast ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 24, alignItems: 'center' }}>
          <View style={{ backgroundColor: t.brand, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 999 }}>
            <Text style={{ color: t.brandInk, fontWeight: '700' }}>{toast}</Text>
          </View>
        </View>
      ) : null}
    </View>
  )
}

export function Card({ children, style }) {
  const t = useTheme()
  return <View style={[{ backgroundColor: t.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: t.line }, style]}>{children}</View>
}

export const Title = ({ children }) => {
  const t = useTheme()
  return <Text style={{ color: t.ink, fontSize: 17, fontWeight: '700', marginBottom: 10 }}>{children}</Text>
}
export const Muted = ({ children, style }) => {
  const t = useTheme()
  return <Text style={[{ color: t.muted, fontSize: 14 }, style]}>{children}</Text>
}

export function Button({ title, onPress, kind = 'primary', disabled, style }) {
  const t = useTheme()
  const primary = kind === 'primary'
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={({ pressed }) => [{
        backgroundColor: primary ? t.brand : t.surface, borderWidth: primary ? 0 : 1, borderColor: t.line,
        borderRadius: 16, paddingVertical: 16, alignItems: 'center', opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
      }, style]}>
      <Text style={{ color: primary ? t.brandInk : t.ink, fontWeight: '700', fontSize: 17 }}>{title}</Text>
    </Pressable>
  )
}

export function Chip({ label, on, onPress }) {
  const t = useTheme()
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!on }}
      style={{ paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1,
        borderColor: on ? t.brand : t.line, backgroundColor: on ? t.brand : t.surface }}>
      <Text style={{ color: on ? t.brandInk : t.ink, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  )
}
export const Chips = ({ children }) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>

export function Badge({ level, label }) {
  const t = useTheme()
  const c = levelColors(t, level)
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: c.bg,
      paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.dot }} />
      <Text style={{ color: c.ink, fontWeight: '700', fontSize: 13 }}>{label || LEVEL_TEXT[level]}</Text>
    </View>
  )
}

export function Meter({ count, seats = 50, level }) {
  const t = useTheme()
  const c = levelColors(t, level)
  return (
    <View style={{ height: 10, borderRadius: 5, backgroundColor: t.surface2, overflow: 'hidden' }}>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: c.dot, width: `${Math.min(100, (count / seats) * 100)}%` }} />
    </View>
  )
}

export function Header({ title, subtitle, online, onSettings }) {
  const t = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
      <View>
        <Text style={{ color: t.ink, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 }}>{title}</Text>
        <Text style={{ color: t.muted, marginTop: 2 }}>{subtitle}</Text>
      </View>
      {/* tapping the pill opens the server settings (when the screen supports it) */}
      <Pressable onPress={onSettings} disabled={!onSettings} accessibilityLabel="Server settings"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.surface, borderRadius: 999,
          paddingVertical: 9, paddingHorizontal: 14, borderWidth: 1, borderColor: t.line }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: online ? t.green : t.red }} />
        <Text style={{ color: t.ink, fontWeight: '600' }}>{online ? 'Online' : 'Offline'}</Text>
      </Pressable>
    </View>
  )
}

export function Field({ label, value, onChangeText, secure, keyboardType, autoCapitalize = 'none', onSubmit }) {
  const t = useTheme()
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: t.muted, fontWeight: '600', marginBottom: 6 }}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} secureTextEntry={secure} keyboardType={keyboardType}
        autoCapitalize={autoCapitalize} autoCorrect={false} onSubmitEditing={onSubmit}
        placeholderTextColor={t.muted}
        style={{ borderWidth: 1, borderColor: t.line, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 14,
          color: t.ink, backgroundColor: t.surface, fontSize: 18 }} />
    </View>
  )
}

/** "Signed in as ..." with the ways to switch role or sign out. */
export function SessionBar({ session, role, onSwitchRole, onSignOut }) {
  const t = useTheme()
  const link = { color: t.accent, fontWeight: '700' }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
      <Text style={{ color: t.muted }}>
        <Text style={{ color: t.ink, fontWeight: '700' }}>{session.name}</Text> &middot; {role}
      </Text>
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <Pressable onPress={onSwitchRole} accessibilityRole="button"><Text style={link}>Switch role</Text></Pressable>
        <Pressable onPress={onSignOut} accessibilityRole="button"><Text style={link}>Sign out</Text></Pressable>
      </View>
    </View>
  )
}

/** Lets the user check or change the laptop address (usually found automatically). */
export function ServerPanel({ url, custom, setCustom, online, onClose }) {
  const t = useTheme()
  const [text, setText] = useState(url || '')
  const [result, setResult] = useState('')
  useEffect(() => { setText(url || '') }, [url])
  const test = async () => {
    setResult('Testing...')
    try {
      await get(text.trim().replace(/\/$/, ''), '/api/state')
      setResult('Connected.')
    } catch (e) {
      setResult('Cannot reach the server. Is the laptop on the same Wi-Fi and run.py running?')
    }
  }
  return (
    <Card>
      <Title>Server address</Title>
      <Muted style={{ marginBottom: 8 }}>
        {custom ? 'You set this address yourself.' : 'Found automatically from the laptop that is running Expo.'}
      </Muted>
      <TextInput value={text} onChangeText={setText} autoCapitalize="none" autoCorrect={false} keyboardType="url"
        style={{ borderWidth: 1, borderColor: t.line, borderRadius: 12, padding: 12, color: t.ink, backgroundColor: t.surface, fontSize: 16 }} />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <Button title="Test" kind="ghost" onPress={test} style={{ flex: 1, paddingVertical: 12 }} />
        <Button title="Save" onPress={() => { setCustom(text); setResult('Saved.') }} style={{ flex: 1, paddingVertical: 12 }} />
      </View>
      {custom ? <Button title="Use automatic address" kind="ghost" onPress={() => setCustom(null)} style={{ marginTop: 8, paddingVertical: 12 }} /> : null}
      <Muted style={{ marginTop: 8 }}>{result || (online ? 'Connected.' : 'Not connected.')}</Muted>
      <Button title="Close" kind="ghost" onPress={onClose} style={{ marginTop: 8, paddingVertical: 12 }} />
    </Card>
  )
}
