import { Bucketer } from './bucketer'
import { SlidingFFT } from './sfft'
import { number } from 'prop-types';
export class AudioProcessor {
  private ctx: AudioContext;
  private fs: FrequencyProcessor
  private analyzer: AnalyserNode
  private fft: SlidingFFT
  private bucketer: Bucketer

  constructor(
    readonly size: number,
    readonly blockSize: number,
    readonly buckets: number,
    readonly length: number,
    public params: AudioProcessorParams,
  ) {
    let audioContext
    try {
      audioContext = AudioContext
    } catch (_) {
      // @ts-ignore
      audioContext = window.AudioContext || window.webkitAudioContext;
    }
    const ctx = new audioContext()
    this.ctx = ctx

    const analyzer = ctx.createAnalyser()
    this.analyzer = analyzer
    analyzer.fftSize = this.blockSize
    analyzer.smoothingTimeConstant = 0

    const bucketer = new Bucketer(this.size/2, this.buckets, 32, 12000)
    this.bucketer = bucketer

    const fft = new SlidingFFT(this.blockSize, this.size)
    this.fft = fft

    const processor = new FrequencyProcessor(this.buckets, this.length, this.params)
    this.fs = processor

    // try {
    navigator.mediaDevices.getUserMedia({
      audio: true,
    }).then(
      this.handleMediaStream.bind(this),
      err => {
        console.log(err)
      })
    // } catch (e) {
    //   navigator.getUserMedia({ audio: true },
    //     this.handleMediaStream.bind(this),
    //     err => {
    //       console.log(err)
    //     })
    // }
  }

  handleMediaStream(stream: MediaStream) {
    console.log("media stream!", stream)

    const ctx = this.ctx
    const source = ctx.createMediaStreamSource(stream)

    this.analyzer = ctx.createAnalyser()
    this.analyzer.fftSize = this.blockSize
    this.analyzer.smoothingTimeConstant = 0
    source.connect(this.analyzer)

    setInterval(this.process.bind(this), 1000 * this.blockSize / 44100)
    // const ffter = new SlidingFFT(this.blockSize, this.size)
    // const fft = ctx.createScriptProcessor(this.blockSize, 1, 1)
    // fft.onaudioprocess = ffter.process.bind(ffter)
    // source.connect(fft)


    // // fft.connect(analyzer)

    // const bucketer = new Bucketer(this.size, this.buckets, 32, 12000)
    // const bucket = ctx.createScriptProcessor(this.size, 1, 1)
    // bucket.onaudioprocess = bucketer.bucket.bind(bucketer)
    // fft.connect(bucket)

    // const proc = ctx.createScriptProcessor(Math.max(this.buckets, 256), 1, 1)
    // proc.onaudioprocess = this.fs.process.bind(this.fs)
    // bucket.connect(proc)

    // proc.connect(dest)
  }

  public process() {
    const frame = new Float32Array(this.blockSize) //this.analyzer.frequencyBinCount)
    this.analyzer.getFloatTimeDomainData(frame)
    // this.analyzer.getFloatFrequencyData(frame)

    // console.log(frame)
    // for (let i = 0; i < frame.length; i++) {
    //   if (!isFinite(frame[i]) || isNaN(frame[i])) return this.getDrivers()
    //   frame[i] = Math.log2(1 + Math.abs(frame[i]))
    // }
    // console.log(frame)

    const fft = this.fft.process(frame)

    const bucketed = this.bucketer.bucket(fft) // frame

    return this.fs.process(bucketed)
    // return this.getDrivers()
  }

  public getDrivers() {
    return this.fs.getDrivers()
  }

  public setAudioParams(params: AudioProcessorParams) {
    this.params = params
    this.fs.setParams(params)
  }
}

export class Drivers {
  private columnIdx = 0

  constructor(
    readonly amp: Array<Float32Array>,
    readonly scales: Float32Array,
    readonly energy: Float32Array,
    readonly diff: Float32Array,
  ) { }

  public incrementColumnIdx() {
    this.columnIdx++
    this.columnIdx %= this.amp.length
  }

  public getColumn(column: number) {
    column %= this.amp.length
    column = this.columnIdx - column
    if (column < 0) column += this.amp.length
    return this.amp[column]
  }
}

