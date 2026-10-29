"use client"

import { useId, useState } from "react"
import { Send } from "lucide-react"
import { cn } from "@/lib/utils"

interface DemoLinesPanelProps {
  lines: string[]
  disabled: boolean
  onSend: (text: string) => void
  className?: string
}

// Matches the backend's per-message cap.
const MAX_LINE_LENGTH = 5000

export function DemoLinesPanel({ lines, disabled, onSend, className }: DemoLinesPanelProps) {
  const inputId = useId()
  const [draft, setDraft] = useState("")

  const submitDraft = (e: React.FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text || disabled) return
    onSend(text)
    setDraft("")
  }

  return (
    <section
      aria-label="Demo lines"
      className={cn(
        "rounded-3xl bg-card/70 backdrop-blur-md border border-white/60 px-4 py-4 sm:px-5 space-y-3",
        className,
      )}
    >
      <p className="text-[12px] uppercase tracking-[0.16em] text-muted-foreground">Demo lines</p>

      {lines.length > 0 && (
        <ul className="flex flex-col gap-2">
          {lines.map((line) => (
            <li key={line}>
              <button
                type="button"
                onClick={() => onSend(line)}
                disabled={disabled}
                title={line}
                className="w-full text-left rounded-2xl bg-card/80 border border-white/60 px-4 py-2.5 text-[14px] leading-snug text-foreground/85 hover:bg-card transition line-clamp-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {line}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submitDraft} className="flex items-center gap-2">
        <label htmlFor={inputId} className="sr-only">
          Type a line to send
        </label>
        <input
          id={inputId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MAX_LINE_LENGTH}
          placeholder="Type a line…"
          autoComplete="off"
          className="flex-1 min-w-0 h-11 rounded-full bg-card/80 border border-white/60 px-4 text-[14px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-foreground/15"
        />
        <button
          type="submit"
          disabled={disabled || !draft.trim()}
          className="inline-flex items-center gap-1.5 h-11 px-4 rounded-full bg-foreground text-background text-[14px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send className="size-4" aria-hidden />
          Send
        </button>
      </form>
    </section>
  )
}
