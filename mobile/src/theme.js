import { useColorScheme } from 'react-native'

const light = {
  bg: '#f6f7f9', surface: '#ffffff', surface2: '#f1f3f5', ink: '#111418', muted: '#6b7380', line: '#e6e9ed',
  brand: '#111418', brandInk: '#ffffff', accent: '#2563eb',
  green: '#16a34a', greenBg: '#dcfce7', greenInk: '#14532d',
  orange: '#eab308', orangeBg: '#fef9c3', orangeInk: '#713f12',   // 'orange' is the yellow level
  red: '#dc2626', redBg: '#fee2e2', redInk: '#7f1d1d',
}
const dark = {
  bg: '#0b0e12', surface: '#161b22', surface2: '#1f262f', ink: '#eef1f5', muted: '#97a2b0', line: '#2a323c',
  brand: '#eef1f5', brandInk: '#0b0e12', accent: '#6ea0ff',
  green: '#4ade80', greenBg: '#12331f', greenInk: '#bbf7d0',
  orange: '#facc15', orangeBg: '#3a3208', orangeInk: '#fef08a',
  red: '#f87171', redBg: '#3b1515', redInk: '#fecaca',
}

export const useTheme = () => (useColorScheme() === 'dark' ? dark : light)

// colours for a crowd level: green | orange | red
export const levelColors = (t, level) => ({
  green: { dot: t.green, bg: t.greenBg, ink: t.greenInk },
  orange: { dot: t.orange, bg: t.orangeBg, ink: t.orangeInk },
  red: { dot: t.red, bg: t.redBg, ink: t.redInk },
}[level] || { dot: t.muted, bg: t.surface2, ink: t.ink })

// green = seats available, yellow (key 'orange') = no seats but you can stand, red = full
export const LEVEL_TEXT = {
  green: 'Seats available',
  orange: 'Standing room',
  red: 'Full',
}