export class AudioProcessorParams {
  constructor(
    public preemphasis: number,
    public gainFilterParams: FilterParams,
    public gainFeedbackParams: FilterParams,
    public diffFilterParams: FilterParams,
    public diffFeedbackParams: FilterParams,
    public posScaleFilterParams: FilterParams,
    public negScaleFilterParams: FilterParams,
    public diffGain: number,
    public ampScale: number,
    public ampOffset: number,
    public sync: number,
    public decay: number,
  ) { }
}

export enum AudioParamKey {
  preemphasis,
  gainFilterParams,
  gainFeedbackParams,
  diffFilterParams,
  diffFeedbackParams,
  posScaleFilterParams,
  negScaleFilterParams,
  diffGain,
  ampScale,
  ampOffset,
  sync,
  decay,
  all,
}

export interface AudioParamUpdate {
  type: AudioParamKey,
  value: number | FilterParams | AudioProcessorParams,
}

export const audioParamReducer = (state: AudioProcessorParams, action: AudioParamUpdate) => {
  state = {...state}
  let fp
  switch (action.type) {
    case AudioParamKey.preemphasis:
      state.preemphasis = action.value as number
      break
    case AudioParamKey.gainFilterParams:
      state.gainFilterParams = action.value as FilterParams
      break
    case AudioParamKey.gainFeedbackParams:
      state.gainFeedbackParams = action.value as FilterParams
      break
    case AudioParamKey.diffFilterParams:
      state.diffFilterParams = action.value as FilterParams
      break
    case AudioParamKey.diffFeedbackParams:
      state.diffFeedbackParams = action.value as FilterParams
      break
    case AudioParamKey.posScaleFilterParams:
      state.posScaleFilterParams = action.value as FilterParams
      break
    case AudioParamKey.negScaleFilterParams:
      state.negScaleFilterParams = action.value as FilterParams
      break
    case AudioParamKey.diffGain:
      state.diffGain = action.value as number
      break
    case AudioParamKey.ampScale:
      state.ampScale = action.value as number
      break
    case AudioParamKey.ampOffset:
      state.ampOffset = action.value as number
      break
    case AudioParamKey.sync:
      state.sync = action.value as number
      break
  case AudioParamKey.decay:
      state.decay = action.value as number
      break
    case AudioParamKey.all:
      state = action.value as AudioProcessorParams
      break
  }
  return state
}

class Filter {
  public values: Float32Array
  private _params: Float32Array

  constructor(
    readonly size: number,
    public params: FilterParams,
  ) {
    this.values = new Float32Array(size).fill(0)
    this._params = fromFilterParams(params)
    // console.log(this._params)
  }

  public process(x: Float32Array) {
    for (let i = 0; i < this.size; i++) {
      this.values[i] = this._params[0] * x[i] + this._params[1] * this.values[i]
    }
    return this.values
  }

  public setParams(fp: FilterParams) {
    this._params = fromFilterParams(fp)
    // console.log(this._params)
  }
}

class BiasedFilter {
  public values: Float32Array
  private _params: Float32Array

  constructor(
    readonly size: number,
    public posfp: FilterParams,
    public negfp: FilterParams,
  ){
    this.values = new Float32Array(size).fill(0)
    const posp = fromFilterParams(posfp)
    const negp = fromFilterParams(negfp)
    this._params = new Float32Array([posp[0], posp[1], negp[0], negp[1]])
    // console.log(this._params)
  }

  public process(x: Float32Array) {
    for (let i = 0; i < this.size; i++) {
      if (x[i] <= this.values[i]) {
        this.values[i] = this._params[0] * x[i] + this._params[1] * this.values[i]
      } else {
        this.values[i] = this._params[2] * x[i] + this._params[3] * this.values[i]
      }
    }
    return this.values
  }

  public setParams(posfp: FilterParams, negfp: FilterParams) {
    const posp = fromFilterParams(posfp)
    const negp = fromFilterParams(negfp)
    this._params = new Float32Array([posp[0], posp[1], negp[0], negp[1]])
    // console.log(this._params)
  }
}


export interface FilterParams {
  tao: number,
  gain: number,
}

export const toFilterParams = (fp: Float32Array) => {
  return {
    tao: tao(fp),
    gain: gain(fp),
  } as FilterParams
}

