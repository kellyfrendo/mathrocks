/**
 * Lightweight Web Audio sound effects (no external files).
 * unlock() must run from a user gesture before the first tone on some browsers.
 */

let ctx = null

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  return ctx
}

export function unlockAudio() {
  const ac = getCtx()
  if (!ac) return
  if (ac.state === 'suspended') ac.resume().catch(() => {})
}

function tone(ac, { freq, start, dur, type = 'sine', gain = 0.12, slideTo = null }) {
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (slideTo != null) {
    osc.frequency.linearRampToValueAtTime(slideTo, start + dur)
  }
  g.gain.setValueAtTime(0.0001, start)
  g.gain.exponentialRampToValueAtTime(gain, start + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  osc.connect(g)
  g.connect(ac.destination)
  osc.start(start)
  osc.stop(start + dur + 0.02)
}

/** Bright success chime */
export function playCorrect() {
  const ac = getCtx()
  if (!ac) return
  const t = ac.currentTime
  tone(ac, { freq: 523.25, start: t, dur: 0.12, gain: 0.1 })
  tone(ac, { freq: 659.25, start: t + 0.08, dur: 0.14, gain: 0.11 })
  tone(ac, { freq: 783.99, start: t + 0.16, dur: 0.22, gain: 0.12 })
}

/** Soft low “miss” thud */
export function playIncorrect() {
  const ac = getCtx()
  if (!ac) return
  const t = ac.currentTime
  tone(ac, { freq: 180, start: t, dur: 0.18, type: 'square', gain: 0.06, slideTo: 90 })
  tone(ac, { freq: 120, start: t + 0.05, dur: 0.28, type: 'triangle', gain: 0.08, slideTo: 70 })
}

/** Rising gear-shift fanfare */
export function playGearUp() {
  const ac = getCtx()
  if (!ac) return
  const t = ac.currentTime
  const notes = [392, 493.88, 587.33, 784]
  notes.forEach((freq, i) => {
    tone(ac, { freq, start: t + i * 0.07, dur: 0.16, type: 'triangle', gain: 0.1 })
  })
}
