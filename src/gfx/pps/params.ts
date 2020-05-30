import { RenderParams } from "./pps";

const toDegrees = (rad: number) => (180.0 * rad) / Math.PI;
const toRadians = (deg: number) => (Math.PI * deg) / 180.0;

export type PpsRenderParamKey =
  | "all"
  | "alpha"
  | "beta"
  | "radius"
  | "velocity"
  | "size"
  | "particles";

export interface PpsRenderParamUpdate {
  type: PpsRenderParamKey;
  value: number | RenderParams;
}

export const ppsRenderParamsReducer = (
  state: RenderParams,
  action: PpsRenderParamUpdate
): RenderParams => {
  switch (action.type) {
    case "alpha":
      return { ...state, alpha: toRadians(action.value as number) };
    case "beta":
      return { ...state, beta: toRadians(action.value as number) };
    case "radius":
      return { ...state, radius: action.value as number };
    case "particles":
      return { ...state, particles: action.value as number };
    case "size":
      return { ...state, size: action.value as number };
    case "velocity":
      return { ...state, velocity: action.value as number };
    case "all":
      return action.value as RenderParams;
  }
};

export class PpsRenderParams {
  constructor(
    public params: RenderParams,
    public update: (action: PpsRenderParamUpdate) => void
  ) {}

  public values = () => [
    toDegrees(this.params.alpha),
    toDegrees(this.params.beta),
    this.params.radius,
    this.params.velocity,
    this.params.particles,
    this.params.size,
  ];

  private updater = (type: PpsRenderParamKey) => (
    e: React.ChangeEvent<{}>,
    value: number
  ) => this.update({ type, value });

  public config = () => [
    {
      title: "Alpha",
      min: 0,
      max: 360,
      step: 1,
      update: this.updater("alpha"),
    },
    {
      title: "Beta",
      min: -180,
      max: 180,
      step: 1,
      update: this.updater("beta"),
    },
    {
      title: "Detection Radius",
      min: 0,
      max: 0.5,
      step: 0.0025,
      update: this.updater("radius"),
    },
    {
      title: "Particle Velocity",
      min: 0,
      max: 0.1,
      step: 0.0005,
      update: this.updater("velocity"),
    },
    {
      title: "Number of Particles",
      min: 16,
      max: 4096,
      step: 16,
      update: this.updater("particles"),
    },
    {
      title: "Particle Size",
      min: 1,
      max: 48,
      step: 1,
      update: this.updater("size"),
    },
  ];
}
