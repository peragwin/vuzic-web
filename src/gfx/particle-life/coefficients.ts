import { AudioProcessor } from "../../audio/audio";
import { State } from "./state";
import { hsluvToRgb } from "hsluv";

export function random_normal() {
  const u = 1.0 - Math.random();
  const v = 1.0 - Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface CoefficientParams {
  sigma: number;
  mean: number;
  minRadius: { x: number; y: number };
  maxRadius: { x: number; y: number };
}

const MIN_RADIUS = 2.0;
const PARAMETER_SCALE = 0.01; // input parameters are scaled x100

export class Coefficients {
  public baseAttraction: Float32Array;
  public minRadii: Float32Array;
  public maxRadii: Float32Array;

  constructor(
    private state: State,
    private audio: AudioProcessor,
    private params: CoefficientParams
  ) {
    const { numTypes } = state;
    this.baseAttraction = new Float32Array(numTypes * numTypes);
    this.minRadii = new Float32Array(numTypes * numTypes);
    this.maxRadii = new Float32Array(numTypes * numTypes);
    this.randomizeCoefficients(numTypes);
  }

  public randomizeCoefficients(numTypes: number) {
    const { params, state, baseAttraction, minRadii, maxRadii } = this;

    for (let i = 0; i < numTypes; i++) {
      for (let j = 0; j < numTypes; j++) {
        const idx = j * numTypes + i;
        const attract = params.sigma * random_normal() + params.mean;
        const minRadius =
          Math.random() * (params.minRadius.y - params.minRadius.x) +
          params.minRadius.x;
        const maxRadius =
          Math.random() * (params.maxRadius.y - params.maxRadius.x) +
          params.maxRadius.x;
        if (i === j) {
          baseAttraction[idx] = -Math.abs(attract);
          minRadii[idx] = MIN_RADIUS;
        } else {
          baseAttraction[idx] = attract;
          minRadii[idx] = Math.max(minRadius, MIN_RADIUS);
        }
        maxRadii[idx] = Math.max(maxRadius, minRadii[idx]);
        // enforce symmetry
        const idxT = i * numTypes + j;
        maxRadii[idxT] = maxRadii[idx];
        minRadii[idxT] = minRadii[idx];
      }
    }

    const interactionMatrix = new Float32Array(
      Array.from(baseAttraction)
        .map((a, i) => [a, minRadii[i], maxRadii[i]])
        .flat()
        .map((v) => v * PARAMETER_SCALE)
    );
    state.interactionMatrix.updateData(numTypes, numTypes, interactionMatrix);
  }

  public updateFromAudio() {
    // do things

    const t = performance.now() / 1000.0;
    const colors = new Uint8ClampedArray(
      Array.from(Array(this.state.numTypes))
        .map((_, i) => [...hsluvToRgb([(i * 8 + t) % 360, 100, 50])])
        .flat()
        .map((v) => v * v * 255)
    );
    this.state.colors.updateData(this.state.numTypes, 1, colors);

    const [drivers, hasUpdate] = this.audio.getDrivers();
    if (!hasUpdate) return;
  }
}
