import './style.css'
import { loadStarterProblems } from './questions.js'
import { unlockAudio, playCorrect, playIncorrect, playGearUp } from './sounds.js'

const STORAGE_KEY = 'math-rocks-scores-v2'
const STORAGE_KEY_LEGACY = 'math-rocks-scores-v1'
const SOUND_KEY = 'math-rocks-sounds-on'
const MAX_LIVES = 3
const MAX_BOARD = 10
const STREAK_PER_GEAR = 10
const MAX_GEAR = 5

const LEVELS = [
  {
    id: 1,
    title: 'Level 1',
    desc: 'One-digit addition',
    ops: ['+'],
    digits: 1,
    fallMs: 16000,
  },
  {
    id: 2,
    title: 'Level 2',
    desc: 'One-digit + and −',
    ops: ['+', '-'],
    digits: 1,
    fallMs: 14000,
  },
  {
    id: 3,
    title: 'Level 3',
    desc: 'Two-digit addition',
    ops: ['+'],
    digits: 2,
    fallMs: 18000,
  },
  {
    id: 4,
    title: 'Level 4',
    desc: 'Two-digit + and −',
    ops: ['+', '-'],
    digits: 2,
    fallMs: 16000,
  },
]

const state = {
  screen: 'menu',
  playerName: '',
  level: null,
  score: 0,
  lives: MAX_LIVES,
  answer: '',
  problem: null,
  falling: false,
  animId: null,
  startTs: 0,
  fallMs: 9000,
  lastHighlight: '',
  queue: [],
  startersDone: false,
  challengeTier: 0,
  streak: 0,
  gear: 1,
  scoreboardLevel: 1,
  soundsOn: loadSoundsPref(),
  paused: false,
  avoidProblemText: '',
}

function loadSoundsPref() {
  try {
    return localStorage.getItem(SOUND_KEY) === '1'
  } catch {
    return false
  }
}

