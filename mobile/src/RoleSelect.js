import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useTheme } from './theme'
import { Header, Muted, Screen } from './ui'

const ROLES = [
  ['driver', 'Driver', 'Share the bus location and speed so passengers see where the bus is.'],
  ['conductor', 'Conductor', 'Tell passengers how full the bus is and issue tickets.'],
]

/** After sign in: choose how you are working today. The app then finds your location. */
export default function RoleSelect({ ctx, session, finding, onChoose, onSignOut }) {
  const t = useTheme()
  return (
    <Screen>
      <Header title={`Hi, ${session.name.split(' ')[0]}`} subtitle="How are you working today?" online={ctx.online} />

      {ROLES.filter(([id]) => session.roles.includes(id)).map(([id, title, text]) => (
        <Pressable key={id} onPress={() => onChoose(id)} disabled={!!finding} accessibilityRole="button"
          style={({ pressed }) => ({ padding: 20, borderRadius: 20, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line,
            opacity: finding && finding !== id ? 0.4 : pressed ? 0.85 : 1 })}>
          <Text style={{ color: t.ink, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 }}>{title}</Text>
          <Muted style={{ marginTop: 6, fontSize: 16 }}>{text}</Muted>
          {finding === id ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 }}>
              <ActivityIndicator color={t.ink} />
              <Text style={{ color: t.ink, fontWeight: '600' }}>Finding your location...</Text>
            </View>
          ) : null}
        </Pressable>
      ))}

      <Muted>The app uses your phone location to find your bus and to choose the right GPS mode.</Muted>
      <Pressable onPress={onSignOut} disabled={!!finding} accessibilityRole="button" style={{ paddingVertical: 8 }}>
        <Text style={{ color: t.accent, fontWeight: '700' }}>Sign out</Text>
      </Pressable>
    </Screen>
  )
}
