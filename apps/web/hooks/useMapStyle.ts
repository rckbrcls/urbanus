import { useTheme } from 'next-themes'
import { useMounted } from '@/hooks/use-mounted'
import { MAP_STYLES } from '@/lib/map/styles'

/**
 * Returns the appropriate map style URL based on the current theme.
 *
 * @param variant - 'labels' for label-heavy maps (liberty), 'minimal' for creation previews, editor, and thumbnails (positron)
 * @returns OpenFreeMap style URL matching the active theme
 */
export function useMapStyle(variant: 'labels' | 'minimal' = 'labels') {
  const { resolvedTheme } = useTheme()
  const mounted = useMounted()

  if (!mounted) {
    return variant === 'labels' ? MAP_STYLES.voyager : MAP_STYLES.voyagerNoLabels
  }

  if (resolvedTheme === 'dark') {
    return MAP_STYLES.darkMatter
  }

  return variant === 'labels' ? MAP_STYLES.voyager : MAP_STYLES.voyagerNoLabels
}
