export type KitchenSound = 'ingredient' | 'cook' | 'ready' | 'correct' | 'wrong'

const soundSettings: Record<
  KitchenSound,
  { readonly frequency: number; readonly duration: number; readonly type: OscillatorType }
> = {
  ingredient: { frequency: 540, duration: 0.06, type: 'sine' },
  cook: { frequency: 230, duration: 0.18, type: 'triangle' },
  ready: { frequency: 730, duration: 0.22, type: 'sine' },
  correct: { frequency: 880, duration: 0.18, type: 'triangle' },
  wrong: { frequency: 155, duration: 0.2, type: 'sawtooth' },
}

/** Tiny synthesized feedback sounds; no external audio assets are required. */
export class KitchenAudio {
  private context: AudioContext | null = null
  private muted = false

  get isMuted(): boolean {
    return this.muted
  }

  toggleMuted(): boolean {
    this.muted = !this.muted
    return this.muted
  }

  play(sound: KitchenSound): void {
    if (this.muted) return

    try {
      const AudioContextConstructor = window.AudioContext
      if (!AudioContextConstructor) return
      this.context ??= new AudioContextConstructor()
      const { frequency, duration, type } = soundSettings[sound]
      const oscillator = this.context.createOscillator()
      const gain = this.context.createGain()
      const now = this.context.currentTime

      oscillator.type = type
      oscillator.frequency.setValueAtTime(frequency, now)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.07, now + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
      oscillator.connect(gain)
      gain.connect(this.context.destination)
      oscillator.start(now)
      oscillator.stop(now + duration + 0.02)
    } catch {
      // Audio is optional feedback. Some preview environments intentionally
      // omit audio support, so gameplay must never depend on it.
    }
  }
}
