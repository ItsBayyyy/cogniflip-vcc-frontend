"use client"

const API_URL = "/api/backend/auth"

export interface AuthUser {
  id: string
  email: string
  name: string
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function isBcryptCompatible(password: string): boolean {
  return new TextEncoder().encode(password).length <= 72
}

function notifyAuthChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("auth-change"))
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (typeof window === "undefined") return null
  try {
    const res = await fetch(`${API_URL}/me`, {
      credentials: "same-origin",
      cache: "no-store",
    })
    if (!res.ok) return null
    return (await res.json()) as AuthUser
  } catch {
    return null
  }
}

/**
 * Sliding-session renewal: asks the backend to mint a fresh access token; the
 * BFF rotates the HttpOnly session cookie on success. Long voice sessions
 * call this on a heartbeat so an active session never expires
 * mid-conversation. Silent on failure — the next real API call surfaces the
 * 401 through its normal error path.
 *
 * Several components mount useAuth on the same page (guard + header chip),
 * each running its own heartbeat; the cooldown collapses those into a single
 * real renewal per window instead of one request per consumer.
 */
let lastRefreshAt = 0
const REFRESH_COOLDOWN_MS = 4 * 60 * 1000

export async function refreshSession(): Promise<boolean> {
  if (typeof window === "undefined") return false
  const now = Date.now()
  if (now - lastRefreshAt < REFRESH_COOLDOWN_MS) return true
  // Reserve the slot BEFORE the fetch: instances mounted together call this in
  // the same tick, so a check-after-fetch cooldown would let all of them race
  // through. The slot is not released on failure — the next heartbeat beat
  // (5 min > cooldown) retries, which keeps a failing backend from turning
  // every mount burst into a request storm.
  lastRefreshAt = now
  try {
    const res = await fetch(`${API_URL}/refresh`, {
      method: "POST",
      credentials: "same-origin",
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Only same-origin paths may be used as a post-login destination; anything
 * else (absolute URLs, protocol-relative "//host") would be an open redirect.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/setup"
  }
  return next
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

function extractError(res: Response, data: Record<string, unknown>, fallback: string): string {
  if (res.status === 429) {
    // The reset cooldown explains itself ("Please wait 45 seconds…"); the
    // login page parses that text to sync its resend timer.
    if (typeof data.detail === "string" && /wait \d+ seconds/i.test(data.detail)) {
      return data.detail
    }
    const retryAfter = Number(res.headers.get("retry-after"))
    return retryAfter > 0
      ? `Too many attempts. Please wait ${retryAfter} seconds before trying again.`
      : "Too many attempts. Please wait before trying again."
  }
  if (res.status === 422) return "Please check the submitted fields."
  if (res.status >= 500) return "The service is temporarily unavailable. Please try again in a moment."
  return fallback
}

export async function signIn(
  email: string,
  password: string,
): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> {
  if (!isValidEmail(email)) return { ok: false, error: "Please enter a valid email." }
  if (password.length < 4) return { ok: false, error: "Password is too short." }
  if (!isBcryptCompatible(password)) return { ok: false, error: "Password is too long." }

  try {
    const res = await fetch(`${API_URL}/login`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    })
    const data = await readJson(res)
    if (!res.ok) {
        return { ok: false, error: extractError(res, data, "Invalid email or password.") }
    }

    notifyAuthChange()
    return { ok: true, user: data.user as AuthUser }
  } catch {
    return { ok: false, error: "Network error" }
  }
}

export async function signUp(
  name: string,
  email: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!name.trim()) return { ok: false, error: "Please enter your name." }
  if (name.trim().length > 100) return { ok: false, error: "Name must be at most 100 characters." }
  if (!isValidEmail(email)) return { ok: false, error: "Please enter a valid email." }
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." }
  if (!/[A-Z]/.test(password)) return { ok: false, error: "Password must contain at least one uppercase letter." }
  if (!/\d/.test(password)) return { ok: false, error: "Password must contain at least one digit." }
  if (!isBcryptCompatible(password)) return { ok: false, error: "Password is too long." }

  try {
    const res = await fetch(`${API_URL}/register`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password })
    })
    if (!res.ok) {
        return { ok: false, error: extractError(res, await readJson(res), "Could not create the account.") }
    }
    
    return { ok: true }
  } catch {
    return { ok: false, error: "Network error" }
  }
}