function saveSoundsPref(on) {
  try {
    localStorage.setItem(SOUND_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function sfx(kind) {
  if (!state.soundsOn) return
  if (kind === 'correct') playCorrect()
  else if (kind === 'incorrect') playIncorrect()
  else if (kind === 'gear') playGearUp()
}

const app = document.querySelector('#app')

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function shuffle(list) {
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = randInt(0, i)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function gearLabel(gear) {
  const n = Number(gear) || 1
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`
  const ends = ['th', 'st', 'nd', 'rd']
  return `${n}${ends[n % 10] || 'th'}`
}

function streakProgressText() {
  if (state.gear >= MAX_GEAR) return 'MAX gear'
  const into = state.streak % STREAK_PER_GEAR
  return `${into}/${STREAK_PER_GEAR} to ${gearLabel(state.gear + 1)}`
}

/**
 * Put a missed question back in the mix — but NOT as the immediate next
 * (unless it's the only one left), so it doesn't loop on the same rock.
 */
function requeueProblem(problem) {
  if (!problem) return
  const copy = { ...problem, fromStarter: Boolean(problem.fromStarter) }
  if (state.queue.length === 0) {
    state.queue.push(copy)
    return
  }
  // Insert anywhere except index 0
  const idx = randInt(1, state.queue.length)
  state.queue.splice(idx, 0, copy)
}

/** Harder follow-up questions that stay in-topic but keep variety. */
function makeHarderProblem(level, tier, avoidText = '') {
  const t = Math.max(1, tier)
  let problem = null
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const op = level.ops[randInt(0, level.ops.length - 1)]
    let a
    let b

    if (level.digits === 1) {
      if (op === '+') {
        // Bias toward larger addends as tier rises, but always keep a real range
        const bias = Math.min(5, t)
        a = randInt(Math.max(0, bias), 9)
        b = randInt(Math.max(0, bias), 9)
        // Prefer sums that need carrying once past early tiers
        if (t >= 2 && a + b < 10 && Math.random() < 0.55) {
          a = randInt(5, 9)
          b = randInt(10 - a, 9)
        }
      } else {
        a = randInt(Math.min(9, 3 + Math.min(t, 5)), 9)
        const maxSub = Math.max(1, a - (t >= 2 ? 1 : 0))
        b = randInt(0, maxSub)
        if (t >= 2 && a === b) b = Math.max(0, a - randInt(1, Math.min(4, a)))
      }
    } else if (op === '+') {
      const span = Math.min(40, 12 + t * 5)
      const mid = Math.min(70, 25 + t * 6)
      a = randInt(Math.max(10, mid - span), Math.min(99, mid + span))
      b = randInt(Math.max(10, mid - span), Math.min(99, mid + span))
    } else {
      a = randInt(Math.min(90, 25 + t * 5), Math.min(99, 55 + t * 6))
      b = randInt(10, Math.max(10, a - 3))
    }

    const answer = op === '+' ? a + b : a - b
    const symbol = op === '-' ? '−' : '+'
    const text = `${a}${symbol}${b}`
    problem = {
      a,
      b,
      op,
      symbol,
      answer,
      text,
      fromStarter: false,
      tier: t,
    }
    if (text !== avoidText) break
  }
  return problem
}

function nextProblem() {
  if (state.queue.length > 0) {
    return state.queue.shift()
  }
  if (!state.startersDone) {
    state.startersDone = true
    state.challengeTier = 1
  } else {
    state.challengeTier += 1
  }
  const prev = state.problem?.text || ''
  return makeHarderProblem(state.level, state.challengeTier, prev)
}

function fallMsForGear() {
  // ~28% faster per gear so the shift is obvious
  const gearFactor = Math.max(0.28, 1 - (state.gear - 1) * 0.28)
  return Math.max(3500, Math.round(state.level.fallMs * gearFactor))
}

function normalizeScoreEntry(raw) {
  return {
    name: String(raw?.name || 'Player').slice(0, 16),
    level: Number(raw?.level) || 1,
    score: Number(raw?.score) || 0,
    gear: Math.max(1, Number(raw?.gear) || 1),
    at: Number(raw?.at) || Date.now(),
  }
}

function loadScores() {
  try {
    let raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      // One-time migrate from v1 (single best score, no per-level split)
      const legacy = localStorage.getItem(STORAGE_KEY_LEGACY)
      if (legacy) {
        const parsed = JSON.parse(legacy)
        const migrated = (Array.isArray(parsed) ? parsed : []).map(normalizeScoreEntry)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
        raw = JSON.stringify(migrated)
      }
    }
    const parsed = raw ? JSON.parse(raw) : []
    return (Array.isArray(parsed) ? parsed : []).map(normalizeScoreEntry)
  } catch {
    return []
  }
}

/** Best score + highest gear reached, stored per player per level. */
function saveScore(name, score, levelId, gearReached = 1) {
  const clean = String(name || 'Player').trim().slice(0, 16) || 'Player'
  const level = Number(levelId) || 1
  const gear = Math.max(1, Number(gearReached) || 1)
  const scores = loadScores()
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scores.slice(0, 200)))
  return scoresForLevel(level)
}

function scoresForLevel(levelId) {
  const level = Number(levelId) || 1
  return loadScores()
    .filter((s) => s.level === level)
    .sort((a, b) => b.score - a.score || b.gear - a.gear || a.name.localeCompare(b.name))
    .slice(0, MAX_BOARD)
}

function starsMarkup(count = 48) {
  const bits = []
  for (let i = 0; i < count; i += 1) {
    const left = Math.random() * 100
    const top = Math.random() * 72
    const size = Math.random() > 0.82 ? 'big' : Math.random() > 0.55 ? 'mid' : 'sm'
    const kind = Math.random() > 0.78 ? 'spark' : 'dot'
    bits.push(
      `<span class="star ${size} ${kind}" style="left:${left}%;top:${top}%;--delay:${(Math.random() * 4).toFixed(2)}s;--dur:${(2.4 + Math.random() * 3).toFixed(2)}s"></span>`,
    )
  }
  return bits.join('')
}

function backdrop() {
  return `
    <div class="sky" aria-hidden="true">
      <div class="nebula n1"></div>
      <div class="nebula n2"></div>
      <div class="distant-body b1"></div>
      <div class="distant-body b2"></div>
      <div class="stars">${starsMarkup()}</div>
    </div>
  `
}

/** Irregular green landmasses in open blue areas (sides + above/below HUD). */
function planetSurfaceInner(extra = '') {
  return `
    <svg class="earth-land" viewBox="0 0 1000 220" preserveAspectRatio="none" aria-hidden="true">
      <!-- left continent: tall, jagged, clear of center HUD -->
      <path fill="#2f8a3c" d="M0 20 L55 2 L120 10 L160 45 L145 95 L175 130 L140 175 L90 195 L35 170 L10 120 L25 70 Z"/>
      <path fill="#3d9a4a" d="M95 40 L150 18 L210 35 L230 80 L195 120 L155 105 L125 140 L95 95 Z"/>
      <!-- upper islands near horizon -->
      <path fill="#48b057" d="M250 6 L320 0 L380 14 L370 42 L310 50 L255 32 Z"/>
      <path fill="#2a7034" d="M420 4 L500 2 L560 18 L545 48 L480 55 L425 36 Z"/>
      <path fill="#3d9a4a" d="M600 8 L680 2 L740 16 L730 46 L660 54 L605 34 Z"/>
      <path fill="#348a40" d="M780 6 L860 0 L930 12 L950 40 L900 55 L820 48 L785 28 Z"/>
      <!-- right continent -->
      <path fill="#2d7a38" d="M820 55 L880 30 L950 25 L1000 55 L995 120 L960 165 L910 190 L860 160 L835 110 Z"/>
      <path fill="#3fa34c" d="M760 70 L820 50 L870 75 L860 120 L810 140 L770 110 Z"/>
      <!-- mid-low islands under answer row / hint -->
      <path fill="#2f8a3c" d="M220 145 L300 125 L370 150 L355 190 L285 205 L230 185 Z"/>
      <path fill="#4aad55" d="M400 150 L480 135 L545 160 L530 198 L455 210 L395 185 Z"/>
      <path fill="#348f42" d="M570 155 L650 138 L720 165 L705 205 L630 215 L560 190 Z"/>
      <path fill="#2a7034" d="M40 175 L110 160 L165 185 L145 215 L70 218 L25 195 Z"/>
      <path fill="#3d9a4a" d="M860 170 L930 155 L985 180 L970 215 L900 218 L845 195 Z"/>
      <!-- small random scraps -->
      <path fill="#48b057" d="M310 70 L355 58 L385 82 L360 105 L315 95 Z"/>
      <path fill="#2f8a3c" d="M640 75 L690 60 L725 88 L695 112 L645 100 Z"/>
    </svg>
    ${extra}
  `
}

function rockSvg() {
  return `
    <svg class="rock-svg" viewBox="0 0 200 200" aria-hidden="true">
      <path fill="#9aa0ad" d="M52 38c18-24 58-34 92-18 28 14 48 42 42 78-4 28-22 52-50 62-30 10-66 4-86-22-22-28-18-68 2-100z"/>
      <path fill="#d5d8e0" opacity="0.55" d="M62 48c14-18 46-26 72-12 8 4 18 14 24 28-18-8-42-10-66-2-12 4-22 12-30 22-4-12-4-26 0-36z"/>
      <path fill="#5f6573" opacity="0.55" d="M58 118c12 22 42 36 74 28 18-4 32-16 40-32-10 18-30 30-54 34-28 4-50-6-60-30z"/>
      <ellipse cx="68" cy="72" rx="14" ry="11" fill="#6d7380" opacity="0.55"/>
      <ellipse cx="118" cy="58" rx="10" ry="8" fill="#6d7380" opacity="0.45"/>
      <ellipse cx="96" cy="112" rx="18" ry="14" fill="#5c6270" opacity="0.4"/>
      <ellipse cx="140" cy="98" rx="9" ry="7" fill="#6d7380" opacity="0.5"/>
      <ellipse cx="72" cy="128" rx="8" ry="6" fill="#6d7380" opacity="0.35"/>
      <path d="M44 86c8-6 14-4 18 2" stroke="#eceff4" stroke-width="3" stroke-linecap="round" opacity="0.35" fill="none"/>
    </svg>
  `
}

function heartSvg(lost = false) {
  return `
    <svg class="heart ${lost ? 'lost' : ''}" viewBox="0 0 32 30" aria-hidden="true">
      <path fill="#e1243b" stroke="#b01024" stroke-width="1.2" d="M16 27S3.5 18.2 3.5 10.8C3.5 6.4 6.8 3.5 10.8 3.5c2.4 0 4.5 1.2 5.2 3 0.7-1.8 2.8-3 5.2-3 4 0 7.3 2.9 7.3 7.3C28.5 18.2 16 27 16 27z"/>
      <path fill="#ff6b7a" d="M16 27S3.5 18.2 3.5 10.8C3.5 6.4 6.8 3.5 10.8 3.5c2.4 0 4.5 1.2 5.2 3 0.7-1.8 2.8-3 5.2-3 4 0 7.3 2.9 7.3 7.3C28.5 18.2 16 27 16 27z" opacity="0.35"/>
      <path fill="#fff" opacity="0.4" d="M10.2 8.2c1.4-1.2 3.4-.6 3.8.7-1.8.1-3.2 1.1-3.8 2.4-.8-1.2-1.2-2.2 0-3.1z"/>
    </svg>
  `
}

function stopFall() {
  if (state.animId) {
    cancelAnimationFrame(state.animId)
    state.animId = null
  }
  state.falling = false
}

function render() {
  stopFall()
  if (state.screen === 'menu') renderMenu()
  else if (state.screen === 'levels') renderLevels()
  else if (state.screen === 'play') renderPlay()
  else if (state.screen === 'gameover') renderGameOver()
  else if (state.screen === 'scoreboard') renderScoreboard()
}

function renderMenu() {
  app.innerHTML = `
    ${backdrop()}
    <div class="planet-shell menu-planet" aria-hidden="true">
      <div class="planet-surface">${planetSurfaceInner()}</div>
    </div>
    <main class="screen menu-screen">
      <div class="hero">
        <div class="hero-rock" aria-hidden="true">${rockSvg()}<span class="hero-eq">7+8</span></div>
        <h1 class="brand">Math Rocks!</h1>
        <p class="tagline">Answer the question correctly before the asteroid hits your planet...</p>
        <form class="panel name-panel" id="name-form" action="#" method="get">
          <label class="field-label" for="player-name">Your name</label>
          <input id="player-name" class="name-input" maxlength="16" autocomplete="nickname" placeholder="Captain Nova" value="${escapeAttr(state.playerName)}" required />
          <button class="btn btn-primary" type="submit" id="btn-start">Start Mission</button>
        </form>
        <div class="menu-actions">
          <button class="btn btn-ghost" type="button" id="btn-scores" data-nav="scoreboard">Scoreboard</button>
        </div>
      </div>
    </main>
  `

  const form = app.querySelector('#name-form')
  const input = app.querySelector('#player-name')
  input.focus()
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    e.stopPropagation()
    const name = input.value.trim()
    if (!name) return
    state.playerName = name.slice(0, 16)
    state.screen = 'levels'
    render()
  })
  app.querySelector('#btn-scores').addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    const typed = input.value.trim()
    if (typed) state.playerName = typed.slice(0, 16)
    state.lastHighlight = state.playerName || ''
    state.screen = 'scoreboard'
    render()
  })
}

function renderLevels() {
  app.innerHTML = `
    ${backdrop()}
    <div class="planet-shell menu-planet" aria-hidden="true">
      <div class="planet-surface">${planetSurfaceInner()}</div>
    </div>
    <main class="screen level-screen">
      <p class="pilot">Pilot: <strong>${escapeHtml(state.playerName)}</strong></p>
      <h2 class="screen-heading">Choose a Level</h2>
      <p class="screen-sub">Harder levels mean bigger numbers — and faster rocks.</p>
      <label class="sound-toggle">
        <input type="checkbox" id="sounds-on" ${state.soundsOn ? 'checked' : ''} />
        <span class="sound-toggle-box" aria-hidden="true"></span>
        <span class="sound-toggle-label">Sounds on</span>
      </label>
      <div class="level-grid">
        ${LEVELS.map(
          (lvl) => `
          <button class="level-btn" type="button" data-level="${lvl.id}">
            <span class="level-num">${lvl.id}</span>
            <span>
              <span class="level-title">${lvl.title}</span>
              <span class="level-desc">${lvl.desc}</span>
            </span>
          </button>`,
        ).join('')}
      </div>
      <div class="back-row">
        <button class="btn btn-ghost" type="button" id="btn-back-menu">Back</button>
      </div>
    </main>
  `

  const soundBox = app.querySelector('#sounds-on')
  soundBox.addEventListener('change', () => {
    state.soundsOn = soundBox.checked
    saveSoundsPref(state.soundsOn)
    if (state.soundsOn) {
      unlockAudio()
      // Tiny preview so kids know sound works
      playCorrect()
    }
  })

  app.querySelectorAll('[data-level]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (state.soundsOn) unlockAudio()
      const id = Number(btn.dataset.level)
      startGame(LEVELS.find((l) => l.id === id))
    })
  })
  app.querySelector('#btn-back-menu').addEventListener('click', () => {
    state.screen = 'menu'
    render()
  })
}

function startGame(level) {
  state.level = level
  state.score = 0
  state.lives = MAX_LIVES
  state.answer = ''
  state.screen = 'play'
  state.queue = shuffle(loadStarterProblems(level.id))
  state.startersDone = state.queue.length === 0
  state.challengeTier = 0
  state.streak = 0
  state.gear = 1
  state.paused = false
  state.avoidProblemText = ''
  state.fallMs = fallMsForGear()
  render()
}

function renderPlay() {
  app.innerHTML = `
    ${backdrop()}
    <main class="screen play-screen">
      <div class="playfield" id="playfield">
        <div class="gear-meter" id="gear-meter" aria-live="polite">
          <span class="gear-label">SPEED</span>
          <span class="gear-value" id="gear-val">${gearLabel(state.gear)} gear</span>
          <span class="gear-streak" id="gear-streak">${streakProgressText()}</span>
        </div>
        <div class="play-actions">
          <button type="button" class="play-action-btn" id="btn-pause">Pause</button>
          <button type="button" class="play-action-btn play-action-end" id="btn-end">End</button>
        </div>
        <div class="flash" id="flash"></div>
        <div class="rock" id="rock">
          <div class="rock-body">${rockSvg()}</div>
          <div class="rock-eq" id="rock-eq"></div>
        </div>
        <div class="pause-overlay hidden" id="pause-overlay">
          <p class="pause-title">Paused</p>
          <p class="pause-sub">A new question will appear when you continue</p>
          <button type="button" class="btn btn-primary pause-resume" id="btn-resume">Resume</button>
        </div>
      </div>

      <div class="planet-shell play-planet" id="planet">
        <div class="planet-surface">
          ${planetSurfaceInner(`
          <div class="hud">
            <div class="score-pill" aria-live="polite">SCORE:<span id="score-val">0</span></div>
            <input
              id="answer-box"
              class="answer-box"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              maxlength="4"
              autocomplete="off"
              enterkeyhint="done"
              aria-label="Your answer"
              placeholder=""
            />
            <div class="lives" id="lives" aria-label="Lives">${heartsMarkup(MAX_LIVES)}</div>
          </div>
          `)}
        </div>
      </div>
    </main>
  `

  const answerBox = app.querySelector('#answer-box')
  answerBox.addEventListener('input', () => {
    const cleaned = answerBox.value.replace(/\D/g, '').slice(0, 4)
    if (cleaned !== answerBox.value) answerBox.value = cleaned
    state.answer = cleaned
    answerBox.classList.toggle('empty', cleaned === '')
  })
  answerBox.addEventListener('keydown', (e) => {
    if (state.paused) {
      e.preventDefault()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      submitAnswer()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      state.answer = ''
      syncAnswer()
    }
  })

  app.querySelector('#btn-pause').addEventListener('click', pauseGame)
  app.querySelector('#btn-end').addEventListener('click', () => {
    if (state.paused) resumeOverlayOnly()
    endGame()
  })
  app.querySelector('#btn-resume').addEventListener('click', resumeGame)

  window.removeEventListener('keydown', onKeyDown)
  window.addEventListener('keydown', onKeyDown)
  focusAnswer()
  requestAnimationFrame(() => {
    requestAnimationFrame(() => spawnRock())
  })
}

function resumeOverlayOnly() {
  const overlay = app.querySelector('#pause-overlay')
  if (overlay) overlay.classList.add('hidden')
  state.paused = false
}

function pauseGame() {
  if (state.screen !== 'play' || state.paused) return
  if (!state.falling && !state.problem) return
  stopFall()
  state.paused = true
  const box = app.querySelector('#answer-box')
  if (box) {
    box.blur()
    box.readOnly = true
  }
  const overlay = app.querySelector('#pause-overlay')
  if (overlay) overlay.classList.remove('hidden')
  const rock = app.querySelector('#rock')
  if (rock) rock.classList.add('paused')
}

function resumeGame() {
  if (state.screen !== 'play' || !state.paused) return
  const skipped = state.problem
  // Put the paused question back in the mix, but force a different one next
  if (skipped) {
    requeueProblem(skipped)
    state.avoidProblemText = skipped.text || ''
  }
  state.paused = false
  state.answer = ''
  const overlay = app.querySelector('#pause-overlay')
  if (overlay) overlay.classList.add('hidden')
  const rock = app.querySelector('#rock')
  if (rock) rock.classList.remove('paused')
  const box = app.querySelector('#answer-box')
  if (box) {
    box.readOnly = false
    clearCorrectReveal()
  }
  spawnRock()
}

function focusAnswer() {
  const box = app.querySelector('#answer-box')
  if (box) box.focus({ preventScroll: true })
}

function heartsMarkup(lives) {
  return Array.from({ length: MAX_LIVES }, (_, i) => heartSvg(i >= lives)).join('')
}

function syncHud() {
  const scoreEl = app.querySelector('#score-val')
  const livesEl = app.querySelector('#lives')
  const gearEl = app.querySelector('#gear-val')
  const streakEl = app.querySelector('#gear-streak')
  if (scoreEl) scoreEl.textContent = String(state.score)
  if (livesEl) livesEl.innerHTML = heartsMarkup(state.lives)
  if (gearEl) gearEl.textContent = `${gearLabel(state.gear)} gear`
  if (streakEl) streakEl.textContent = streakProgressText()
  syncAnswer()
}

function syncAnswer() {
  const box = app.querySelector('#answer-box')
  if (!box) return
  if (box.value !== state.answer) box.value = state.answer
  box.classList.toggle('empty', !state.answer)
}

function pickNextProblem() {
  const avoid = state.avoidProblemText
  state.avoidProblemText = ''
  let problem = nextProblem()
  if (!avoid || !problem) return problem
  // Prefer a different question than the one we just paused
  for (let i = 0; i < 12; i += 1) {
    if (problem.text !== avoid) return problem
    requeueProblem(problem)
    problem = nextProblem()
  }
  return problem
}

function spawnRock() {
  if (state.paused || state.screen !== 'play') return
  state.problem = pickNextProblem()
  state.answer = ''
  state.falling = true
  state.startTs = performance.now()
  state.fallMs = fallMsForGear()

  const rock = app.querySelector('#rock')
  const eq = app.querySelector('#rock-eq')
  const playfield = app.querySelector('#playfield')
  if (!rock || !eq || !playfield) return

  rock.classList.remove('shatter', 'impact', 'paused')
  eq.textContent = state.problem.text
  rock.style.top = '-18%'
  // Spread across the screen (keep margins so the rock stays on-screen)
  rock.style.left = `${18 + Math.random() * 64}%`
  clearCorrectReveal()
  syncHud()
  focusAnswer()

  const endY = playfield.clientHeight - rock.clientHeight * 0.35

  const tick = (now) => {
    if (!state.falling || state.paused) return
    const t = Math.min(1, (now - state.startTs) / state.fallMs)
    const y = -0.18 * playfield.clientHeight + t * (endY + 0.18 * playfield.clientHeight)
    rock.style.top = `${y}px`
    rock.style.transform = `translateX(-50%) rotate(${t * 28 - 8}deg)`

    if (t >= 1) {
      onMiss()
      return
    }
    state.animId = requestAnimationFrame(tick)
  }
  state.animId = requestAnimationFrame(tick)
}

function flash(kind) {
  const el = app.querySelector('#flash')
  if (!el) return
  el.className = `flash ${kind}`
  void el.offsetWidth
  el.classList.add('show')
  setTimeout(() => el.classList.remove('show', 'good', 'bad'), 420)
}

function onKeyDown(e) {
  if (state.screen !== 'play' || state.paused) return
  const tag = (e.target && e.target.tagName) || ''
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  if (!state.falling) return
  if (e.key >= '0' && e.key <= '9') {
    if (state.answer.length < 4) {
      state.answer += e.key
      syncAnswer()
      focusAnswer()
    }
  } else if (e.key === 'Backspace') {
    state.answer = state.answer.slice(0, -1)
    syncAnswer()
    focusAnswer()
  } else if (e.key === 'Enter') {
    submitAnswer()
  } else if (e.key === 'Escape') {
    state.answer = ''
    syncAnswer()
    focusAnswer()
  }
}

function submitAnswer() {
  if (state.paused) return
  const box = app.querySelector('#answer-box')
  if (box?.classList.contains('reveal-correct')) return
  if (!state.falling || !state.problem) return
  // Trust the visible field so typed digits aren't lost before Enter
  const raw = String(box?.value ?? state.answer).replace(/\D/g, '').slice(0, 4)
  state.answer = raw
  const value = Number(raw)
  if (raw === '' || Number.isNaN(value)) return

  if (value === state.problem.answer) {
    onCorrect()
  } else {
    stopFall()
    onWrong()
  }
}

function bumpStreakAndMaybeGear() {
  state.streak += 1
  if (state.streak > 0 && state.streak % STREAK_PER_GEAR === 0 && state.gear < MAX_GEAR) {
    state.gear += 1
    celebrateGearShift()
  }
}

function celebrateGearShift() {
  sfx('gear')
  const meter = app.querySelector('#gear-meter')
  const gearEl = app.querySelector('#gear-val')
  const streakEl = app.querySelector('#gear-streak')
  if (gearEl) gearEl.textContent = `${gearLabel(state.gear)} gear`
  if (streakEl) streakEl.textContent = streakProgressText()
  if (meter) {
    meter.classList.remove('gear-shift')
    void meter.offsetWidth
    meter.classList.add('gear-shift')
  }
}

function onCorrect() {
  stopFall()
  // Points equal current gear (1st→1, 2nd→2, …); gear-up happens after scoring
  state.score += state.gear
  sfx('correct')
  bumpStreakAndMaybeGear()
  syncHud()
  flash('good')
  explodeRock()
  setTimeout(() => {
    if (state.screen === 'play') spawnRock()
  }, 720)
}

function explodeRock() {
  const rock = app.querySelector('#rock')
  const playfield = app.querySelector('#playfield')
  if (!rock || !playfield) return

  const rect = rock.getBoundingClientRect()
  const field = playfield.getBoundingClientRect()
  const cx = rect.left + rect.width / 2 - field.left
  const cy = rect.top + rect.height / 2 - field.top

  rock.classList.add('shatter')

  const boom = document.createElement('div')
  boom.className = 'boom'
  boom.style.left = `${cx}px`
  boom.style.top = `${cy}px`
  playfield.appendChild(boom)

  const colors = ['#d5d8e0', '#9aa0ad', '#5f6573', '#eceff4', '#f0b35a', '#fff6e8']
  const count = 14
  for (let i = 0; i < count; i += 1) {
    const bit = document.createElement('span')
    bit.className = 'debris'
    const angle = (Math.PI * 2 * i) / count + (Math.random() * 0.4 - 0.2)
    const dist = 70 + Math.random() * 110
    const size = 10 + Math.random() * 18
    bit.style.setProperty('--dx', `${Math.cos(angle) * dist}px`)
    bit.style.setProperty('--dy', `${Math.sin(angle) * dist}px`)
    bit.style.setProperty('--rot', `${(Math.random() * 520 - 260).toFixed(0)}deg`)
    bit.style.width = `${size}px`
    bit.style.height = `${size * (0.7 + Math.random() * 0.6)}px`
    bit.style.background = colors[i % colors.length]
    bit.style.left = `${cx}px`
    bit.style.top = `${cy}px`
    playfield.appendChild(bit)
  }

  setTimeout(() => {
    boom.remove()
    playfield.querySelectorAll('.debris').forEach((el) => el.remove())
  }, 700)
}

function onWrong() {
  sfx('incorrect')
  flash('bad')
  const box = app.querySelector('#answer-box')
  if (box) {
    box.classList.add('shake')
    setTimeout(() => box.classList.remove('shake'), 320)
  }
  state.streak = 0
  requeueProblem(state.problem)
  showCorrectAnswer()
  loseLife('wrong')
}

function showCorrectAnswer() {
  const correct = state.problem?.answer
  if (correct == null) return
  const box = app.querySelector('#answer-box')
  if (!box) return
  state.answer = String(correct)
  box.value = String(correct)
  box.classList.remove('empty')
  box.classList.add('reveal-correct')
  box.readOnly = true
}

function clearCorrectReveal() {
  const box = app.querySelector('#answer-box')
  if (!box) return
  box.classList.remove('reveal-correct')
  box.readOnly = false
}

function onMiss() {
  stopFall()
  sfx('incorrect')
  flash('bad')
  state.streak = 0
  requeueProblem(state.problem)
  showCorrectAnswer()
  loseLife('timeout')
}

function loseLife(reason = 'miss') {
  state.lives -= 1
  const scoreEl = app.querySelector('#score-val')
  const livesEl = app.querySelector('#lives')
  if (scoreEl) scoreEl.textContent = String(state.score)
  if (livesEl) livesEl.innerHTML = heartsMarkup(state.lives)
  const planet = app.querySelector('#planet')
  const rock = app.querySelector('#rock')
  if (planet) {
    planet.classList.add('hit')
    setTimeout(() => planet.classList.remove('hit'), 450)
  }
  if (rock) rock.classList.add('impact')

  const pause = reason === 'wrong' || reason === 'timeout' ? 1400 : 550
  if (state.lives <= 0) {
    setTimeout(() => endGame(), Math.max(500, pause))
  } else {
    setTimeout(() => {
      if (state.screen === 'play') spawnRock()
    }, pause)
  }
}

function endGame() {
  stopFall()
  state.paused = false
  window.removeEventListener('keydown', onKeyDown)
  const levelId = state.level?.id || 1
  saveScore(state.playerName, state.score, levelId, state.gear)
  state.lastHighlight = state.playerName
  state.scoreboardLevel = levelId
  state.screen = 'gameover'
  render()
}

function levelTabsMarkup(activeLevel) {
  return `
    <div class="level-tabs" role="tablist" aria-label="Scoreboard levels">
      ${LEVELS.map(
        (lvl) => `
        <button
          type="button"
          class="level-tab${lvl.id === activeLevel ? ' active' : ''}"
          role="tab"
          aria-selected="${lvl.id === activeLevel ? 'true' : 'false'}"
          data-board-level="${lvl.id}"
        >Level ${lvl.id}</button>`,
      ).join('')}
    </div>
  `
}

function bindLevelTabs(root, onChange) {
  root.querySelectorAll('[data-board-level]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.boardLevel)
      state.scoreboardLevel = id
      onChange(id)
    })
  })
}

function renderBoardPanel(levelId, highlightName, title = 'Top Pilots') {
  const scores = scoresForLevel(levelId)
  return `
    ${levelTabsMarkup(levelId)}
    <h3 class="board-title">${title} · Level ${levelId}</h3>
    <div class="board-head" aria-hidden="true">
      <span></span>
      <span>Pilot</span>
      <span>Score</span>
      <span>Gear</span>
    </div>
    ${boardList(scores, highlightName)}
  `
}

function renderGameOver() {
  const levelId = state.scoreboardLevel || state.level?.id || 1

  app.innerHTML = `
    ${backdrop()}
    <div class="planet-shell menu-planet" aria-hidden="true">
      <div class="planet-surface">${planetSurfaceInner()}</div>
    </div>
    <main class="screen overlay-card">
      <h2 class="screen-heading">Planet Hit!</h2>
      <p class="screen-sub">${escapeHtml(state.playerName)} · Level ${state.level?.id || '?'}</p>
      <p class="score-big">${state.score}</p>
      <p class="screen-sub">Final score · Top speed ${gearLabel(state.gear)} gear</p>
      <div class="panel board-panel" id="board-panel">
        ${renderBoardPanel(levelId, state.playerName)}
      </div>
      <div class="action-stack">
        <button class="btn btn-primary" type="button" id="btn-replay">Play Again</button>
        <button class="btn btn-ghost" type="button" id="btn-levels">Change Level</button>
        <button class="btn btn-ghost" type="button" id="btn-menu">Main Menu</button>
      </div>
    </main>
  `

  const panel = app.querySelector('#board-panel')
  const rebind = () => {
    bindLevelTabs(panel, (id) => {
      panel.innerHTML = renderBoardPanel(id, state.playerName)
      rebind()
    })
  }
  rebind()

  app.querySelector('#btn-replay').addEventListener('click', () => startGame(state.level))
  app.querySelector('#btn-levels').addEventListener('click', () => {
    state.screen = 'levels'
    render()
  })
  app.querySelector('#btn-menu').addEventListener('click', () => {
    state.screen = 'menu'
    render()
  })
}

function renderScoreboard() {
  const levelId = state.scoreboardLevel || 1

  app.innerHTML = `
    ${backdrop()}
    <div class="planet-shell menu-planet" aria-hidden="true">
      <div class="planet-surface">${planetSurfaceInner()}</div>
    </div>
    <main class="screen overlay-card">
      <h2 class="screen-heading">Scoreboard</h2>
      <p class="screen-sub">Best scores &amp; fastest gear by level</p>
      <div class="panel board-panel" id="board-panel">
        ${renderBoardPanel(levelId, state.lastHighlight)}
      </div>
      <div class="action-stack">
        <button class="btn btn-primary" type="button" id="btn-back">Back</button>
      </div>
    </main>
  `

  const panel = app.querySelector('#board-panel')
  const rebind = () => {
    bindLevelTabs(panel, (id) => {
      panel.innerHTML = renderBoardPanel(id, state.lastHighlight)
      rebind()
    })
  }
  rebind()

  app.querySelector('#btn-back').addEventListener('click', () => {
    state.screen = 'menu'
    render()
  })
}

function boardList(scores, highlightName = '') {
  if (!scores.length) {
    return `<p class="board-empty">No scores for this level yet — be the first pilot!</p>`
  }
  return `
    <ol class="board-list">
      ${scores
        .map((s, i) => {
          const you =
            highlightName && s.name.toLowerCase() === highlightName.toLowerCase() ? ' you' : ''
          return `
          <li class="board-row${you}">
            <span class="board-rank">${i + 1}</span>
            <span class="board-name">${escapeHtml(s.name)}</span>
            <span class="board-score">${s.score}</span>
            <span class="board-gear">${gearLabel(s.gear)}</span>
          </li>`
        })
        .join('')}
    </ol>
  `
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/'/g, '&#39;')
}

window.addEventListener('beforeunload', () => {
  window.removeEventListener('keydown', onKeyDown)
})

render()
