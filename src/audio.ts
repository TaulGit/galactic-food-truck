export type KitchenSound =
  | 'open'
  | 'close'
  | 'ingredient'
  | 'remove'
  | 'lid'
  | 'switch'
  | 'cook'
  | 'serve'
  | 'ready'
  | 'correct'
  | 'wrong'
  | 'restart'
  | 'toggle'
  | 'error'

const backgroundTracks = [
  './assets/audio/stardust-kitchen-1.mp3',
  './assets/audio/stardust-kitchen-2.mp3',
] as const

const soundSettings: Record<
  KitchenSound,
  { readonly frequency: number; readonly duration: number; readonly type: OscillatorType }
> = {
  open: { frequency: 680, duration: 0.07, type: 'sine' },
  close: { frequency: 430, duration: 0.07, type: 'sine' },
  ingredient: { frequency: 540, duration: 0.06, type: 'sine' },
  remove: { frequency: 340, duration: 0.08, type: 'triangle' },
  lid: { frequency: 310, duration: 0.14, type: 'triangle' },
  switch: { frequency: 520, duration: 0.14, type: 'square' },
  cook: { frequency: 230, duration: 0.18, type: 'triangle' },
  serve: { frequency: 610, duration: 0.1, type: 'square' },
  ready: { frequency: 730, duration: 0.22, type: 'sine' },
  correct: { frequency: 880, duration: 0.18, type: 'triangle' },
  wrong: { frequency: 155, duration: 0.2, type: 'sawtooth' },
  restart: { frequency: 260, duration: 0.16, type: 'triangle' },
  toggle: { frequency: 760, duration: 0.08, type: 'sine' },
  error: { frequency: 180, duration: 0.12, type: 'sawtooth' },
}

/** Synthesized feedback sounds plus the game's rotating background music. */
export class KitchenAudio {
  private context: AudioContext | null = null
  private readonly backgroundMusic = backgroundTracks.map((source) => {
    const track = new Audio(source)
    track.preload = 'auto'
    track.volume = 0.14
    track.addEventListener('ended', () => this.playNextTrack())
    track.addEventListener('error', () => {
      if (this.playingTrack === track) this.playNextTrack()
    })
    return track
  })
  private backgroundTrackIndex = 0
  private backgroundMusicPlaying = false
  private playingTrack: HTMLAudioElement | null = null
  private muted = false

  get isMuted(): boolean {
    return this.muted
  }

  toggleMuted(): boolean {
    this.muted = !this.muted
    if (this.muted) {
      this.stopBackgroundMusic()
    } else {
      this.startBackgroundMusic()
    }
    return this.muted
  }

  /** Start after a user gesture so browser autoplay policies do not block it. */
  startBackgroundMusic(): void {
    if (this.muted || this.backgroundMusicPlaying) return

    const track = this.backgroundMusic[this.backgroundTrackIndex]
    if (!track) return

    this.backgroundMusicPlaying = true
    this.playingTrack = track
    void track.play().catch(() => {
      if (this.playingTrack === track) {
        this.backgroundMusicPlaying = false
        this.playingTrack = null
      }
    })
  }

  play(sound: KitchenSound): void {
    if (this.muted) return

    try {
      const AudioContextConstructor = window.AudioContext
      if (!AudioContextConstructor) return
      this.context ??= new AudioContextConstructor()
      if (this.context.state === 'suspended') void this.context.resume()
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

  private stopBackgroundMusic(): void {
    for (const track of this.backgroundMusic) {
      track.pause()
    }
    this.backgroundMusicPlaying = false
    this.playingTrack = null
  }

  private playNextTrack(): void {
    this.backgroundMusicPlaying = false
    this.playingTrack = null
    if (this.muted) return

    this.backgroundTrackIndex = (this.backgroundTrackIndex + 1) % this.backgroundMusic.length
    this.startBackgroundMusic()
  }
}
