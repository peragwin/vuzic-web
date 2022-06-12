import { Bucketer } from "./bucketer";
import { SlidingFFT } from "./sfft";
import { polyfill } from "./getFloatTimeDomainData";

interface AudioSize {
  buckets: number;
  length: number;
}

export class AudioProcessor {
  private fs: FrequencyProcessor;
  private analyzer?: AnalyserNode;
  private fft: SlidingFFT;
  private bucketer: Bucketer;
  private processHandle?: number;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private frame: Float32Array;
  private freqBins: Float32Array;
  private audioSize: AudioSize;

  constructor(
    readonly size: number,
    readonly blockSize: number,
    buckets: number,
    length: number,
    private params: AudioProcessorParams
  ) {
    polyfill();

    this.audioSize = { length, buckets };

    const bucketer = new Bucketer(this.size / 2, this.buckets, 32, 16000);
    this.bucketer = bucketer;

    const fft = new SlidingFFT(this.blockSize, this.size);
    this.fft = fft;

    const processor = new FrequencyProcessor(this.audioSize, params);
    this.fs = processor;

    this.frame = new Float32Array(this.blockSize / 2);
    this.freqBins = new Float32Array(this.buckets);
  }

  public resize(buckets: number) {
    if (buckets === this.buckets) return;
    const wasRunning = !!this.processHandle;
    if (wasRunning) {
      window.clearInterval(this.processHandle);
    }

    this.audioSize.buckets = buckets;
    this.bucketer = new Bucketer(this.size / 2, this.buckets, 32, 16000);
    this.fs = new FrequencyProcessor(this.audioSize, this.params);
    this.freqBins = new Float32Array(this.buckets);

    if (wasRunning) {
      this.processHandle = window.setInterval(
        this.process.bind(this),
        (1000 * this.blockSize) / 44100
      );
    }
  }

  public get buckets() {
    return this.audioSize.buckets;
  }

  public get length() {
    return this.audioSize.length;
  }

  public start(cb: (ready: boolean) => void) {
    const success = (stream: MediaStream) => {
      this.handleMediaStream(stream);
      cb(true);
    };
    const err = (err: any) => {
      console.error(err);
      cb(false);
    };
    try {
      if (
        "mediaDevices" in navigator &&
        "getUserMedia" in navigator.mediaDevices
      ) {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(success, err);
      }
      // else if ("getUserMedia" in navigator) {
      //   // eslint-disable-next-line
      //   navigator.getUserMedia({ audio: true }, success, err);
      // }
    } catch (e) {
      console.error(e);
    }
  }

  handleMediaStream(stream: MediaStream) {
    let audioContext;
    try {
      audioContext = AudioContext;
    } catch (_) {
      // @ts-ignore
      audioContext = window.AudioContext || window.webkitAudioContext;
    }

    const ctx = new audioContext({ latencyHint: "interactive" });
    console.log(`audio context latency: ${ctx.baseLatency} ms`);
    this.context = ctx;
    const source = ctx.createMediaStreamSource(stream);
    this.source = source;

    this.analyzer = ctx.createAnalyser();
    if (!this.analyzer) throw new Error("could not create analyser node");

    this.analyzer.fftSize = this.blockSize;
    this.analyzer.smoothingTimeConstant = 0;
    // this.analyzer.fftSize = this.size;
    // this.frame = new Float32Array(this.analyzer.frequencyBinCount);

    source.connect(this.analyzer);

    this.processHandle = window.setInterval(
      this.process.bind(this),
      (1000 * this.blockSize) / 44100
    );
  }

  public stop() {
    console.log("STOP AUDIO");
    if (this.processHandle) {
      clearInterval(this.processHandle);
    }
    if (this.source) {
      this.source.mediaStream.getTracks().forEach((t) => t.stop());
    }
    if (this.context) {
      this.context.close();
    }
  }

  public process() {
    if (!this.analyzer) return;

    this.analyzer.getFloatTimeDomainData(this.frame);

    // this returns -Infinity if the input is silent.. well that's complete 🗑
    // this.analyzer.getFloatFrequencyData(this.frame!);

    const fft = this.fft.process(this.frame);
    const bucketed = this.bucketer.bucket(fft, this.freqBins);

    // const bucketed = this.bucketer.bucket(this.frame!, this.freqBins!);

    return this.fs.process(bucketed);
  }

