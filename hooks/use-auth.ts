"use client"

import { useEffect, useState } from "react"
import { getCurrentUser, refreshSession, type AuthUser } from "@/lib/auth"

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    const loadUser = async () => {
      const u = await getCurrentUser()
      if (active) {
        setUser(u)
        setLoading(false)
      }
    }

    loadUser()

    const handleAuthChange = () => {
      loadUser()
    }

    window.addEventListener("auth-change", handleAuthChange)

    return () => {
      active = false
      window.removeEventListener("auth-change", handleAuthChange)
    }
  }, [])

  // Sliding session: renew the access token while the user is signed in, so a
  // long practice session never dies mid-conversation on token expiry. Runs
  // immediately when a user appears and every 5 minutes after (tokens live 15
  // minutes, so one missed beat is tolerable).
  useEffect(() => {
    if (!user) return
    void refreshSession()
    const id = window.setInterval(() => {
      void refreshSession()
    }, 5 * 60 * 1000)
    return () => window.clearInterval(id)
  }, [user])

  return { user, loading }
}
