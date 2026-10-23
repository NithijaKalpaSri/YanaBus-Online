import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import Root from './src/Root'
import PassengerApp from './src/passenger/PassengerApp'

// Metro inlines EXPO_PUBLIC_APP when it bundles, so each app only contains its own screens
const passenger = process.env.EXPO_PUBLIC_APP === 'passenger'

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      {passenger ? <PassengerApp /> : <Root />}
    </SafeAreaProvider>
  )
}
