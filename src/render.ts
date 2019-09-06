import { hsluvToRgb } from 'hsluv'
import { Drivers } from './audio'

export class RenderParams {
  constructor(
    public valueScale: number,
    public valueOffset: number,
    public lightnessScale: number,
    public lightnessOffset: number,
    public alphaScale: number,
    public alphaOffset: number,
    public warpScale: number,
    public warpOffset: number,
    public scaleScale: number,
    public scaleOffset: number,
    public period: number,
    public colorCycle: number,
  ) { }
}

export enum RenderParamKey {
  valueScale,
  valueOffset,
  lightnessScale,
  lightnessOffset,
  alphaScale,
  alphaOffset,
  warpScale,
  warpOffset,
  scaleScale,
  scaleOffset,
  period,
  colorCycle,
  all,
}

export interface RenderParamUpdate {
  type: RenderParamKey,
  value: number | RenderParams,
}

export const renderParamReducer = (state: RenderParams, action: RenderParamUpdate) => {
  state = { ...state }
  switch (action.type) {
    case RenderParamKey.valueScale:
      state.valueScale = action.value as number
      break
    case RenderParamKey.valueOffset:
      state.valueOffset = action.value as number
      break
    case RenderParamKey.alphaScale:
      state.alphaScale = action.value as number
      break
    case RenderParamKey.alphaOffset:
      state.alphaOffset = action.value as number
      break
    case RenderParamKey.lightnessScale:
      state.lightnessScale = action.value as number
      break
    case RenderParamKey.lightnessOffset:
      state.lightnessOffset = action.value as number
      break
    case RenderParamKey.warpScale:
      state.warpScale = action.value as number
      break
    case RenderParamKey.warpOffset:
      state.warpOffset = action.value as number
      break
    case RenderParamKey.scaleScale:
      state.scaleScale = action.value as number
      break
    case RenderParamKey.scaleOffset:
      state.scaleOffset = action.value as number
      break
    case RenderParamKey.period:
      state.period = action.value as number
      break
    case RenderParamKey.colorCycle:
      state.colorCycle = action.value as number
      break
    case RenderParamKey.all:
      state = action.value as RenderParams
      break
  }
  return state
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

  public render(drivers: Drivers): [ImageData, Float32Array, Float32Array] {
    const display = this.display

    this.calculateWarp(drivers)
    this.calculateScale(drivers)

    this.updateDisplay(drivers)

    return [display, this.warp, this.scale]
  }

  private calculateWarp(drivers: Drivers) {
    for (let i = 0; i < this.rows; i++) {
      this.warp[i] = this.params.warpScale * drivers.diff[i] + this.params.warpOffset
    }
    for (let i = 1; i < this.rows - 1; i++) {
      const wl = this.warp[i - 1]
      const wr = this.warp[i + 1]
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
      const ss = 1 - (this.columns - i / 2) / this.columns
      this.scale[i] = this.params.scaleScale * ss * s + this.params.scaleOffset
    }
  }

  private getHSV(amp: number, ph: number, phi: number) {
    const vs = this.params.valueScale
    const vo = this.params.valueOffset
    const ss = this.params.lightnessScale
    const so = this.params.lightnessOffset
    const as = this.params.alphaScale
    const ao = this.params.alphaOffset

    let hue = (180 * (this.params.colorCycle * phi + ph) / Math.PI) % 360
    if (hue < 0) hue += 360

    const val = ss * sigmoid(vs * amp + vo) + so
    const alpha = sigmoid(as * amp + ao)

    let [r, g, b] = hsluvToRgb([hue, 100, 100 * val])
    r *= r
    g *= g
    b *= b

    return [r, g, b, alpha]
  }

  private updateDisplay(drivers: Drivers) {
    const ws = 2 * Math.PI / this.params.period

    for (let i = 0; i < this.columns; i++) {
      const amp = drivers.getColumn(i)
      const phi = ws * i
      let decay = i / this.columns
      decay = 1 - (decay * decay)

      for (let j = 0; j < this.rows; j++) {
        const val = drivers.scales[j] * (amp[j] - 1)
        const ph = drivers.energy[j]
        let [r, g, b, alpha] = this.getHSV(val, ph, phi)
        r *= decay
        g *= decay
        b *= decay

        let didx = i + this.columns * j
        didx *= 4
        this.display.data[didx] = 255 * r
        this.display.data[didx + 1] = 255 * g
        this.display.data[didx + 2] = 255 * b
        this.display.data[didx + 3] = 255 * alpha
      }
    }
  }

  public setRenderParams(params: RenderParams) {
    this.params = params
  }
}

function sigmoid(x: number) {
  return (1.0 + x / (1.0 + Math.abs(x))) / 2.0
}
