'use client'

import { Check, Folder, Languages, Map, Moon, Sun } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { useEffect } from "react"
import { useMounted } from "@/hooks/use-mounted"
import { useTranslation } from "@/i18n"
import { useLocaleStore } from "@/stores/localeStore"
import type { Locale } from "@/i18n"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const LOCALE_OPTIONS: { value: Locale; label: string; short: string }[] = [
  { value: 'pt-BR', label: 'Português (BR)', short: 'PT' },
  { value: 'en', label: 'English', short: 'EN' },
]

export function AppHeader() {
  const { setTheme, theme } = useTheme()
  const mounted = useMounted()
  const pathname = usePathname()
  const t = useTranslation('common')
  const locale = useLocaleStore((s) => s.locale)
  const setLocale = useLocaleStore((s) => s.setLocale)

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark")
  }

  // Sync document lang attribute with locale
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  // Hide header on project editor — it has its own navigation
  const isProjectEditor = /^\/projects\/[^/]+$/.test(pathname)
  if (isProjectEditor) return null

  const navItems = [
    { href: "/map", label: t.map, icon: Map },
    { href: "/projects", label: t.projects, icon: Folder },
  ]

  const currentShort = LOCALE_OPTIONS.find((o) => o.value === locale)?.short ?? 'PT'

  return (
    <>
      {/* Logo — top left */}
      <div className="fixed top-0 left-0 z-20 m-4 flex h-10 items-center rounded-2xl border border-border bg-background px-4">
        <Link href="/" className="flex items-center">
          <span className="text-sm font-normal uppercase tracking-[0.18em]">Urbanus</span>
        </Link>
      </div>

      {/* Nav + lang + theme — top right */}
      <div className="fixed top-0 right-0 z-20 m-4 flex h-10 items-center gap-1 rounded-2xl border border-border bg-background px-2">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname.startsWith(href)

          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm transition-colors ${
                isActive
                  ? "text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          )
        })}
        <div className="mx-1 h-4 w-px bg-border" />

        {/* Language switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              aria-label={t.language}
            >
              <Languages className="size-4" />
              {mounted && currentShort}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[140px]">
            {LOCALE_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => setLocale(option.value)}
                className="flex items-center justify-between"
              >
                {option.label}
                {locale === option.value && <Check className="size-3.5" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          onClick={toggleTheme}
          className="flex size-8 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:text-foreground"
          aria-label={t.toggleTheme}
        >
          {mounted && (theme === "dark" ? <Moon size={18} /> : <Sun size={18} />)}
        </button>
      </div>
    </>
  )
}