  public getDrivers() {
    return this.fs.getDrivers();
  }

  public setAudioParams(params: AudioProcessorParams) {
    if (params.decimation !== this.params.decimation) {
      this.audioSize.length = Math.floor(this.length * params.decimation);
      this.fs = new FrequencyProcessor(this.audioSize, params);
    } else {
      this.fs.setParams(params);
    }
    this.params = params;
  }
}

export class Drivers {
  private columnIdx = 0;
  readonly rows: number;
  readonly columns: number;

  constructor(
    readonly amp: Array<Float32Array>,
    readonly scales: Float32Array,
    readonly energy: Float32Array,
    readonly diff: Float32Array,
    // this is the average of the amp for each column when it is scaled by scales
    readonly mean: Float32Array
  ) {
    this.columns = amp.length;
    this.rows = amp[0].length;
  }

  public incrementColumnIdx() {
    this.columnIdx++;
    this.columnIdx %= this.amp.length;
  }

  public getColumnIndex() {
    return this.columnIdx;
  }

  public getColumn(column: number) {
    column %= this.amp.length;
    column = this.columnIdx - column;
    if (column < 0) column += this.amp.length;
    return this.amp[column];
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
    public accum: number,
    public drag: number,
    public decimation: number
  ) {}
}

export const audioParamsInit = new AudioProcessorParams(
  2, //preemph
  { tao: 2.924, gain: 1 }, // gain filter params
  { tao: 138, gain: -1 }, // gain feedback params
  { tao: 10.5, gain: 1 }, // diff filter params
  { tao: 56.6, gain: -0.05 }, // diff feedback param
  { tao: 69, gain: 1 }, // pos value scale params
  { tao: 693, gain: 1 }, // neg value scale params
  1.0, //diffGain
  1.0, // amp scale
  0, //amp offset
  1e-2, //sync
  0.35, // decay
  1, // accum
  0.0, // drag
  1 // decimation
);

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
  accum,
  drag,
  decimation,
  all,
}

export interface AudioParamUpdate {
  type: AudioParamKey | "load";
  value: number | FilterParams | AudioProcessorParams;
}

export const audioParamReducer = (
  state: AudioProcessorParams,
  action: AudioParamUpdate
) => {
  state = { ...state };
  switch (action.type) {
    case AudioParamKey.preemphasis:
      state.preemphasis = action.value as number;
      break;
    case AudioParamKey.gainFilterParams:
      state.gainFilterParams = action.value as FilterParams;
      break;
    case AudioParamKey.gainFeedbackParams:
      state.gainFeedbackParams = action.value as FilterParams;
      break;
    case AudioParamKey.diffFilterParams:
      state.diffFilterParams = action.value as FilterParams;
      break;
    case AudioParamKey.diffFeedbackParams:
      state.diffFeedbackParams = action.value as FilterParams;
      break;
    case AudioParamKey.posScaleFilterParams:
      state.posScaleFilterParams = action.value as FilterParams;
      break;
    case AudioParamKey.negScaleFilterParams:
      state.negScaleFilterParams = action.value as FilterParams;
      break;
    case AudioParamKey.diffGain:
      state.diffGain = action.value as number;
      break;
    case AudioParamKey.ampScale:
      state.ampScale = action.value as number;
      break;
    case AudioParamKey.ampOffset:
      state.ampOffset = action.value as number;
      break;
    case AudioParamKey.sync:
      state.sync = action.value as number;
      break;
    case AudioParamKey.decay:
      state.decay = action.value as number;
      break;
    case AudioParamKey.accum:
      state.accum = action.value as number;
      break;
    case AudioParamKey.drag:
      state.drag = action.value as number;
      break;
    case AudioParamKey.decimation:
      state.decimation = action.value as number;
      break;
    case AudioParamKey.all:
      state = action.value as AudioProcessorParams;
      break;
    case "load":
      const update = action.value as AudioProcessorParams;
      return { ...state, ...update };
  }
  return state;
};

