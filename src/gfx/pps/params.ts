import { RenderParams } from "./pps";
import { setUrlParam } from "../../hooks/routeSettings";
import { BorderSize } from "./gradientField";

const toDegrees = (rad: number) => (180.0 * rad) / Math.PI;
const toRadians = (deg: number) => (Math.PI * deg) / 180.0;

export type PpsRenderParamKey =
  | "all"
  | "alpha"
  | "beta"
  | "radius"
  | "radialDecay"
  | "velocity"
  | "size"
  | "particleDensity"
  | "particles"
  | "borderRadius"
  | "borderSharpness"
  | "borderIntensity"
  | "load";

export type ParamsVersion = "v0.1" | "v0.2" | "v0.3" | undefined;

export interface PpsRenderParamUpdate {
  type: PpsRenderParamKey;
  value: number | RenderParams | number[] | ImportRenderParams;
  version?: ParamsVersion;
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
    case "radialDecay":
      return { ...state, radialDecay: action.value as number };
    case "particles":
      return { ...state, particles: action.value as number };
    case "size":
      return { ...state, size: action.value as number };
    case "particleDensity":
      return { ...state, particleDensity: action.value as number };
    case "velocity":
      return { ...state, velocity: action.value as number };
    case "borderRadius":
      return {
        ...state,
        borderSize: { ...state.borderSize, radius: action.value as number },
      };
    case "borderSharpness":
      return {
        ...state,
        borderSize: { ...state.borderSize, sharpness: action.value as number },
      };
    case "borderIntensity":
      return {
        ...state,
        borderSize: { ...state.borderSize, intensity: action.value as number },
      };
    case "all":
      return {
        ...state,
        ...(action.value as RenderParams),
      };
    case "load":
      let params = action.value as ImportRenderParams;
      return { ...state, ...params };
  }
};

export type ExportPpsSettings = [ParamsVersion, ...Array<number>];

export interface ImportRenderParams {
  alpha: number;
  beta: number;
  radius: number;
  velocity: number;
  size: number;
  radialDecay: number;
  particles: number;
  particleDensity?: number;
  borderRadius?: number;
  borderSharpness?: number;
  borderIntensity?: number;
}

export const fromExportPpsSettings = (s: ExportPpsSettings) => {
  const version = s[0];
  console.log("pps", version);
  if (version === "v0.1" || version === "v0.2" || version === "v0.3") {
    const v = s.slice(1) as number[];
    const re: ImportRenderParams = {
      alpha: toRadians(v[0]),
      beta: toRadians(v[1]),
      radius: v[2],
      radialDecay: v[3],
      velocity: v[4],
      particles: v[5],
      size: v[6],
    };
    if (version === "v0.2" || version === "v0.3") {
      re.particleDensity = v[7];
    }
    if (version === "v0.3") {
      re.borderRadius = v[8];
      re.borderSharpness = v[9];
      re.borderIntensity = v[10];
    }
    return re;
  } else {
    throw new Error(`could not load pps settings: unknown version ${version}`);
  }
};

export class PpsController {
  constructor(
    // readonly pps: React.MutableRefObject<PpsController>,
    readonly params: RenderParams,
    private updateState: (action: PpsRenderParamUpdate) => void
  ) {}

  // this is a hacky interceptor which will push the update to the URL parameter
  // as well updating the internal state. "load" is used to load URL parameters,
  // so don't bother updating it in that case.
  // TODO: refactor into a base class
  public update(action: PpsRenderParamUpdate) {
    this.updateState(action);
    if (action.type !== "load") {
      const nextState = ppsRenderParamsReducer(this.params, action);
      setUrlParam("params", this.export(nextState));
    }
  }

  public values = (params?: RenderParams) => {
    params = params || this.params;
    return [
      toDegrees(params.alpha),
      toDegrees(params.beta),
      params.radius,
      params.radialDecay,
      params.velocity,
      params.particles,
      params.size,
      params.particleDensity,
      ...fromBorderSize(params.borderSize),
    ];
  };

  readonly version = "v0.3";

  public export = (params?: RenderParams) =>
    [this.version as any].concat(this.values(params || this.params));

  private updater = (type: PpsRenderParamKey) => (
    e: React.ChangeEvent<{}>,
    value: number
  ) => this.update({ type, value });

  public config = () => [
    {
      title: "Alpha",
      min: -180,
      max: 180,
      step: 0.1,
      update: this.updater("alpha"),
    },
    {
      title: "Beta",
      min: -30,
      max: 30,
      step: 0.01,
      update: this.updater("beta"),
    },
    {
      title: "Detection Radius",
      min: 0,
      max: 0.5,
      step: 0.0005,
      update: this.updater("radius"),
    },
    {
      title: "Radial Decay",
      min: 0,
      max: 10,
      step: 0.01,
      update: this.updater("radialDecay"),
    },
    {
      title: "Particle Velocity",
      min: 0,
      max: 0.1,
      step: 0.0001,
      update: this.updater("velocity"),
    },
    {
      title: "Number of Particles",
      min: 16,
      max: 64 * 4096,
      step: 64,
      update: this.updater("particles"),
    },
    {
      title: "Particle Size",
      min: 1,
      max: 48,
      step: 1,
      update: this.updater("size"),
    },
    {
      title: "Particle Draw Density",
      min: 0.001,
      max: 1,
      step: 0.001,
      update: this.updater("particleDensity"),
    },
    {
      title: "Border Size",
      min: 0.01,
      max: 2.0,
      step: 0.002,
      update: this.updater("borderRadius"),
    },
    {
      title: "Border Sharpness",
      min: 0.02,
      max: 4,
      step: 0.02,
      update: this.updater("borderSharpness"),
    },
    {
      title: "Border Force",
      min: 1,
      max: 100,
      step: 0.1,
      update: this.updater("borderIntensity"),
    },
  ];
}

