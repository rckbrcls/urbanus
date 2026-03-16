import { useEffect, useState } from "react"

/**
 * Hook para verificar se o componente foi montado no cliente.
 * Útil para evitar problemas de hidratação no Next.js, especialmente
 * ao usar hooks que dependem de APIs do browser ou valores que podem
 * diferir entre servidor e cliente (ex: useTheme do next-themes).
 *
 * @returns {boolean} true se o componente foi montado, false caso contrário
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const mounted = useMounted()
 *   const { theme } = useTheme()
 *
 *   if (!mounted) return null
 *
 *   return <div>Theme: {theme}</div>
 * }
 * ```
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return mounted
}
