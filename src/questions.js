/**
 * Starting questions for each level.
 *
 * HOW TO ADD QUESTIONS
 * --------------------
 * Just append another string to the level’s array below.
 * Formats accepted (spaces optional):
 *   "7 + 8"
 *   "9 - 3"
 *   "12+15"
 *
 * Order is shuffled when a level starts.
 * Missed questions are mixed back into the remaining list until answered correctly.
 */

export const STARTING_QUESTIONS = {
  // Level 1 — one-digit addition
  1: [
    '7 + 8',
    '6 + 4',
    '5 + 8',
    '6 + 6',
    '8 + 4',
    '9 + 9',
    '7 + 7',
  ],

  // Level 2 — one-digit addition and subtraction
  // (edit / extend freely)
  2: [
    '9 - 4',
    '8 + 5',
    '7 - 3',
    '6 + 7',
    '9 - 6',
    '5 + 9',
    '8 - 5',
  ],

  // Level 3 — two-digit addition
  3: [
    '12 + 15',
    '23 + 14',
    '31 + 28',
    '16 + 19',
    '40 + 25',
    '18 + 18',
    '27 + 13',
  ],

  // Level 4 — two-digit addition and subtraction
  4: [
    '25 + 17',
    '40 - 16',
    '33 + 29',
    '52 - 18',
    '19 + 27',
    '60 - 24',
    '36 + 28',
  ],
}

/** Parse "7 + 8" / "9-3" into a problem object. */
export function parseQuestion(raw) {
  const text = String(raw).trim()
  const m = text.match(/^(\d+)\s*([+\-−–—])\s*(\d+)$/)
  if (!m) {
    console.warn(`[questions] Skipping invalid entry: ${raw}`)
    return null
  }
  const a = Number(m[1])
  const b = Number(m[3])
  const op = m[2] === '+' ? '+' : '-'
  if (op === '-' && b > a) {
    console.warn(`[questions] Skipping negative result: ${raw}`)
    return null
  }
  const answer = op === '+' ? a + b : a - b
  const symbol = op === '-' ? '−' : '+'
  return {
    a,
    b,
    op,
    symbol,
    answer,
    text: `${a}${symbol}${b}`,
    fromStarter: true,
    source: text,
  }
}

export function loadStarterProblems(levelId) {
  const list = STARTING_QUESTIONS[levelId] || []
  return list.map(parseQuestion).filter(Boolean)
}