const palettes = {
  default: [
    {
      name: "Russian Violet",
      hex: "0b0033",
      rgb: [11, 0, 51],
      cmyk: [78, 100, 0, 80],
      hsb: [253, 100, 20],
      hsl: [253, 100, 10],
      lab: [2, 18, -29],
    },
    {
      name: "Dark Purple",
      hex: "370031",
      rgb: [55, 0, 49],
      cmyk: [0, 100, 10, 78],
      hsb: [307, 100, 22],
      hsl: [307, 100, 11],
      lab: [9, 32, -16],
    },
    {
      name: "Antique Ruby",
      hex: "832232",
      rgb: [131, 34, 50],
      cmyk: [0, 74, 61, 48],
      hsb: [350, 74, 51],
      hsl: [350, 59, 32],
      lab: [29, 42, 14],
    },
    {
      name: "Copper Crayola",
      hex: "ce8964",
      rgb: [206, 137, 100],
      cmyk: [0, 33, 51, 19],
      hsb: [21, 51, 81],
      hsl: [21, 52, 60],
      lab: [63, 22, 30],
    },
    {
      name: "Key Lime",
      hex: "eaf27c",
      rgb: [234, 242, 124],
      cmyk: [3, 0, 48, 5],
      hsb: [64, 49, 95],
      hsl: [64, 82, 72],
      lab: [92, -18, 55],
    },
  ],
  // [
  //   {
  //     name: "Antique Brass",
  //     hex: "e09f7d",
  //     rgb: [224, 159, 125],
  //     cmyk: [0, 29, 44, 12],
  //     hsb: [21, 44, 88],
  //     hsl: [21, 61, 68],
  //     lab: [70, 20, 27],
  //   },
  //   {
  //     name: "Sizzling Red",
  //     hex: "ef5d60",
  //     rgb: [239, 93, 96],
  //     cmyk: [0, 61, 59, 6],
  //     hsb: [359, 61, 94],
  //     hsl: [359, 82, 65],
  //     lab: [58, 56, 28],
  //   },
  //   {
  //     name: "Paradise Pink",
  //     hex: "ec4067",
  //     rgb: [236, 64, 103],
  //     cmyk: [0, 72, 56, 7],
  //     hsb: [346, 73, 93],
  //     hsl: [346, 82, 59],
  //     lab: [54, 67, 18],
  //   },
  //   {
  //     name: "Flirt",
  //     hex: "a01a7d",
  //     rgb: [160, 26, 125],
  //     cmyk: [0, 83, 21, 37],
  //     hsb: [316, 84, 63],
  //     hsl: [316, 72, 36],
  //     lab: [37, 60, -22],
  //   },
  //   {
  //     name: "Russian Violet",
  //     hex: "311847",
  //     rgb: [49, 24, 71],
  //     cmyk: [30, 66, 0, 72],
  //     hsb: [272, 66, 28],
  //     hsl: [272, 49, 19],
  //     lab: [14, 23, -24],
  //   },
  // ],
  cool: [
    {
      name: "Medium Turquoise",
      hex: "75dddd",
      rgb: [117, 221, 221],
      cmyk: [47, 0, 0, 13],
      hsb: [180, 47, 87],
      hsl: [180, 60, 66],
      lab: [82, -30, -9],
    },
    {
      name: "Middle Blue",
      hex: "84c7d0",
      rgb: [132, 199, 208],
      cmyk: [36, 4, 0, 18],
      hsb: [187, 37, 82],
      hsl: [187, 45, 67],
      lab: [76, -18, -11],
    },
    {
      name: "Blue Bell",
      hex: "9297c4",
      rgb: [146, 151, 196],
      cmyk: [25, 22, 0, 23],
      hsb: [234, 26, 77],
      hsl: [234, 30, 67],
      lab: [63, 8, -23],
    },
    {
      name: "Amethyst",
      hex: "9368b7",
      rgb: [147, 104, 183],
      cmyk: [19, 43, 0, 28],
      hsb: [273, 43, 72],
      hsl: [273, 35, 56],
      lab: [51, 32, -35],
    },
    {
      name: "Byzantine",
      hex: "aa3e98",
      rgb: [170, 62, 152],
      cmyk: [0, 63, 10, 33],
      hsb: [310, 64, 67],
      hsl: [310, 47, 45],
      lab: [44, 54, -27],
    },
  ],
};

export const paletteNames = ["default", "cool"];

type Color = {
  rgb: number[];
};

export const getPalette = (name: string) => {
  const get = (pal: Color[]) =>
    pal
      // .reverse()
      .map((p) => [...p.rgb.map((c) => c * 1.5), 255])
      .flat();
  switch (name) {
    case "default":
      return get(palettes.default);
    case "cool":
      return get(palettes.cool);
  }
};

const fromBorderSize = ({ radius, sharpness, intensity }: BorderSize) => {
  return [radius, sharpness, intensity];
};
