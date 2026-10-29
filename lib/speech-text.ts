const LAUGHTER_DIRECTION_PATTERNS = [
  /\*{1,2}\s*(?:laughs?|chuckles?|giggles?)\s*\*{1,2}/gi,
  /\[\s*(?:laughs?|chuckles?|giggles?)\s*\]/gi,
  /\(\s*(?:laughs?|chuckles?|giggles?)\s*\)/gi,
]

export function normalizeAssistantSpeech(text: string): string {
  let normalized = text
  for (const pattern of LAUGHTER_DIRECTION_PATTERNS) {
    normalized = normalized.replace(pattern, "Ha—")
  }
  return normalized
    .replace(/[ \t]+([,.!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

const IS_SENTENCE_TERMINATOR: Record<string, true> = {
  ".": true,
  "!": true,
  "?": true,
  "…": true,
}
const IS_CLOSER: Record<string, true> = {
  '"': true,
  "'": true,
  ")": true,
  "]": true,
  "”": true,
  "’": true,
  "»": true,
}

/**
 * Greedily pull complete sentences out of an accumulating stream buffer.
 * Splits after a sentence terminator ([.!?…]) — including terminators sitting
 * inside closing quotes/brackets — only when followed by whitespace, so
 * decimals ("3.5") never split, even across chunk boundaries. If no
 * boundary exists and the pending text exceeds `forceFlushChars`, flush
 * everything up to the last whitespace (keeping at least 60 chars) as one
 * chunk so long run-on text still starts speaking without waiting for a
 * period. Returns [complete sentences (trimmed, empties dropped), remainder].
 */
export function extractSentences(
  buffer: string,
  forceFlushChars = 180,
): [string[], string] {
  const sentences: string[] = []
  let start = 0

  while (start < buffer.length) {
    let end = -1 // index just past the sentence (terminator + closers)

    for (let i = start; i < buffer.length; i++) {
      if (!IS_SENTENCE_TERMINATOR[buffer[i]]) continue
      let j = i + 1
      while (j < buffer.length && IS_CLOSER[buffer[j]]) j++
      // A terminator at the very end of the buffer is ambiguous: "3." may be
      // followed by "5 million" in the next chunk. Wait for more text; the
      // caller's final flush speaks a genuinely last sentence.
      if (j >= buffer.length || !/\s/.test(buffer[j])) continue
      end = j
      break
    }

    if (end !== -1) {
      const sentence = buffer.slice(start, end).trim()
      if (sentence) sentences.push(sentence)
      start = end
      while (start < buffer.length && /\s/.test(buffer[start])) start++
      continue
    }

    if (buffer.length - start > forceFlushChars) {
      const slice = buffer.slice(start, start + forceFlushChars)
      const cut = slice.lastIndexOf(" ")
      const flushEnd = cut >= 60 ? start + cut : start + forceFlushChars
      const sentence = buffer.slice(start, flushEnd).trim()
      if (sentence) sentences.push(sentence)
      start = flushEnd
      while (start < buffer.length && /\s/.test(buffer[start])) start++
      continue
    }

    break // rest stays buffered until more chunks (or the final flush) arrive
  }

  return [sentences, buffer.slice(start)]
}
