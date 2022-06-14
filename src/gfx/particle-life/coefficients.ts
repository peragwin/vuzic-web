import { AudioProcessor, Drivers } from "../../audio/audio";
import { State } from "./state";
import { hsluvToRgb } from "hsluv";
import { mod, matrix, Matrix, pow } from "mathjs";
const math = require("mathjs");

export function random_normal() {
  const u = 1.0 - Math.random();
  const v = 1.0 - Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface CoefficientParams {
  particleInit: {
    sigma: number;
    mean: number;
    minRadius: { min: number; max: number };
    maxRadius: { min: number; max: number };
  };
  audio: {
    motionEffect: number;
    colorEffect: { x: number; y: number }; // { x: brightness, y: hue }
  };
  color: {
    spread: number;
    lightness: number;
    cycleRate: number;
    baseHue: number;
  };
}

const MIN_RADIUS = 2.0;
const PARAMETER_SCALE = 0.01; // input parameters are scaled x100

function sigmoid(x: number) {
  return (1 + x / (1 + Math.abs(x))) / 2;
}
export class Coefficients {
  public baseAttraction: Float32Array;
  public minRadii: Float32Array;
  public maxRadii: Float32Array;
  private audioChannelMap: Matrix;
  public audioEffectMatrix: Float32Array;
  private interactionMatrixBuffer: Float32Array = new Float32Array();

  constructor(
    private state: State,
    private audio: AudioProcessor,
    private params: CoefficientParams
  ) {
    const { numTypes } = state;
    this.baseAttraction = new Float32Array(numTypes * numTypes);
    this.minRadii = new Float32Array(numTypes * numTypes);
    this.maxRadii = new Float32Array(numTypes * numTypes);
    this.randomizeCoefficients();
    this.audioChannelMap = matrix(
      make_audio_channel_map(numTypes, audio.buckets)
    );
    this.audioEffectMatrix = random_orthonomal(numTypes, numTypes);
  }

  // private constructAudioCoefficients(numTypes: number, numBuckets: number) {
  //   if (numTypes < numBuckets) {
  //     this.audioEffectMatrix = matrix(
  //       Array.from(Array(numBuckets)).map((_) =>
  //         normalize(random_vector(numTypes))
  //       )
  //     );
  //   } else {
  //     this.audioEffectMatrix = random_orthonomal(numBuckets, numTypes);
  //   }
  // }

  public resize() {
    const numTypes = this.state.numTypes;
    this.audio.resize(numTypes);
    this.baseAttraction = new Float32Array(numTypes * numTypes);
    this.minRadii = new Float32Array(numTypes * numTypes);
    this.maxRadii = new Float32Array(numTypes * numTypes);
    this.randomizeCoefficients();
    this.audioChannelMap = matrix(
      make_audio_channel_map(numTypes, this.audio.buckets)
    );
    this.audioEffectMatrix = random_orthonomal(numTypes, numTypes);
  }

  public randomizeCoefficients() {
    const numTypes = this.state.numTypes;
    const { params, state, baseAttraction, minRadii, maxRadii } = this;
    const { sigma, mean, minRadius, maxRadius } = params.particleInit;

    for (let i = 0; i < numTypes; i++) {
      for (let j = 0; j < numTypes; j++) {
        const idx = j * numTypes + i;
        const attract = sigma * random_normal() + mean;
        const minr =
          Math.random() * (minRadius.max - minRadius.min) + minRadius.min;
        const maxr =
          Math.random() * (maxRadius.max - maxRadius.min) + maxRadius.min;
        if (i === j) {
          baseAttraction[idx] = -Math.abs(attract);
          minRadii[idx] = MIN_RADIUS;
        } else {
          baseAttraction[idx] = attract;
          minRadii[idx] = Math.max(minr, MIN_RADIUS);
        }
        maxRadii[idx] = Math.max(maxr, minRadii[idx]);
        // enforce symmetry
        const idxT = i * numTypes + j;
        maxRadii[idxT] = maxRadii[idx];
        minRadii[idxT] = minRadii[idx];
      }
    }

    this.interactionMatrixBuffer = new Float32Array(
      Array.from(baseAttraction)
        .map((a, i) => [a, minRadii[i], maxRadii[i]])
        .flat()
        .map((v) => v * PARAMETER_SCALE)
    );
    state.interactionMatrix.updateData(
      numTypes,
      numTypes,
      this.interactionMatrixBuffer
    );
  }

  public update() {
    const [drivers] = this.audio.getDrivers();
    this.updateColors(drivers);
    this.updateCoefficients(drivers);
  }

  private colorCycle = 0;
  private lastTime = 0;

  private updateColors(drivers: Drivers) {
    const channels = drivers.rows;
    const {
      audio: { colorEffect },
      color: { spread, lightness, cycleRate, baseHue },
    } = this.params;

    const time = performance.now() / 1000;
    this.colorCycle += cycleRate * (time - this.lastTime);
    this.lastTime = time;

    const colors = new Uint8ClampedArray(
      Array.from(Array(this.state.numTypes))
        .map((_, i) => {
          const bhue = spread * i + this.colorCycle + baseHue;
          if (i < channels) {
            let aval = drivers.scales[i] * (drivers.getColumn(0)[i] - 1.0);
            const cval = lightness + colorEffect.x * (sigmoid(aval) - 0.5);

            aval = (180 / Math.PI) * colorEffect.y * drivers.energy[i];
            let hue = mod(aval + bhue, 360.0);
            if (hue < 0) hue += 360.0;

            return hsluvToRgb([hue, 100.0, 100.0 * cval]);
          } else {
            return hsluvToRgb([mod(bhue, 360.0), 100, 100 * lightness]);
          }
        })
        .flat()
        .map((v) => v * 255)
    );

    this.state.colors.updateData(this.state.numTypes, 1, colors);
  }

  private updateCoefficients(drivers: Drivers) {
    const {
      audio: { motionEffect },
    } = this.params;
    const { numTypes } = this.state;

    if (motionEffect === 0) return;

    const audio = drivers.getColumn(0);
    const scale = drivers.scales;
    const audioValues = math.multiply(
      this.audioChannelMap,
      Array.from(audio.map((a, i) => scale[i] * (a - 1.0)))
    );

    const STRIDE = 3;

    for (let i = 0; i < numTypes; i++) {
      const av = audioValues.get([i]);
      for (let j = 0; j < numTypes; j++) {
        const idx = i * numTypes + j;
        this.interactionMatrixBuffer[STRIDE * idx] =
          PARAMETER_SCALE *
          (this.baseAttraction[idx] +
            motionEffect * av * this.audioEffectMatrix[idx]);
      }
    }

    this.state.interactionMatrix.updateData(
      numTypes,
      numTypes,
      this.interactionMatrixBuffer
    );
  }
}

const random_vector = (height: number) =>
  Array.from(Array(height)).map((_) => Math.random());

const normalize = (vec: Array<number>) => {
  const norm = Math.sqrt(math.dot(vec, vec));
  return vec.map((x) => x / norm);
};

function random_orthonomal(width: number, height: number) {
  const cols = [normalize(random_vector(height))];
  for (let i = 1; i < width; i++) {
    let u = random_vector(height);
    for (let j = 0; j < i; j++) {
      let v = cols[j];
      let c = math.dot(u, v);
      u = math.subtract(u, math.multiply(c, v) as number[]);
    }
    cols.push(normalize(u));
  }
  return new Float32Array(cols.flat());
}

const make_audio_channel_map = (width: number, height: number) =>
  Array.from(Array(width)).map((_, i) =>
    Array.from(Array(height)).map((_, j) => (i === j ? 1.0 : 0.0))
  );
