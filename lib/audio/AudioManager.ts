/**
 * AudioManager — Global singleton audio engine for TCNP
 *
 * All audio in the app routes through this class so that:
 * - There is only ONE AudioContext across the entire tab
 * - Global mute is honoured by every sound source
 * - Mute state persists across page navigations (localStorage)
 *
 * Usage:
 *   import { audioManager } from '@/lib/audio/AudioManager'
 *   audioManager.playChime('info')
 *   audioManager.startAlarm()
 *   audioManager.setMuted(true)
 */

const STORAGE_KEY = 'tcnp_audio_muted'

export type ChimeType = 'info' | 'success' | 'warning' | 'error' | 'chat' | 'broken_arrow' | string

class AudioManager {
  private static _instance: AudioManager | null = null

  private _ctx: AudioContext | null = null
  private _muted: boolean = false
  private _alarmIntervalId: ReturnType<typeof setInterval> | null = null
  /** Used to signal the alarm cycle to stop if mute fires mid-burst */
  private _alarmGeneration = 0
  /** Live oscillator/gain nodes for the current alarm burst, so stopAlarm() can
   *  silence tones that were already scheduled into the future (Web Audio can't
   *  be un-scheduled by clearing the JS interval — the node must be stopped). */
  private _alarmNodes: { osc: OscillatorNode; gain: GainNode }[] = []

  private constructor() {
    if (typeof window !== 'undefined') {
      try {
        this._muted = localStorage.getItem(STORAGE_KEY) === 'true'
      } catch {
        // iOS private mode
      }

      // iOS/Safari: the AudioContext can only start from a user gesture.
      // Unlock once on the first interaction so later realtime chimes
      // (which arrive with no gesture) are audible.
      const unlock = () => {
        try {
          const c = this.ctx
          if (c.state === 'suspended') void c.resume()
        } catch { /* audio unavailable */ }
        window.removeEventListener('pointerdown', unlock)
        window.removeEventListener('touchend', unlock)
        window.removeEventListener('keydown', unlock)
      }
      window.addEventListener('pointerdown', unlock, { passive: true })
      window.addEventListener('touchend', unlock, { passive: true })
      window.addEventListener('keydown', unlock)
    }
  }

  static getInstance(): AudioManager {
    if (!AudioManager._instance) {
      AudioManager._instance = new AudioManager()
    }
    return AudioManager._instance
  }

  // ------------------------------------------------------------------ context

