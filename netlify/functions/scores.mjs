import {
  cleanGear,
  cleanLevel,
  cleanName,
  cleanScore,
  clientIp,
  json,
  normalizeScoreEntry,
  rateLimit,
  store,
  MAX_BOARD,
} from '../lib/shared.mjs'

const SCORES_KEY = 'scores-v1'

async function readScores(blobStore) {
  try {
    const data = await blobStore.get(SCORES_KEY, { type: 'json' })
    return Array.isArray(data) ? data.map(normalizeScoreEntry) : []
  } catch {
    return []
  }
}

function upsertLocal(scores, entry) {
  const next = [...scores]
  const existing = next.find(
    (s) => s.name.toLowerCase() === entry.name.toLowerCase() && s.level === entry.level,
  )
  if (existing) {
    if (entry.score > existing.score) {
      existing.score = entry.score
      existing.at = entry.at
    }
    if (entry.gear > existing.gear) existing.gear = entry.gear
  } else {
    next.push(entry)
  }
  next.sort(
    (a, b) => b.score - a.score || b.gear - a.gear || a.name.localeCompare(b.name),
  )
  return next.slice(0, MAX_BOARD)
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return json(204, {})
  }

  const ip = clientIp(event)
  if (!rateLimit(ip)) {
    return json(429, { error: 'Too many requests' })
  }

  const blobStore = store()

  if (event.httpMethod === 'GET') {
    const level = cleanLevel(event.queryStringParameters?.level)
    const scores = await readScores(blobStore)
    const filtered = level ? scores.filter((s) => s.level === level) : scores
    return json(200, { scores: filtered })
  }

  if (event.httpMethod === 'POST') {
    let body
    try {
      body = JSON.parse(event.body || '{}')
    } catch {
      return json(400, { error: 'Invalid JSON' })
    }

    const name = cleanName(body.name)
    const level = cleanLevel(body.level)
    const score = cleanScore(body.score)
    const gear = cleanGear(body.gear ?? 1)
    if (!level || score == null || !gear) {
      return json(400, { error: 'Invalid name, level, score, or gear' })
    }

    const entry = normalizeScoreEntry({ name, level, score, gear, at: Date.now() })
    const current = await readScores(blobStore)
    const updated = upsertLocal(current, entry)
    await blobStore.setJSON(SCORES_KEY, updated)
    return json(200, {
      scores: updated.filter((s) => s.level === level),
      entry,
    })
  }

  return json(405, { error: 'Method not allowed' })
}
