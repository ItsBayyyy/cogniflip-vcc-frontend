/**
 * Stage-demo mode: shows a panel on the session page that sends prepared or
 * typed lines without the microphone, so a noisy room can't garble the demo.
 * Replies still stream and play through TTS like a spoken turn.
 *
 * NEXT_PUBLIC_* values are inlined at build time, so toggling them requires a
 * rebuild (a redeploy on Vercel).
 */
export const DEMO_MODE_ENABLED = process.env.NEXT_PUBLIC_DEMO_MODE === "true"

/** Prepared lines, separated by "|" in NEXT_PUBLIC_DEMO_LINES. */
export const DEMO_LINES = (process.env.NEXT_PUBLIC_DEMO_LINES || "")
  .split("|")
  .map((line) => line.trim())
  .filter(Boolean)
