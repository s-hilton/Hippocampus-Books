import { useColorScheme } from 'react-native'

const light = {
  bg: '#faf8f5',
  card: '#ffffff',
  text: '#1f1d1a',
  muted: '#6b665e',
  border: '#e3ded6',
  accent: '#5b3fd9',
  accentText: '#ffffff',
  star: '#f5a623',
  danger: '#c0392b',
}

const dark: typeof light = {
  bg: '#17161a',
  card: '#201f24',
  text: '#ece9e4',
  muted: '#9a958d',
  border: '#34323a',
  accent: '#9b85ff',
  accentText: '#111111',
  star: '#f5a623',
  danger: '#e57368',
}

export type Theme = typeof light

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light
}