type VersionString = "v0.1";

export type ExportAudioSettings = [VersionString, ...Array<number>];

export const fromExportAudioSettings = (
  s: ExportAudioSettings
): AudioProcessorParams | undefined => {
  const version = s[0];
  const filterParams = (offset: number): FilterParams => ({
    tao: s[offset] as number,
    gain: s[offset + 1] as number,
  });
  if (version === "v0.1") {
    return {
      preemphasis: s[1],
      gainFilterParams: filterParams(2),
      gainFeedbackParams: filterParams(4),
      diffFilterParams: filterParams(6),
      diffFeedbackParams: filterParams(8),
      posScaleFilterParams: filterParams(10),
      negScaleFilterParams: filterParams(12),
      diffGain: s[14],
      ampScale: s[15],
      ampOffset: s[16],
      sync: s[17],
      decay: s[18],
      accum: s[19] || 1,
      drag: s[20] || 0.0002,
      decimation: s[21] || 1,
    };
  } else {
    console.warn(`could not load settings: unsupported version ${version}`);
  }
};

class Filter {
  public values: Float32Array;
  private _params: Float32Array;

  constructor(readonly size: number, public params: FilterParams) {
    this.values = new Float32Array(size).fill(0);
    this._params = fromFilterParams(params);
  }

  public process(x: Float32Array) {
    for (let i = 0; i < this.size; i++) {
      this.values[i] =
        this._params[0] * x[i] + this._params[1] * this.values[i];
    }
    return this.values;
  }

  public setParams(fp: FilterParams) {
    this._params = fromFilterParams(fp);
  }
}

class BiasedFilter {
  public values: Float32Array;
  private _params: Float32Array;

  constructor(
    readonly size: number,
    public posfp: FilterParams,
    public negfp: FilterParams
  ) {
    this.values = new Float32Array(size).fill(0);
    const posp = fromFilterParams(posfp);
    const negp = fromFilterParams(negfp);
    this._params = new Float32Array([posp[0], posp[1], negp[0], negp[1]]);
  }

  public process(x: Float32Array) {
    for (let i = 0; i < this.size; i++) {
      if (x[i] <= this.values[i]) {
        this.values[i] =
          this._params[0] * x[i] + this._params[1] * this.values[i];
      } else {
        this.values[i] =
          this._params[2] * x[i] + this._params[3] * this.values[i];
      }
    }
    return this.values;
  }

  public setParams(posfp: FilterParams, negfp: FilterParams) {
    const posp = fromFilterParams(posfp);
    const negp = fromFilterParams(negfp);
    this._params = new Float32Array([posp[0], posp[1], negp[0], negp[1]]);
  }
}

export interface FilterParams {
  tao: number;
  gain: number;
}

export const toFilterParams = (fp: Float32Array) => {
  return {
    tao: tao(fp),
    gain: gain(fp),
  } as FilterParams;
};

// .5 = b ^ n -> n = -ln(2)/ln(b)
const tao = (fp: Float32Array) => {
  const g = gain(fp);
  if (g === 0) return 0;

  const b = fp[1] / g;
  if (b === 0) return 0;

  return -Math.log(2) / Math.log(b);
};
const gain = (fp: Float32Array) => Math.abs(fp[0]) + Math.abs(fp[1]);

export const fromFilterParams = (fp: FilterParams) => {
  if (fp.tao === 0) return new Float32Array([1, 0]);

  // .5 = b ^ t -> ln(b) = -ln(2)/t -> b ?????????? fuck i really suck at math now
  // b = .5 * 2 ^ ((t-1)/t)
  let b = 0.5 * Math.pow(2, (fp.tao - 1) / fp.tao);
  let a = 1 - b;
  a *= fp.gain;
  b *= fp.gain;
  return new Float32Array([a, b]);
};

function logError(x: number) {
  x = 1.000001 - x;
  const sign = x < 0 ? 1.0 : -1.0;
  const a = x < 0 ? -x : x;
  return sign * Math.log2(a);
}

