// One codebase, two apps. The app is chosen when Metro starts:
//   npm run drivers      -> "YanaBus - Drivers"  (drivers and conductors, port 8081)
//   npm run passenger    -> "YanaBus"            (passengers, port 8082)
const variant = process.env.EXPO_PUBLIC_APP === 'passenger' ? 'passenger' : 'drivers'
const names = { passenger: 'YanaBus', drivers: 'YanaBus - Drivers' }
const reason = {
  passenger: 'YanaBus uses your location to show the bus routes and stops near you.',
  drivers: 'YanaBus - Drivers uses your location to find your bus and share it with waiting passengers.',
}

module.exports = {
  expo: {
    name: names[variant],
    slug: variant === 'passenger' ? 'yanabus' : 'yanabus-drivers',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    android: {
      package: `lk.yanabus.${variant}`,
      permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'],
      adaptiveIcon: {
        backgroundColor: '#111418',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
    },
    ios: {
      bundleIdentifier: `lk.yanabus.${variant}`,
      infoPlist: { NSLocationWhenInUseUsageDescription: reason[variant] },
    },
    web: { favicon: './assets/favicon.png' },
    plugins: [['expo-location', { locationWhenInUsePermission: reason[variant] }]],
  },
}
