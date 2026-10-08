import { Platform, useColorScheme } from 'react-native'

// Brand: "Stars and Fire" style guide — Paradise teal + Ancient Copper, set in Palatino.
const light = {
  bg: '#faf8f5',
  card: '#ffffff',
  text: '#1f1d1a',
  muted: '#6b665e',
  border: '#e3ded6',
  accent: '#03736f', // Paradise
  accentText: '#ffffff',
  copper: '#9f543e', // Ancient Copper
  star: '#9f543e',
  danger: '#b3261e',
}

const dark: typeof light = {
  bg: '#141716',
  card: '#1d2120',
  text: '#ece9e4',
  muted: '#9a958d',
  border: '#313735',
  accent: '#3fb2aa',
  accentText: '#0b1312',
  copper: '#d38a71',
  star: '#d38a71',
  danger: '#e57368',
}

export type Theme = typeof light

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light
}

// Palatino where the system has it (iOS, macOS, Windows); a close serif elsewhere.
// Headings use the same family at bold weight ("Palatino Bold").
export const fontFamily = Platform.select({
  ios: 'Palatino',
  android: 'serif',
  default: '"Palatino Linotype", Palatino, "Book Antiqua", "URW Palladio L", P052, Georgia, serif',
})
