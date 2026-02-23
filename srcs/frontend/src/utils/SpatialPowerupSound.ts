/**
 * Spatial powerup-pickup sound using the Web Audio API.
 *
 * Features:
 *   - Stereo panning     (powerup X position → left / right)
 *   - Distance volume    (powerup Y position → near / far)
 *   - Per-type pitch     (each PowerupType gets a unique musical tone)
 *
 * Backend coordinate system: x ∈ [0, 1000], y ∈ [0, 1000].
 *
 * PowerupType enum (mirrors backend):
 *   0 = ADD_BALL
 *   1 = INCREASE_PADDLE_SPEED
 *   2 = DECREASE_PADDLE_SPEED
 *   3 = SUPER_SPEED
 *   4 = INCREASE_BALL_SIZE
 *   5 = DECREASE_BALL_SIZE
 *   6 = REVERSE_CONTROLS
 */

/** Playback-rate multipliers – each maps to a musically distinct pitch. */
const TYPE_RATES: Record<number, number> = {
  0: 1.0,   // ADD_BALL          – base pitch
  1: 1.25,  // INCREASE_PADDLE   – major third up
  2: 0.8,   // DECREASE_PADDLE   – minor third down
  3: 1.5,   // SUPER_SPEED       – fifth up  (bright / exciting)
  4: 0.67,  // INCREASE_BALL     – low rumble (big)
  5: 1.8,   // DECREASE_BALL     – high ping  (tiny)
  6: 0.55,  // REVERSE_CONTROLS  – ominous low tone
}

const DEFAULT_RATE = 1.0

export class SpatialPowerupSound {
  private ctx: AudioContext | null = null
  private buffer: AudioBuffer | null = null
  private loaded = false
  private loading = false

  constructor(private readonly url: string = "/static/react_dist/Pickup3.wav") {}

  /* ------------------------------------------------------------------ */
  /*  Lazy-initialise AudioContext                                       */
  /* ------------------------------------------------------------------ */
  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext()
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume()
    }
    return this.ctx
  }

  /* ------------------------------------------------------------------ */
  /*  Load the WAV into an AudioBuffer                                   */
  /* ------------------------------------------------------------------ */
  async load(): Promise<void> {
    if (this.loaded || this.loading) return
    this.loading = true
    try {
      const ctx = this.ensureContext()
      const response = await fetch(this.url)
      const arrayBuf = await response.arrayBuffer()
      this.buffer = await ctx.decodeAudioData(arrayBuf)
      this.loaded = true
    } catch (e) {
      console.warn("[SpatialPowerupSound] Failed to load sound:", e)
    } finally {
      this.loading = false
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Play a spatially-positioned pickup with per-type pitch             */
  /* ------------------------------------------------------------------ */
  /**
   * @param x           – powerup X in backend coords [0 … 1000]
   * @param y           – powerup Y in backend coords [0 … 1000]
   * @param powerupType – PowerupType enum value (0–6)
   */
  play(x: number, y: number, powerupType: number): void {
    if (!this.loaded || !this.buffer) return
    const ctx = this.ensureContext()

    // --- Source ---
    const source = ctx.createBufferSource()
    source.buffer = this.buffer

    // --- Per-type pitch ---
    source.playbackRate.value = TYPE_RATES[powerupType] ?? DEFAULT_RATE

    // --- Stereo panning based on X ---
    const panner = ctx.createStereoPanner()
    panner.pan.value = Math.max(-1, Math.min(1, (x - 500) / 500))

    // --- Distance-based volume based on Y ---
    const normDist = Math.abs(y - 500) / 500   // 0 at centre, 1 at edge
    const gain = ctx.createGain()
    gain.gain.value = 1.0 - normDist * 0.6      // range [0.4 … 1.0]

    // --- Connect:  source → panner → gain → output ---
    source.connect(panner)
    panner.connect(gain)
    gain.connect(ctx.destination)

    source.start()
  }

  /* ------------------------------------------------------------------ */
  /*  Cleanup                                                            */
  /* ------------------------------------------------------------------ */
  dispose(): void {
    if (this.ctx) {
      this.ctx.close()
      this.ctx = null
    }
    this.buffer = null
    this.loaded = false
  }
}
