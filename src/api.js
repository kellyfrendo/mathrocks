/**
 * Shared store client: Netlify Functions + Blobs on production,
 * localStorage fallback when the API is unreachable (local Vite / offline).
 */

const SCORES_KEY = 'math-rocks-scores-v2'
const SCORES_LEGACY = 'math-rocks-scores-v1'
const MISSES_KEY = 'math-rocks-misses-v1'
const MAX_BOARD = 200
const MAX_NAME = 16

function apiBase() {
  // Same-origin functions on Netlify; Vite redirects don't apply locally.
  if (typeof window === 'undefined') return '/.netlify/functions'
  const host = window.location.hostname
  if (host === 'localhost' || host === '127.0.0.1') {
    // Prefer Netlify Dev proxy if present; otherwise callers fall back to localStorage.
    return '/.netlify/functions'
  }
  return '/.netlify/functions'
}

function normalizeScoreEntry(raw) {
  return {
    name: String(raw?.name || 'Player').slice(0, MAX_NAME),
    level: Number(raw?.level) || 1,
    score: Number(raw?.score) || 0,
    gear: Math.max(1, Number(raw?.gear) || 1),
    at: Number(raw?.at) || Date.now(),
  }
}

function readLocalScores() {
  try {
    let raw = localStorage.getItem(SCORES_KEY)
    if (!raw) {
      const legacy = localStorage.getItem(SCORES_LEGACY)
      if (legacy) {
        const parsed = JSON.parse(legacy)
        const migrated = (Array.isArray(parsed) ? parsed : []).map(normalizeScoreEntry)
        localStorage.setItem(SCORES_KEY, JSON.stringify(migrated))
        return migrated
      }
    }
    const parsed = raw ? JSON.parse(raw) : []
    return (Array.isArray(parsed) ? parsed : []).map(normalizeScoreEntry)
  } catch {
    return []
  }
}

function writeLocalScores(scores) {
  try {
    localStorage.setItem(SCORES_KEY, JSON.stringify(scores.slice(0, MAX_BOARD)))
  } catch {
    /* ignore */
  }
}

function upsertLocalScore(name, score, levelId, gearReached = 1) {
  const clean = String(name || 'Player').trim().slice(0, MAX_NAME) || 'Player'
  const level = Number(levelId) || 1
  const gear = Math.max(1, Number(gearReached) || 1)
  const scores = readLocalScores()
  const existing = scores.find(
    (s) => s.name.toLowerCase() === clean.toLowerCase() && s.level === level,
  )
  if (existing) {
    if (score > existing.score) {
      existing.score = score
      existing.at = Date.now()
    }
    if (gear > existing.gear) existing.gear = gear
  } else {
    scores.push({ name: clean, level, score, gear, at: Date.now() })
  }
  scores.sort(
    (a, b) => b.score - a.score || b.gear - a.gear || a.name.localeCompare(b.name),
  )
  writeLocalScores(scores)
  return scores.filter((s) => s.level === level)
}

function readLocalMisses() {
  try {
    const raw = localStorage.getItem(MISSES_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeLocalMisses(all) {
  try {
    localStorage.setItem(MISSES_KEY, JSON.stringify(all))
  } catch {
    /* ignore */
  }
}

function canonicalQuestion(raw) {
  const text = String(raw ?? '').trim()
  const m = text.match(/^(\d{1,3})\s*([+\-−–—])\s*(\d{1,3})$/)
  if (!m) return null
  const a = Number(m[1])
  const b = Number(m[3])
  const op = m[2] === '+' ? '+' : '−'
  if (op === '−' && b > a) return null
  return `${a} ${op === '+' ? '+' : '−'} ${b}`
}

function topMisses(bucket, limit = 12) {
  return Object.entries(bucket || {})
    .map(([question, raw]) => {
      const misses = Math.max(0, Number(raw?.misses) || 0)
      const attempts = Math.max(misses, Number(raw?.attempts) || 0)
      const missRate = attempts > 0 ? misses / attempts : 0
      return { question, misses, attempts, missRate }
    })
    .filter((row) => row.misses > 0)
    .sort((a, b) => b.misses - a.misses || b.missRate - a.missRate || a.question.localeCompare(b.question))
    .slice(0, limit)
}

async function fetchJson(url, options) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 6000)
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

/** @returns {Promise<{scores: object[], source: 'remote'|'local'}>} */
export async function fetchScores(levelId) {
  const level = Number(levelId) || 0
  try {
    const q = level ? `?level=${level}` : ''
    const data = await fetchJson(`${apiBase()}/scores${q}`)
    const scores = (Array.isArray(data?.scores) ? data.scores : []).map(normalizeScoreEntry)
    // Mirror remote into local cache for offline viewing
    if (scores.length) {
      const others = readLocalScores().filter((s) => (level ? s.level !== level : false))
      writeLocalScores(level ? [...others, ...scores] : scores)
    }
    return { scores, source: 'remote' }
  } catch {
    const local = readLocalScores()
    return {
      scores: level ? local.filter((s) => s.level === level) : local,
      source: 'local',
    }
  }
}

/** Save best score; always writes local, then tries remote. */
export async function submitScore(name, score, levelId, gearReached = 1) {
  const localLevel = upsertLocalScore(name, score, levelId, gearReached)
  try {
    const data = await fetchJson(`${apiBase()}/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        score,
        level: Number(levelId) || 1,
        gear: gearReached,
      }),
    })
    const scores = (Array.isArray(data?.scores) ? data.scores : localLevel).map(normalizeScoreEntry)
    return { scores, source: 'remote' }
  } catch {
    return { scores: localLevel, source: 'local' }
  }
}

export async function fetchMisses(levelId) {
  const level = Number(levelId) || 1
  try {
    const data = await fetchJson(`${apiBase()}/misses?level=${level}`)
    const questions = Array.isArray(data?.questions) ? data.questions : []
    return { questions, source: 'remote' }
  } catch {
    const all = readLocalMisses()
    return { questions: topMisses(all[String(level)]), source: 'local' }
  }
}

/** Record a hit or miss for weighting + Tricky questions. */
export async function recordOutcome(levelId, questionRaw, outcome) {
  const level = Number(levelId) || 1
  const question = canonicalQuestion(questionRaw)
  if (!question || (outcome !== 'miss' && outcome !== 'hit')) return null

  const all = readLocalMisses()
  const key = String(level)
  const bucket = { ...(all[key] || {}) }
  const prev = bucket[question] || { misses: 0, attempts: 0 }
  bucket[question] = {
    misses: Math.max(0, Number(prev.misses) || 0) + (outcome === 'miss' ? 1 : 0),
    attempts: Math.max(0, Number(prev.attempts) || 0) + 1,
  }
  all[key] = bucket
  writeLocalMisses(all)

  try {
    await fetchJson(`${apiBase()}/misses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, question, outcome }),
    })
    return { source: 'remote' }
  } catch {
    return { source: 'local' }
  }
}

/** Miss map for weighting: question → {misses, attempts, missRate} */
export async function missWeightMap(levelId) {
  const { questions } = await fetchMisses(levelId)
  const map = new Map()
  for (const row of questions) {
    map.set(row.question, row)
  }
  return map
}

export { canonicalQuestion, topMisses }
