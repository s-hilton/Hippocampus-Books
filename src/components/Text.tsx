// Drop-in for React Native's Text that applies the brand font. Screens import Text from here.
import { Text as RNText, type TextProps } from 'react-native'
import { fontFamily } from '../lib/theme'

export function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[{ fontFamily }, style]} />
}
