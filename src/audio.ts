import FFT from "fft.js";

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
    const ctx = new AudioContext()
    this.ctx = ctx

    const analyzer = ctx.createAnalyser()
    this.analyzer = analyzer
    analyzer.fftSize = this.blockSize
    analyzer.smoothingTimeConstant = 0

    const bucketer = new Bucketer(this.size, this.buckets, 32, 12000)
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
}

class WindowBuffer {
  private buffer: Float32Array
  private index = 0

  constructor(
    readonly capacity: number,
  ) {
    this.buffer = new Float32Array(capacity).fill(0)
  }

  public push(x: Float32Array) {
    if (x.length > this.buffer.length) throw new Error("cannot push size greater than capacity")

    let wrap = false
    let en = this.index + x.length
    if (en > this.buffer.length) {
      en = this.buffer.length
      wrap = true
    }

    for (let i = this.index; i < en; i++) {
      this.buffer[i] = x[i - this.index]
    }
    if (wrap) {
      const os = this.buffer.length - this.index
      for (let i = 0; i < x.length - os; i++) {
        this.buffer[i] = x[i + os]
      }
    }

    this.index = (this.index + x.length) % this.capacity
  }

  public get(size: number) {
    if (size > this.capacity) throw new Error("cannot get size greater than capacity")

    const out = new Float32Array(size).fill(0)

    let wrap = false
    let st = this.index - size
    let en = this.index
    if (st < 0) {
      st = this.capacity + st
      en = this.capacity
      wrap = true
    }

    for (let i = st; i < en; i++) {
      out[i - st] = this.buffer[i]
    }
    if (wrap) {
      const os = en - st
      for (let i = 0; i < this.index; i++) {
        out[i + os] = this.buffer[i]
      }
    }

    return out
  }
}

function blackmanHarris(i: number, N: number) {
  const a0 = 0.35875,
    a1 = 0.48829,
    a2 = 0.14128,
    a3 = 0.01168,
    f = 6.283185307179586 * i / (N - 1)

  return a0 - a1 * Math.cos(f) + a2 * Math.cos(2 * f) - a3 * Math.cos(3 * f)
}

class SlidingFFT {
  private buffer: WindowBuffer
  private fft: FFT
  private window: Float32Array

  private lastTime = 0

  constructor(
    readonly frameSize: number,
    readonly fftSize: number,
  ) {
    this.buffer = new WindowBuffer(fftSize)
    this.fft = new FFT(fftSize)
    this.window = new Float32Array(fftSize).fill(0)
    for (let i = 0; i < fftSize; i++) {
      this.window[i] = blackmanHarris(i, fftSize)
    }
  }

  public process(input: Float32Array) {
    // const ts = e.timeStamp
    // console.log("fps:", 1000 / (ts - this.lastTime), ts)
    // this.lastTime = ts

    // const input = e.inputBuffer.getChannelData(0)
    this.buffer.push(input)

    const frame = this.buffer.get(this.fftSize)
    for (let i = 0; i < this.fftSize; i++) {
      frame[i] *= this.window[i]
    }

    const out = this.fft.createComplexArray() //new Float32Array(this.fftSize/2).fill(0)
    this.fft.realTransform(out, frame)

    // const output = e.outputBuffer.getChannelData(0)
    const output = new Float32Array(this.fftSize)
    for (let i = 0; i < this.fftSize * 2; i += 2) {
      const v = Math.sqrt(out[i] * out[i] + out[i + 1] * out[i + 1])
      output[i / 2] = Math.log2(1 + v)
    }

    return output
  }
}

class Bucketer {
  private indices: Array<number>