class GainController {
  private filter: Filter;
  private gain: Float32Array;
  private err: Float32Array;

  constructor(readonly size: number, public kp = 0.001, public kd = 0.005) {
    this.filter = new Filter(size, { tao: 138, gain: 1 });
    this.gain = new Float32Array(size).fill(0);
    for (let i = 0; i < this.size; i++) {
      this.gain[i] = 1;
    }
    this.err = new Float32Array(size).fill(0);
  }

  public process(x: Float32Array) {
    for (let i = 0; i < this.size; i++) {
      x[i] *= this.gain[i];
    }

    const filtered = this.filter.process(x);

    const e = new Float32Array(this.size);
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
      if (gain > MAX_GAIN) gain = MAX_GAIN;
      if (gain < MIN_GAIN) gain = MIN_GAIN;
      this.gain[i] = gain;
      this.err[i] = e[i];
    }
  }
}

const MAX_GAIN = 1e2;
const MIN_GAIN = 1 / MAX_GAIN;

class FrequencyProcessor {
  private params: AudioProcessorParams;

  private drivers: Drivers;
  private gainController: GainController;

  private gainFilter: Filter;
  private gainFeedback: Filter;
  private diffFilter: Filter;
  private diffFeedback: Filter;
  private scaleFilter: BiasedFilter;

  private scaleInput: Float32Array;

  constructor(readonly size: AudioSize, params: AudioProcessorParams) {
    this.params = { ...params };

    const amp = new Array<Float32Array>(size.length);
    for (let i = 0; i < size.length; i++) {
      amp[i] = new Float32Array(size.buckets);
    }
    const scales = new Float32Array(size.buckets);
    const energy = new Float32Array(size.buckets);
    const diff = new Float32Array(size.buckets);
    const mean = new Float32Array(size.length);
    const drivers = new Drivers(amp, scales, energy, diff, mean);
    this.drivers = drivers;

    this.scaleInput = new Float32Array(size.buckets);

    this.gainController = new GainController(size.buckets);

    this.gainFilter = new Filter(size.buckets, params.gainFilterParams);
    this.gainFeedback = new Filter(size.buckets, params.gainFeedbackParams);
    this.diffFilter = new Filter(size.buckets, params.diffFilterParams);
    this.diffFeedback = new Filter(size.buckets, params.diffFeedbackParams);
    this.scaleFilter = new BiasedFilter(
      size.buckets,
      params.posScaleFilterParams,
      params.negScaleFilterParams
    );
  }

  private _hasUpdate = false;

  public process(input: Float32Array) {
    this.applyPreemphasis(input);
    this.applyGainControl(input);
    this.applyFilters(input);
    this.applyEffects();
    this.applySync();
    this.applyValueScaling();
    this.calculateMean();
    this._hasUpdate = true;
    return this.drivers;
  }

  private applyPreemphasis(x: Float32Array) {
    const incr = (this.params.preemphasis - 1) / this.size.buckets;
    for (let i = 0; i < this.size.buckets; i++) {
      x[i] *= 1 + i * incr;
    }
  }

  private applyGainControl(x: Float32Array) {
    this.gainController.process(x);
  }

  private applyFilters(x: Float32Array) {
    const diffInput = new Float32Array(this.gainFilter.values);

    const gvalues = this.gainFilter.process(x);
    this.gainFeedback.process(x);

    for (let i = 0; i < this.size.buckets; i++) {
      diffInput[i] = gvalues[i] - diffInput[i];
    }

    this.diffFilter.process(diffInput);
    this.diffFeedback.process(diffInput);
  }

  private applyEffects() {
    const dg = this.params.diffGain;
    const ag = this.params.ampScale;
    const ao = this.params.ampOffset;

    // Too expensive.. just do this in the shader
    // const decay = 1 - this.params.decay / this.length;
    // for (let i = 0; i < this.length; i++) {
    //   for (let j = 0; j < this.size; j++) {
    //     this.drivers.amp[i][j] *= decay;
    //   }
    // }

    this.drivers.incrementColumnIdx();
    const amp = this.drivers.getColumn(0);
    const diff = this.drivers.diff;
    const energy = this.drivers.energy;

    for (let i = 0; i < this.size.buckets; i++) {
      amp[i] = this.gainFilter.values[i] + this.gainFeedback.values[i];
      amp[i] = ao + ag * amp[i];

      diff[i] = dg * (this.diffFilter.values[i] + this.diffFeedback.values[i]);

      let ph = energy[i] + this.params.drag;
      ph -= diff[i] * this.params.accum;
      energy[i] = ph;
    }
  }