  private get ctx(): AudioContext {
    if (!this._ctx || this._ctx.state === 'closed') {
      this._ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    // Resume if suspended (browser autoplay policy)
    if (this._ctx.state === 'suspended') {
      this._ctx.resume().catch(() => {})
    }
    return this._ctx
  }

  // ------------------------------------------------------------------ mute

  get muted(): boolean {
    return this._muted
  }

  setMuted(value: boolean): void {
    this._muted = value
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, String(value))
    }
    if (value) {
      this.stopAlarm()
      // Suspend AudioContext to immediately silence any in-flight oscillators.
      // Without this, already-scheduled osc.start(t) tones continue playing
      // for up to 1.4 s after the mute button is clicked.
      if (this._ctx && this._ctx.state === 'running') {
        this._ctx.suspend().catch(() => {})
      }
    } else {
      // Resume so future sounds can play again
      if (this._ctx && this._ctx.state === 'suspended') {
        this._ctx.resume().catch(() => {})
      }
    }
  }

  toggleMute(): boolean {
    this.setMuted(!this._muted)
    return this._muted
  }

  // ------------------------------------------------------------------ low-level primitives

  private scheduleTone(
    frequency: number,
    startOffset: number,
    duration: number,
    type: OscillatorType = 'sine',
    gainPeak = 0.3,
  ): void {
    if (this._muted) return
    try {
      const c = this.ctx
      const osc = c.createOscillator()
      const gain = c.createGain()
      osc.type = type
      osc.frequency.value = frequency
      const t = c.currentTime + startOffset
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(gainPeak, t + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration)
      osc.connect(gain)
      gain.connect(c.destination)
      osc.start(t)
      osc.stop(t + duration + 0.05)
    } catch {
      // Audio unavailable (iOS low-power, no user gesture, etc.)
    }
  }

  // ------------------------------------------------------------------ chimes

  playChime(type: ChimeType = 'info'): void {
    if (this._muted) return

    switch (type) {
      case 'broken_arrow':
        // BrokenArrowAlert owns all broken_arrow audio — do nothing here
        return

      case 'warning':
      case 'error':
        // Sharp two-tone descending alert
        this.scheduleTone(880, 0, 0.18, 'square', 0.35)
        this.scheduleTone(660, 0.22, 0.18, 'square', 0.35)
        break

      case 'success':
        // Ascending two-note chime
        this.scheduleTone(587, 0, 0.14, 'sine', 0.28)
        this.scheduleTone(880, 0.16, 0.22, 'sine', 0.28)
        break

      case 'chat':
        // Soft two-note pop
        this.scheduleTone(880, 0, 0.10, 'sine', 0.18)
        this.scheduleTone(1100, 0.12, 0.12, 'sine', 0.18)
        break

      case 'mention':
        // Insistent triple ping — someone needs YOU specifically
        this.scheduleTone(1175, 0, 0.09, 'triangle', 0.3)
        this.scheduleTone(1175, 0.13, 0.09, 'triangle', 0.3)
        this.scheduleTone(1568, 0.26, 0.18, 'triangle', 0.32)
        break

      case 'food_ready':
        // Warm dinner-bell arpeggio (C5–E5–G5–C6) — unmistakably the Welfare call
        this.scheduleTone(523, 0.00, 0.20, 'sine', 0.30)
        this.scheduleTone(659, 0.18, 0.20, 'sine', 0.30)
        this.scheduleTone(784, 0.36, 0.20, 'sine', 0.30)
        this.scheduleTone(1047, 0.54, 0.34, 'sine', 0.32)
        break

      case 'mission_request':
        // Bugle-style call to duty — rising fourth, held top note
        this.scheduleTone(392, 0.00, 0.16, 'triangle', 0.32)
        this.scheduleTone(523, 0.18, 0.16, 'triangle', 0.32)
        this.scheduleTone(659, 0.36, 0.40, 'triangle', 0.34)
        break

      default:
        // info — Teams-like D5 → G5
        this.scheduleTone(587, 0, 0.14, 'sine', 0.28)
        this.scheduleTone(784, 0.15, 0.22, 'sine', 0.28)
        break
    }
  }

  // ------------------------------------------------------------------ emergency alarm

  /** Schedule one alarm tone AND keep a handle to it so stopAlarm() can kill it
   *  even after it has been scheduled but before it has finished sounding. */
  private scheduleAlarmTone(frequency: number, startOffset: number, duration: number): void {
    if (this._muted) return
    try {
      const c = this.ctx
      const osc = c.createOscillator()
      const gain = c.createGain()
      osc.type = 'sawtooth'
      osc.frequency.value = frequency
      const t = c.currentTime + startOffset
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.4, t + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration)
      osc.connect(gain)
      gain.connect(c.destination)
      osc.start(t)
      osc.stop(t + duration + 0.05)
      const node = { osc, gain }
      this._alarmNodes.push(node)
      // Auto-forget once it has finished so the list doesn't grow unbounded
      osc.onended = () => {
        this._alarmNodes = this._alarmNodes.filter(n => n !== node)
      }
    } catch {
      // Audio unavailable (iOS low-power, no user gesture, etc.)
    }
  }

  private _playAlarmBurst(): void {
    if (this._muted) return
    // Sawtooth pattern identical to the previous BrokenArrowAlert.tsx
    this.scheduleAlarmTone(880, 0.00, 0.28)
    this.scheduleAlarmTone(660, 0.35, 0.28)
    this.scheduleAlarmTone(880, 0.70, 0.28)
    this.scheduleAlarmTone(660, 1.05, 0.28)
  }

  /** Start repeating alarm loop. Call stopAlarm() to halt. */
  startAlarm(): void {
    if (this._muted) return
    if (this._alarmIntervalId !== null) return // already running

    this._alarmGeneration++
    this._playAlarmBurst()
    this._alarmIntervalId = setInterval(() => {
      if (!this._muted) this._playAlarmBurst()
    }, 5000)
  }

  stopAlarm(): void {
    if (this._alarmIntervalId !== null) {
      clearInterval(this._alarmIntervalId)
      this._alarmIntervalId = null
    }
    this._alarmGeneration++
    // Silence any tones that were already scheduled into the future — clearing
    // the interval alone leaves the last burst (up to ~1.4s of audio) playing.
    const now = this._ctx ? this._ctx.currentTime : 0
    for (const { osc, gain } of this._alarmNodes) {
      try {
        gain.gain.cancelScheduledValues(now)
        gain.gain.setValueAtTime(0, now)
        osc.stop(now)
      } catch {
        // Node may have already ended
      }
    }
    this._alarmNodes = []
  }

  get isAlarmActive(): boolean {
    return this._alarmIntervalId !== null
  }

  // ------------------------------------------------------------------ vibration

  vibrate(pattern: number | number[] = [150, 80, 150]): void {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern)
      } catch {}
    }
  }

  vibrateEmergency(): void {
    this.vibrate([200, 100, 200, 100, 400])
  }
}

// Export the singleton
export const audioManager = AudioManager.getInstance()
export default AudioManager
