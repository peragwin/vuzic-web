import { hsluvToRgb } from 'hsluv'
import { Drivers } from './audio'

export class RenderParams {
  constructor(
    public valueScale: number,
    public valueOffset: number,
    public lightnessScale: number,
    public lightnessOffset: number,
    public warpScale: number,
    public warpOffset: number,
    public scaleScale: number,
    public scaleOffset: number,
    public period: number,
  ){ }
}

export class Renderer {
  private display: ImageData
  private warp: Float32Array
  private scale: Float32Array

  constructor(
    readonly columns: number,
    readonly rows: number,
    public params: RenderParams,
  ) {
    this.warp = new Float32Array(rows)
    this.scale = new Float32Array(columns)
    this.display = new ImageData(columns, rows)
  }

  public render(drivers: Drivers) {
    const display = this.display

    this.calculateWarp(drivers)
    this.calculateScale(drivers)

    this.updateDisplay(drivers)

    return display
  }

  private calculateWarp(drivers: Drivers) {
    for (let i = 0; i < this.rows; i++) {
      this.warp[i] = this.params.warpScale * drivers.diff[i] + this.params.warpOffset
    }
    for (let i = 1; i < this.rows-1; i++) {
      const wl = this.warp[i-1]
      const wr = this.warp[i+1]
      const w = this.warp[i]
      this.warp[i] = (wl + w + wr) / 3
    }
  }

  private calculateScale(drivers: Drivers) {
    for (let i = 0; i < this.columns; i++) {
      let s = 0
      const amp = drivers.getColumn(i)
      for (let j = 0; j < this.rows; j++) {
        s += drivers.scales[j] * (amp[j] - 1)
      }
      s /= this.rows
      this.scale[i] = s
    }
  }

  private getHSV(amp: number, ph: number, phi: number) {
    const vs = this.params.valueScale
    const vo = this.params.valueOffset
    const ss = this.params.lightnessScale
    const so = this.params.lightnessOffset

    let hue = (180 * (phi + ph) / Math.PI) % 360
    if (hue < 0) hue += 360

    const val = ss * sigmoid(vs * amp + vo) + so

    let [r, g, b] = hsluvToRgb([hue, 100, 100*val])
    r *= r
    g *= g
    b *= b

    return [r, g, b]
  }

  private updateDisplay(drivers: Drivers) {
    const ws = 2 * Math.PI / this.params.period

    for (let i = 0; i < this.columns; i++) {
      const amp = drivers.getColumn(i)
      const phi = ws * i
      let decay = i / this.columns
      decay = 1 - (decay*decay)
      
      for (let j = 0; j < this.rows; j++) {
        const val = drivers.scales[j] * (amp[j] - 1)
        const ph = drivers.energy[j]
        let [r, g, b] = this.getHSV(val, ph, phi)
        r *= decay
        g *= decay
        b *= decay

        let didx = i + this.columns * j
        didx *= 4
        this.display.data[didx]   = 255 * r
        this.display.data[didx+1] = 255 * g
        this.display.data[didx+2] = 255 * b
        this.display.data[didx+3] = 255
      }
    }
  }
}

function sigmoid(x: number) {
  return (1.0 + x / (1.0 + Math.abs(x))) / 2.0
}
