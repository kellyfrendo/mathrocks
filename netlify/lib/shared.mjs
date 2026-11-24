import { connectLambda, getStore } from '@netlify/blobs'

export const MAX_NAME = 16
export const MAX_SCORE = 99999
export const MAX_GEAR = 5
export const MIN_LEVEL = 1
export const MAX_LEVEL = 4
export const MAX_QUESTION = 32
export const MAX_BOARD = 200
export const RATE_WINDOW_MS = 60_000
export const RATE_MAX = 40

/** @type {Map<string, number[]>} */
const hits = new Map()

export function clientIp(event) {
  const xf = event.headers?.['x-forwarded-for'] || event.headers?.['X-Forwarded-For'] || ''
  const first = String(xf).split(',')[0].trim()
  return first || event.headers?.['client-ip'] || event.headers?.['x-nf-client-connection-ip'] || 'unknown'
}

export function rateLimit(ip) {
  const now = Date.now()
  const key = String(ip || 'unknown')
  const prev = (hits.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS)
  if (prev.length >= RATE_MAX) {
    hits.set(key, prev)
    return false
  }
  prev.push(now)
  hits.set(key, prev)
  return true
}

export function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
    ...extra,
  }
}

export function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: corsHeaders(extraHeaders),
    body: JSON.stringify(body),
  }
}

/** Bind Blobs to this Lambda invocation, then open the shared store. */
export function store(event) {
  if (event) connectLambda(event)
  // Default eventual consistency — strong mode needs uncachedEdgeURL not
  // always present on classic Lambda handlers.
  return getStore('math-rocks')
}

export function cleanName(raw) {
  const name = String(raw ?? '')
    .replace(/[^\w\s'\-.]/g, '')
    .trim()
    .slice(0, MAX_NAME)
  return name || 'Player'
}

export function cleanLevel(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  const level = Math.round(n)
  if (level < MIN_LEVEL || level > MAX_LEVEL) return null
  return level
}

export function cleanScore(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  const score = Math.floor(n)
  if (score < 0 || score > MAX_SCORE) return null
  return score
}

export function cleanGear(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  const gear = Math.round(n)
  if (gear < 1 || gear > MAX_GEAR) return null
  return gear
}

/** Canonical question key like "7 + 8" or "9 − 3". */
export function cleanQuestion(raw) {
  const text = String(raw ?? '').trim().slice(0, MAX_QUESTION)
  const m = text.match(/^(\d{1,3})\s*([+\-−–—])\s*(\d{1,3})$/)
  if (!m) return null
  const a = Number(m[1])
  const b = Number(m[3])
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  const op = m[2] === '+' ? '+' : '−'
  if (op === '−' && b > a) return null
  return `${a} ${op === '+' ? '+' : '−'} ${b}`
}

export function normalizeScoreEntry(raw) {
  const name = cleanName(raw?.name)
  const level = cleanLevel(raw?.level) ?? 1
  const score = cleanScore(raw?.score) ?? 0
  const gear = cleanGear(raw?.gear) ?? 1
  const at = Number(raw?.at)
  return {
    name,
    level,
    score,
    gear,
    at: Number.isFinite(at) && at > 0 ? at : Date.now(),
  }
}
