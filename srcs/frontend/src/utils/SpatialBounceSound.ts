/**
 * Spatial bounce sound using the Web Audio API.
 *
 * Features:
 *   - Stereo panning   (ball X position → left / right)
 *   - Distance volume   (ball Y position → near / far)
 *   - Pitch shifting    (ball radius → big = low, small = high)
 *
 * Backend coordinate system: x ∈ [0, 1000], y ∈ [0, 1000], default radius ≈ 10.
 */

const DEFAULT_RADIUS = 10

export class SpatialBounceSound {
  private ctx: AudioContext | null = null
  private buffer: AudioBuffer | null = null
  private loaded = false
  private loading = false

  /**
   * @param url – path to the .wav file served from `public/`
   */
  constructor(private readonly url: string = "/static/react_dist/Bounce1.wav") {}

  /* ------------------------------------------------------------------ */
  /*  Lazy-initialise AudioContext (must happen after a user gesture)    */
  /* ------------------------------------------------------------------ */
  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext()
    }
    // Resume if the browser suspended it (autoplay policy)
    if (this.ctx.state === "suspended") {
      this.ctx.resume()
    }
    return this.ctx
  }

  /* ------------------------------------------------------------------ */
  /*  Load the WAV file into an AudioBuffer                             */
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
      console.warn("[SpatialBounceSound] Failed to load sound:", e)
    } finally {
      this.loading = false
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Play a spatially-positioned bounce                                */
  /* ------------------------------------------------------------------ */
  /**
   * @param x      – ball X in backend coordinates  [0 … 1000]
   * @param y      – ball Y in backend coordinates  [0 … 1000]
   * @param radius – ball radius in backend units   (default ≈ 10)
   */
  play(x: number, y: number, radius: number = DEFAULT_RADIUS): void {
    if (!this.loaded || !this.buffer) return
    const ctx = this.ensureContext()

    // --- Source ---
    const source = ctx.createBufferSource()
    source.buffer = this.buffer

    // --- Pitch (playback rate) ---
    // Default radius ≈ 10 → rate 1.0
    // Bigger  ball (radius 20) → lower pitch  (rate ~0.7)
    // Smaller ball (radius  5) → higher pitch (rate ~1.4)
    const rate = Math.max(0.4, Math.min(2.0, DEFAULT_RADIUS / Math.max(1, radius)))
    source.playbackRate.value = rate

    // --- Stereo panning ---
    // x = 0   → pan -1 (full left)
    // x = 500 → pan  0 (centre)
    // x = 1000→ pan +1 (full right)
    const panner = ctx.createStereoPanner()
    panner.pan.value = Math.max(-1, Math.min(1, (x - 500) / 500))

    // --- Distance-based volume ---
    // y = 500 (centre) → full volume
    // y = 0 or 1000 (edges) → softer
    // Maps distance-from-centre to a gain of 0.4 … 1.0
    const normDist = Math.abs(y - 500) / 500         // 0 at centre, 1 at edge
    const gain = ctx.createGain()
    gain.gain.value = 1.0 - normDist * 0.6            // range [0.4 … 1.0]

    // --- Connect graph:  source → panner → gain → destination ---
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