export async function verifyOtp(
  email: string,
  otpCode: string,
): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> {
  try {
    if (!/^\d{6}$/.test(otpCode)) {
      return { ok: false, error: "Enter the 6-digit verification code." }
    }
    const res = await fetch(`${API_URL}/verify-otp`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, otp_code: otpCode })
    })
    const data = await readJson(res)
    if (!res.ok) {
        return { ok: false, error: extractError(res, data, "Invalid or expired verification code.") }
    }

    notifyAuthChange()
    return { ok: true, user: data.user as AuthUser }
  } catch {
    return { ok: false, error: "Network error" }
  }
}

export async function resendOtp(
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_URL}/resend-otp`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    })
    if (!res.ok) {
        return { ok: false, error: extractError(res, await readJson(res), "Could not resend the verification code.") }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: "Network error" }
  }
}

export async function requestPasswordReset(
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isValidEmail(email)) return { ok: false, error: "Please enter a valid email." }
  try {
    const res = await fetch(`${API_URL}/forgot-password`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    })
    if (!res.ok) {
      return { ok: false, error: extractError(res, await readJson(res), "Could not start password recovery.") }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: "Network error" }
  }
}

export async function verifyResetPasswordCode(
  email: string,
  otpCode: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!/^\d{6}$/.test(otpCode)) {
    return { ok: false, error: "Enter the 6-digit reset code." }
  }
  try {
    const res = await fetch(`${API_URL}/verify-reset-otp`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, otp_code: otpCode })
    })
    if (!res.ok) {
      return { ok: false, error: extractError(res, await readJson(res), "Invalid or expired reset code.") }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: "Network error" }
  }
}

export async function confirmPasswordReset(
  email: string,
  otpCode: string,
  newPassword: string,
): Promise<{ ok: true; detail: string } | { ok: false; error: string }> {
  if (newPassword.length < 8) return { ok: false, error: "Password must be at least 8 characters." }
  if (!/[A-Z]/.test(newPassword)) return { ok: false, error: "Password must contain at least one uppercase letter." }
  if (!/\d/.test(newPassword)) return { ok: false, error: "Password must contain at least one digit." }
  if (!isBcryptCompatible(newPassword)) return { ok: false, error: "Password is too long." }
  if (!/^\d{6}$/.test(otpCode)) return { ok: false, error: "Enter the 6-digit reset code." }

  try {
    const res = await fetch(`${API_URL}/reset-password`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, otp_code: otpCode, new_password: newPassword })
    })
    const data = await readJson(res)
    if (!res.ok) {
      return { ok: false, error: extractError(res, data, "Could not reset the password.") }
    }
    return { ok: true, detail: typeof data.detail === "string" ? data.detail : "Password reset successfully." }
  } catch {
    return { ok: false, error: "Network error" }
  }
}

export async function signOut(): Promise<boolean> {
  if (typeof window === "undefined") return false

  try {
    const res = await fetch(`${API_URL}/logout`, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
    })
    if (!res.ok) return false
    notifyAuthChange()
    return true
  } catch {
    return false
  }
}

export async function signInDemo(): Promise<
  { ok: true; user: AuthUser } | { ok: false; error: string }
> {
  try {
    const res = await fetch(`${API_URL}/demo`, {
      method: "POST",
      credentials: "same-origin",
    })
    const data = await readJson(res)
    if (!res.ok) {
      return {
        ok: false,
        error: extractError(res, data, "Demo access is temporarily unavailable."),
      }
    }

    notifyAuthChange()
    return { ok: true, user: data.user as AuthUser }
  } catch {
    return { ok: false, error: "Network error" }
  }
}