  constructor(
    readonly inputSize: number,
    readonly buckets: number,
    readonly fMin: number,
    readonly fMax: number,
  ) {
    const sMin = this.toLogScale(fMin)
    const sMax = this.toLogScale(fMax)
    const space = (sMax - sMin) / buckets
    const indices = new Array<number>(buckets - 1)

    let lastIdx = 0
    let offset = 1
    const offsetDelta = (sMax - sMin) / inputSize

    for (let i = 0; i < indices.length; i++) {
      const adjSpace = space - offsetDelta * offset / buckets

      const v = this.fromLogScale((i + 1) * adjSpace + sMin + offsetDelta * offset)
      let idx = Math.ceil(inputSize * v / fMax)

      if (idx <= lastIdx) {
        idx = lastIdx + 1
        offset++
      }
      if (idx >= inputSize) {
        idx = inputSize - 1
      }

      indices[i] = idx
      lastIdx = idx
    }

    this.indices = indices
  }

  private toLogScale(x: number) {
    return Math.log2(1 + x)
  }

  private fromLogScale(x: number) {
    return 2 ** (x) + 1
  }

  public bucket(input: Float32Array) {
    // const input = e.inputBuffer.getChannelData(0)
    // const output = e.outputBuffer.getChannelData(0)
    const output = new Float32Array(this.buckets)

    for (let i = 0; i < this.buckets; i++) {
      let start = (i === 0) ? 0 : this.indices[i - 1]
      let stop = (i === this.buckets - 1) ? input.length : this.indices[i]

      let sum = 0
      for (let j = start; j < stop; j++) {
        sum += input[j]
      }

      output[i] = sum / (stop - start)
    }

    return output
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
    public gainFilterParams: Float32Array,
    public gainFeedbackParams: Float32Array,
    public diffFilterParams: Float32Array,
    public diffFeedbackParams: Float32Array,
    public scaleFilterParams: Float32Array,
    public diffGain: number,
    public ampScale: number,
    public ampOffset: number,
    public sync: number,
  ) { }
}

class Filter {
  public values: Float32Array

  constructor(
    readonly size: number,
    public params: Float32Array,
  ) {
    this.values = new Float32Array(size).fill(0)
  }

  public process(x: Float32Array) {
    for (let i = 0; i < this.size; i++) {
      this.values[i] = this.params[0] * x[i] + this.params[1] * this.values[i]
    }
    return this.values
  }
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
    this.filter = new Filter(size, new Float32Array([0.005, 0.995]))
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
  private scaleFilter: Filter

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
    this.scaleFilter = new Filter(size, params.scaleFilterParams)
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

    const decay = 1 - (.5 / this.length)
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

      diff[i] = this.diffFilter.values[i] + this.diffFeedback.values[i]

      let ph = energy[i] + .001
      ph -= dg * Math.abs(diff[i])
      energy[i] = ph
    }
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
        energy[i] = 2 * Math.PI + (energy[i] % 2 * Math.PI)
      }
      mean = 2 * Math.PI + (mean % 2 * Math.PI)
    }
    if (mean > 2 * Math.PI) {
      for (let i = 0; i < this.size; i++) {
        if (energy[i] <= 2 * Math.PI) return;
      }
      for (let i = 0; i < this.size; i++) {
        energy[i] = (energy[i] % 2 * Math.PI)
      }
      mean = (mean % 2 * Math.PI)
    }
  }

  private applyValueScaling() {
    for (let i = 0; i < this.size; i++) {
      const x = this.drivers.getColumn(0)
      let vsh = this.scaleFilter.values[i]
      let vs = this.drivers.scales[i]

      let sval = vs * (x[i] - 1)
      if (sval < 0) sval = -sval

      const params = this.scaleFilter.params
      if (sval < vsh) {
        vsh = params[0] * sval + params[1] * vsh
      } else {
        vsh = params[2] * sval + params[3] * vsh
      }

      if (vsh < .001) vsh = .001
      vs = 1 / vsh

      this.scaleFilter.values[i] = vsh
      this.drivers.scales[i] = vs
    }
  }

  public getDrivers() {
    return this.drivers
  }
}