  private applySync() {
    const { buckets } = this.size;
    const energy = this.drivers.energy;

    let mean = 0;
    for (let i = 0; i < buckets; i++) {
      mean += energy[i];
    }
    mean /= buckets;

    let diff, sign;
    for (let i = 0; i < buckets; i++) {
      if (i !== 0) {
        diff = energy[i - 1] - energy[i];
        sign = diff < 0 ? -1 : 1;
        diff = sign * diff * diff;
        energy[i] += this.params.sync * diff;
      }
      if (i !== buckets - 1) {
        diff = energy[i + 1] - energy[i];
        sign = diff < 0 ? -1.0 : 1.0;
        diff = sign * diff * diff;
        energy[i] += this.params.sync * diff;
      }
      diff = mean - energy[i];
      sign = diff < 0 ? -1.0 : 1.0;
      diff = sign * diff * diff;
      energy[i] += this.params.sync * diff;
    }

    mean = 0;
    for (let i = 0; i < buckets; i++) {
      mean += energy[i];
    }
    mean /= buckets;

    if (mean < -2 * Math.PI) {
      // wait until all elements go past the mark so theres no sign flips
      for (let i = 0; i < buckets; i++) {
        if (energy[i] >= -2 * Math.PI) return;
      }
      for (let i = 0; i < buckets; i++) {
        energy[i] = 2 * Math.PI + energy[i]; // (energy[i] % 2 * Math.PI)
      }
      mean = 2 * Math.PI + mean; //(mean % 2 * Math.PI)
    }
    if (mean > 2 * Math.PI) {
      for (let i = 0; i < buckets; i++) {
        if (energy[i] <= 2 * Math.PI) return;
      }
      for (let i = 0; i < buckets; i++) {
        energy[i] -= 2 * Math.PI; //(energy[i] % 2 * Math.PI)
      }
      mean -= 2 * Math.PI; //(mean % 2 * Math.PI)
    }
  }

  private applyValueScaling() {
    const x = this.drivers.getColumn(0);

    for (let i = 0; i < this.size.buckets; i++) {
      const vs = this.drivers.scales[i];
      const sv = vs * (x[i] - 1);
      this.scaleInput[i] = Math.abs(sv);
    }

    this.scaleFilter.process(this.scaleInput);

    for (let i = 0; i < this.size.buckets; i++) {
      let vsh = this.scaleFilter.values[i];
      if (vsh < 0.001) vsh = 0.001;
      const vs = 1 / vsh;
      this.scaleFilter.values[i] = vsh;
      this.drivers.scales[i] = vs;
    }
  }

  private calculateMean() {
    const columnIndex = this.drivers.getColumnIndex();
    const amp = this.drivers.amp[columnIndex];
    const scales = this.drivers.scales;
    let s = 0;
    for (let i = 0; i < amp.length; i++) {
      s += scales[i] * (amp[i] - 1);
    }
    s /= amp.length;
    this.drivers.mean[columnIndex] = s;
  }

  public getDrivers(): [Drivers, boolean] {
    const hasUpdate = this._hasUpdate;
    this._hasUpdate = false;
    return [this.drivers, hasUpdate];
  }

  public setParams(params: AudioProcessorParams) {
    this.gainFilter.setParams(params.gainFilterParams);
    this.gainFeedback.setParams(params.gainFeedbackParams);
    this.diffFilter.setParams(params.diffFilterParams);
    this.diffFeedback.setParams(params.diffFeedbackParams);
    this.scaleFilter.setParams(
      params.posScaleFilterParams,
      params.negScaleFilterParams
    );
    this.params = params;
  }
}
