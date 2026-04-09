
const DEFAULT_RADIUS = 10

export class SpatialBounceSound {
  private ctx: AudioContext | null = null
  private buffer: AudioBuffer | null = null
  private loaded = false
  private loading = false

  constructor(private readonly url: string = "/react_dist/Bounce1.wav") {}

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext()
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume()
    }
    return this.ctx
  }

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

  play(x: number, y: number, radius: number = DEFAULT_RADIUS): void {
    if (!this.loaded || !this.buffer) return
    const ctx = this.ensureContext()

    const source = ctx.createBufferSource()
    source.buffer = this.buffer

    const rate = Math.max(0.4, Math.min(2.0, DEFAULT_RADIUS / Math.max(1, radius)))
    source.playbackRate.value = rate

    const panner = ctx.createStereoPanner()
    panner.pan.value = Math.max(-1, Math.min(1, (x - 500) / 500))

    const normDist = Math.abs(y - 500) / 500
    const gain = ctx.createGain()
    gain.gain.value = 1.0 - normDist * 0.6

    source.connect(panner)
    panner.connect(gain)
    gain.connect(ctx.destination)

    source.start()
  }

  dispose(): void {
    if (this.ctx) {
      this.ctx.close()
      this.ctx = null
    }
    this.buffer = null
    this.loaded = false
  }
}

