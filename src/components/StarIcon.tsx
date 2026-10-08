import Svg, { Path } from 'react-native-svg'

// A five-pointed star in a 24×24 box. Drawn as a shape (not the ★ character) so its size
// and position are identical on every device and font, which keeps text beside it aligned.
const STAR = 'M12 1.6l3.09 6.26 6.91 1-5 4.87 1.18 6.88L12 17.36l-6.18 3.25L7 13.73 2 8.86l6.91-1z'

export default function StarIcon({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <Path d={STAR} fill={color} />
    </Svg>
  )
}