// .5 = b ^ n -> n = -ln(2)/ln(b)
const tao = (fp: Float32Array) => {
  const g = gain(fp)
  if (g === 0) return 0

  const b = fp[1] / g
  if (b === 0) return 0

  return -Math.log(2) / Math.log(b)
}
const gain = (fp: Float32Array) => Math.abs(fp[0]) + Math.abs(fp[1])

export const fromFilterParams = (fp: FilterParams) => {
  if (fp.tao === 0) return new Float32Array([1, 0])

  // .5 = b ^ t -> ln(b) = -ln(2)/t -> b ?????????? fuck i really suck at math now
  // b = .5 * 2 ^ ((t-1)/t)
  let b = .5 * Math.pow(2, (fp.tao-1)/fp.tao)
  let a = 1 - b
  a *= fp.gain
  b *= fp.gain
  return new Float32Array([a, b])
}

function logError(x: number) {
  x = 1.000001 - x;
  const sign = (x < 0) ? 1.0 : -1.0;
  const a = (x < 0) ? -x : x;
  return sign * Math.log2(a);
}

class GainController {
  private filter: Filter
  private gain: Float32Array
  private err: Float32Array

  constructor(
    readonly size: number,
    public kp = 0.001,
    public kd = 0.005,
  ) {
    this.filter = new Filter(size, {tao: 138, gain: 1})
    this.gain = new Float32Array(size).fill(0)
    for (let i = 0; i < this.size; i++) {
      this.gain[i] = 1
    }
    this.err = new Float32Array(size).fill(0)
  }

  public process(x: Float32Array) {
    for (let i = 0; i < this.size; i++) {
      x[i] *= this.gain[i]
    }

    const filtered = this.filter.process(x)

    const e = new Float32Array(this.size)
    for (let i = 0; i < this.size; i++) {
      e[i] = logError(1 - filtered[i]);
    }

    // apply pd controller
    let u;
    const kp = this.kp;
    const kd = this.kd;
    for (let i = 0; i < this.size; i++) {
      let gain = this.gain[i];
      const err = this.err[i];
      u = kp * e[i] + kd * (e[i] - err);
      gain += u;
      if (gain > 1e8) gain = 1e8;
      if (gain < 1e-8) gain = 1e-8;
      this.gain[i] = gain;
      this.err[i] = e[i];
    }
  }
}

class FrequencyProcessor {
  private drivers: Drivers
  private gainController: GainController

  private gainFilter: Filter
  private gainFeedback: Filter
  private diffFilter: Filter
  private diffFeedback: Filter
  private scaleFilter: BiasedFilter

  private lastTime = 0

  constructor(
    readonly size: number,
    readonly length: number,
    public params: AudioProcessorParams,
  ) {
    const amp = new Array<Float32Array>(length)
    for (let i = 0; i < amp.length; i++) {
      amp[i] = new Float32Array(size).fill(0)
    }
    const scales = new Float32Array(size).fill(0)
    const energy = new Float32Array(size).fill(0)
    const diff = new Float32Array(size).fill(0)
    const drivers = new Drivers(amp, scales, energy, diff)

    this.drivers = drivers

    this.gainController = new GainController(size)

    this.gainFilter = new Filter(size, params.gainFilterParams)
    this.gainFeedback = new Filter(size, params.gainFeedbackParams)
    this.diffFilter = new Filter(size, params.diffFilterParams)
    this.diffFeedback = new Filter(size, params.diffFeedbackParams)
    this.scaleFilter = new BiasedFilter(size, params.posScaleFilterParams, params.negScaleFilterParams)
  }

  public process(input: Float32Array) {
    // const input = e.inputBuffer.getChannelData(0)

    // const ts = e.timeStamp
    // console.log("fps:", 1000 / (ts - this.lastTime))
    // this.lastTime = ts

    this.applyPreemphasis(input)
    this.applyGainControl(input)
    this.applyFilters(input)
    this.applyEffects()
    this.applySync()
    this.applyValueScaling()

    return this.drivers
  }

  private applyPreemphasis(x: Float32Array) {
    const incr = (this.params.preemphasis - 1) / this.size
    for (let i = 0; i < this.size; i++) {
      x[i] *= 1 + i * incr
    }
  }

  private applyGainControl(x: Float32Array) {
    this.gainController.process(x)
  }

