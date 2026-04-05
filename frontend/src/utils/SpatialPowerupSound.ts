
const TYPE_RATES: Record<number, number> = {
  0: 1.0,
  1: 1.25,
  2: 0.8,
  3: 1.5,
  4: 0.67,
  5: 1.8,
  6: 0.55,
}

const DEFAULT_RATE = 1.0

export class SpatialPowerupSound {
  private ctx: AudioContext | null = null
  private buffer: AudioBuffer | null = null
  private loaded = false
  private loading = false

  constructor(private readonly url: string = "/static/react_dist/Pickup3.wav") {}

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
      console.warn("[SpatialPowerupSound] Failed to load sound:", e)
    } finally {
      this.loading = false
    }
  }

  play(x: number, y: number, powerupType: number): void {
    if (!this.loaded || !this.buffer) return
    const ctx = this.ensureContext()

    const source = ctx.createBufferSource()
    source.buffer = this.buffer

    source.playbackRate.value = TYPE_RATES[powerupType] ?? DEFAULT_RATE

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

