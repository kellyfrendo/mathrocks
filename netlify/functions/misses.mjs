import {
  cleanLevel,
  cleanQuestion,
  clientIp,
  json,
  rateLimit,
  store,
} from './_shared.mjs'

const MISSES_KEY = 'misses-v1'
const TOP_N = 12

async function readMisses(blobStore) {
  try {
    const data = await blobStore.get(MISSES_KEY, { type: 'json' })
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

function topForLevel(bucket, limit = TOP_N) {
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
    const all = await readMisses(blobStore)
    if (level) {
      return json(200, { level, questions: topForLevel(all[String(level)]) })
    }
    const byLevel = {}
    for (let lvl = 1; lvl <= 4; lvl += 1) {
      byLevel[lvl] = topForLevel(all[String(lvl)])
    }
    return json(200, { byLevel })
  }

  if (event.httpMethod === 'POST') {
    let body
    try {
      body = JSON.parse(event.body || '{}')
    } catch {
      return json(400, { error: 'Invalid JSON' })
    }

    const level = cleanLevel(body.level)
    const question = cleanQuestion(body.question)
    const outcome = String(body.outcome || '').toLowerCase()
    if (!level || !question || (outcome !== 'miss' && outcome !== 'hit')) {
      return json(400, { error: 'Invalid level, question, or outcome' })
    }

    const all = await readMisses(blobStore)
    const key = String(level)
    const bucket = { ...(all[key] || {}) }
    const prev = bucket[question] || { misses: 0, attempts: 0 }
    const next = {
      misses: Math.max(0, Number(prev.misses) || 0) + (outcome === 'miss' ? 1 : 0),
      attempts: Math.max(0, Number(prev.attempts) || 0) + 1,
    }
    // Cap counters to avoid runaway values from abuse
    next.misses = Math.min(next.misses, 100000)
    next.attempts = Math.min(next.attempts, 100000)
    bucket[question] = next
    // Keep buckets from growing forever
    const ranked = Object.entries(bucket).sort(
      (a, b) => (Number(b[1]?.misses) || 0) - (Number(a[1]?.misses) || 0),
    )
    const trimmed = Object.fromEntries(ranked.slice(0, 80))
    all[key] = trimmed
    await blobStore.setJSON(MISSES_KEY, all)

    return json(200, {
      level,
      question,
      ...next,
      missRate: next.attempts > 0 ? next.misses / next.attempts : 0,
    })
  }

  return json(405, { error: 'Method not allowed' })
}