  private applyFilters(x: Float32Array) {
    const diffInput = new Float32Array(this.gainFilter.values)

    const gvalues = this.gainFilter.process(x)
    this.gainFeedback.process(x)

    for (let i = 0; i < this.size; i++) {
      diffInput[i] = gvalues[i] - diffInput[i]
    }

    this.diffFilter.process(diffInput)
    this.diffFeedback.process(diffInput)
  }

  private applyEffects() {
    const dg = this.params.diffGain
    const ag = this.params.ampScale
    const ao = this.params.ampOffset

    const decay = 1 - (this.params.decay / this.length)
    for (let i = 0; i < this.length; i++) {
      for (let j = 0; j < this.size; j++) {
        this.drivers.amp[i][j] *= decay
      }
    }

    this.drivers.incrementColumnIdx()
    const amp = this.drivers.getColumn(0)
    const diff = this.drivers.diff
    const energy = this.drivers.energy

    for (let i = 0; i < this.size; i++) {
      amp[i] = this.gainFilter.values[i] + this.gainFeedback.values[i]
      amp[i] = ao + ag * amp[i]

      diff[i] = dg * (this.diffFilter.values[i] + this.diffFeedback.values[i])

      let ph = energy[i] + .001
      ph -= diff[i] //Math.abs(diff[i])
      energy[i] = ph
    }
    console.log(energy)
  }

  private applySync() {
    const energy = this.drivers.energy

    let mean = 0
    for (let i = 0; i < this.size; i++) {
      mean += energy[i]
    }
    mean /= this.size

    let diff, sign
    for (let i = 0; i < this.size; i++) {
      if (i !== 0) {
        diff = energy[i - 1] - energy[i]
        sign = (diff < 0) ? -1 : 1
        diff = sign * diff * diff
        energy[i] += this.params.sync * diff
      }
      if (i !== this.size - 1) {
        diff = energy[i + 1] - energy[i]
        sign = (diff < 0) ? -1.0 : 1.0
        diff = sign * diff * diff
        energy[i] += this.params.sync * diff
      }
      diff = mean - energy[i]
      sign = (diff < 0) ? -1.0 : 1.0
      diff = sign * diff * diff
      energy[i] += this.params.sync * diff
    }

    mean = 0
    for (let i = 0; i < this.size; i++) {
      mean += energy[i]
    }
    mean /= this.size

    if (mean < -2 * Math.PI) {
      // wait until all elements go past the mark so theres no sign flips
      for (let i = 0; i < this.size; i++) {
        if (energy[i] >= -2 * Math.PI) return
      }
      for (let i = 0; i < this.size; i++) {
        energy[i] = 2 * Math.PI + energy[i] // (energy[i] % 2 * Math.PI)
      }
      mean = 2 * Math.PI + mean //(mean % 2 * Math.PI)
    }
    if (mean > 2 * Math.PI) {
      for (let i = 0; i < this.size; i++) {
        if (energy[i] <= 2 * Math.PI) return;
      }
      for (let i = 0; i < this.size; i++) {
        energy[i] -= 2*Math.PI //(energy[i] % 2 * Math.PI)
      }
      mean -= 2*Math.PI //(mean % 2 * Math.PI)
    }
  }

  private applyValueScaling() {
    const x = this.drivers.getColumn(0)
    const sval = new Float32Array(this.size)

    for (let i = 0; i < this.size; i++) {
      const vs = this.drivers.scales[i]
      const sv = vs * (x[i] - 1)
      sval[i] = Math.abs(sv)
    }

    this.scaleFilter.process(sval)

    for (let  i = 0; i < this.size; i++) {
      let vsh = this.scaleFilter.values[i]
      if (vsh < .001) vsh = .001
      const vs = 1 / vsh
      this.scaleFilter.values[i] = vsh
      this.drivers.scales[i] = vs
    }
  }

  public getDrivers() {
    return this.drivers
  }

  public setParams(params: AudioProcessorParams) {
    this.gainFilter.setParams(params.gainFilterParams)
    this.gainFeedback.setParams(params.gainFeedbackParams)
    this.diffFilter.setParams(params.diffFilterParams)
    this.diffFeedback.setParams(params.diffFeedbackParams)
    this.scaleFilter.setParams(params.posScaleFilterParams, params.negScaleFilterParams)
    this.params = params
  }
}
