"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { useAuth } from "@/hooks/use-auth"
import { OnboardingOverlay } from "./onboarding-overlay"

const STORAGE_PREFIX = "cogniflip_onboarding_v1"

/** Event name consumers can dispatch to force-open the tour at any time. */
export const ONBOARDING_OPEN_EVENT = "cogniflip:onboarding:open"

/**
 * Detects the first time a signed-in user lands on the app and pops the
 * onboarding overlay exactly once per user. Persistence is per-user so two
 * accounts on the same browser get their own first-run experience.
 *
 * Mounted globally in the root layout — the overlay never shows on auth
 * pages (where the post-login redirect would otherwise cause a brief flash).
 */
export function OnboardingProvider() {
  const { user, loading } = useAuth()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  // Which user we've already decided for. A ref, not state: updating it must
  // not re-run the effect, whose cleanup would cancel the pending open timer.
  const decidedForRef = useRef<string | null>(null)
  // Track whether the user explicitly forced the tour open (via event or
  // ?onboarding=1) so we can show it even without an authenticated session.
  const [forced, setForced] = useState(false)

  // Allow programmatic + URL-based opening for testing and "Show tour" buttons.
  useEffect(() => {
    if (searchParams?.get("onboarding") === "1") {
      setForced(true)
      setOpen(true)
    }

    const handler = () => {
      setForced(true)
      setOpen(true)
    }
    window.addEventListener(ONBOARDING_OPEN_EVENT, handler)
    return () => window.removeEventListener(ONBOARDING_OPEN_EVENT, handler)
  }, [searchParams])

  useEffect(() => {
    if (loading) return
    if (!user) {
      // User signed out — reset so the overlay can fire again on next sign-in
      // (still gated by the per-user localStorage flag).
      decidedForRef.current = null
      setOpen(false)
      return
    }
    if (decidedForRef.current === user.id) return
    if (typeof window === "undefined") return

    // Don't flash on auth pages — the login screen redirects right after
    // the session resolves, so showing here would be visible for ~100ms.
    // Checked before deciding, so the destination page still gets the tour.
    if (pathname?.startsWith("/login")) return

    // Already seen — never show again for this user on this device.
    try {
      const seen = window.localStorage.getItem(`${STORAGE_PREFIX}_${user.id}`)
      if (seen) {
        decidedForRef.current = user.id
        return
      }
    } catch {
      // localStorage blocked (private mode, quota) — treat as "skip" and
      // don't pester the user; better than a broken loop.
      decidedForRef.current = user.id
      return
    }

    // Tiny delay so the destination page paints first; the overlay then
    // floats up over a settled UI rather than racing the route transition.
    // Only mark the user decided once it fires: a navigation inside the
    // delay re-runs this effect and reschedules instead of losing the tour.
    const t = setTimeout(() => {
      decidedForRef.current = user.id
      setOpen(true)
    }, 400)
    return () => clearTimeout(t)
  }, [user, loading, pathname])

  const handleClose = () => {
    setOpen(false)
    setForced(false)
    if (user) {
      try {
        window.localStorage.setItem(
          `${STORAGE_PREFIX}_${user.id}`,
          new Date().toISOString(),
        )
      } catch {
        // Ignore — worst case the user sees the tour again on next visit.
      }
    }
  }

  // Show when the auto-trigger fired (authenticated first-run) OR when
  // someone explicitly forced it open. Forced mode works without a user
  // so it's safe to use on the landing page or in dev.
  if (!open) return null
  if (!user && !forced) return null
  return <OnboardingOverlay userName={user?.name ?? "there"} onClose={handleClose} />
}
