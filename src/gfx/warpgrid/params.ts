import { setUrlParam } from "../../hooks/routeSettings";
import { Dims } from "../types";

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
  zscale,
  bloom,
  bloomSharpness,
  baseColor,
  gammaRed,
  gammaGreen,
  gammaBlue,
  offset,
  all,
}

export const BASE_AUDIO_LENGTH = 64;

export class WarpController {
  constructor(
    public params: RenderParams,
    private updateState: (action: RenderParamUpdate) => void
  ) {}

  // this is a hacky interceptor which will push the update to the URL parameter
  // as well updating the internal state. "load" is used to load URL parameters,
  // so don't bother updating it in that case.
  // TODO: refactor into a base class
  public update(action: RenderParamUpdate) {
    this.updateState(action);
    if (action.type !== "load") {
      const nextState = renderParamReducer(this.params, action);
      setUrlParam("params", this.export(nextState));
    }
  }

  private updater = (type: RenderParamKey) => (e: Event, value: number) =>
    this.update({ type, value });

  public config = () => [
    {
      title: "Color Scaler",
      min: -4,
      max: 4,
      step: 0.01,
      update: this.updater(RenderParamKey.valueScale),
    },
    {
      title: "Color Offset",
      min: -4,
      max: 4,
      step: 0.01,
      update: this.updater(RenderParamKey.valueOffset),
    },
    {
      title: "Lightness Scaler",
      min: -4,
      max: 4,
      step: 0.01,
      update: this.updater(RenderParamKey.lightnessScale),
    },
    {
      title: "Lightness Offset",
      min: -4,
      max: 4,
      step: 0.01,
      update: this.updater(RenderParamKey.lightnessOffset),
    },
    {
      title: "Alpha Scale",
      min: -2,
      max: 8,
      step: 0.01,
      update: this.updater(RenderParamKey.alphaScale),
    },
    {
      title: "Alpha Offset",
      min: -4,
      max: 4,
      step: 0.01,
      update: this.updater(RenderParamKey.alphaOffset),
    },
    {
      title: "Horizontal Warp",
      min: 0,
      max: 16,
      step: 0.05,
      update: this.updater(RenderParamKey.warpScale),
    },
    {
      title: "Horizontal Warp Offset",
      min: -1,
      max: 4,
      step: 0.01,
      update: this.updater(RenderParamKey.warpOffset),
    },
    {
      title: "Vertical Warp",
      min: -2,
      max: 8,
      step: 0.01,
      update: this.updater(RenderParamKey.scaleScale),
    },
    {
      title: "Vertical Warp Offset",
      min: -1,
      max: 4,
      step: 0.01,
      update: this.updater(RenderParamKey.scaleOffset),
    },
    {
      title: "Color Period",
      min: 1,
      max: 360,
      step: 1,
      update: this.updater(RenderParamKey.period),
    },
    {
      title: "Color Cycle Rate",
      min: 0.0001,
      max: 0.1,
      step: 0.0001,
      update: this.updater(RenderParamKey.colorCycle),
    },
    {
      title: "Z Scale",
      min: 0,
      max: 2,
      step: 0.01,
      update: this.updater(RenderParamKey.zscale),
    },
    {
      title: "Bloom",
      min: 0,
      max: 1,
      step: 0.001,
      update: this.updater(RenderParamKey.bloom),
    },
    {
      title: "Bloom Sharpness",
      min: -1,
      max: 2,
      step: 0.001,
      update: this.updater(RenderParamKey.bloomSharpness),
    },
    {
      title: "Base Color",
      min: -180,
      max: 180,
      step: 0.1,
      update: this.updater(RenderParamKey.baseColor),
    },
    {
      title: "γ Red",
      min: 0,
      max: 3,
      step: 0.001,
      update: this.updater(RenderParamKey.gammaRed),
    },
    {
      title: "γ Green",
      min: 0,
      max: 3,
      step: 0.001,
      update: this.updater(RenderParamKey.gammaGreen),
    },
    {
      title: "γ Blue",
      min: 0,
      max: 3,
      step: 0.001,
      update: this.updater(RenderParamKey.gammaBlue),
    },
    {
      title: "Offset",
      min: -2,
      max: 2,
      step: 0.001,
      update: this.updater(RenderParamKey.offset),
    },
  ];

  public values = (params?: RenderParams) => {
    params = params || this.params;
    return [
      this.params.valueScale,
      this.params.valueOffset,
      this.params.lightnessScale,
      this.params.lightnessOffset,
      this.params.alphaScale,
      this.params.alphaOffset,
      this.params.warpScale,
      this.params.warpOffset,
      this.params.scaleScale,
      this.params.scaleOffset,
      this.params.period,
      this.params.colorCycle,
      this.params.zscale,
      this.params.bloom,
      this.params.bloomSharpness,
      this.params.baseColor,
      this.params.gammaRed,
      this.params.gammaGreen,
      this.params.gammaBlue,
      this.params.offset,
    ];
  };

  public version: VersionString = "v0.1";

  public export = (params?: RenderParams) =>
    [this.version as any].concat(this.values(params || this.params));
}

export type VersionString = "v0.1";

export interface RenderParams {
  audioSize: Dims;
  gridSize: Dims;
  aspect: number;
  valueScale: number;
  valueOffset: number;
  lightnessScale: number;
  lightnessOffset: number;
  alphaScale: number;
  alphaOffset: number;
  warpScale: number;
  warpOffset: number;
  scaleScale: number;
  scaleOffset: number;
  period: number;
  colorCycle: number;
  zscale: number;
  bloom: number;
  bloomSharpness: number;
  baseColor: number;
  gammaRed: number;
  gammaGreen: number;
  gammaBlue: number;
  offset: number;
}

export const warpRenderParamsInit = (
  audioSize: Dims,
  gridSize: Dims
): RenderParams => ({
  audioSize,
  gridSize,
  aspect: 4 / 3,
  valueScale: 2,
  valueOffset: 0,
  lightnessScale: 0.88,
  lightnessOffset: 0,
  alphaScale: 1,
  alphaOffset: 0.25,
  warpScale: 16,
  warpOffset: 1.35,
  scaleScale: 2.26,
  scaleOffset: 0.45,
  period: 3 * 60,
  colorCycle: 0.01,
  zscale: 0,
  bloom: 0.1,
  bloomSharpness: 1,
  baseColor: 0,
  gammaRed: 1,
  gammaGreen: 1,
  gammaBlue: 1,
  offset: 0,
});

export interface RenderParamUpdate {
  type: RenderParamKey | "all" | "load";
  value: number | RenderParams | ImportRenderParams;
}

export const renderParamReducer = (
  state: RenderParams,
  action: RenderParamUpdate
) => {
  state = { ...state };
  switch (action.type) {
    case RenderParamKey.valueScale:
      state.valueScale = action.value as number;
      return state;
    case RenderParamKey.valueOffset:
      state.valueOffset = action.value as number;
      return state;
    case RenderParamKey.alphaScale:
      state.alphaScale = action.value as number;
      return state;
    case RenderParamKey.alphaOffset:
      state.alphaOffset = action.value as number;
      return state;
    case RenderParamKey.lightnessScale:
      state.lightnessScale = action.value as number;
      return state;
    case RenderParamKey.lightnessOffset:
      state.lightnessOffset = action.value as number;
      return state;
    case RenderParamKey.warpScale:
      state.warpScale = action.value as number;
      return state;
    case RenderParamKey.warpOffset:
      state.warpOffset = action.value as number;
      return state;
    case RenderParamKey.scaleScale:
      state.scaleScale = action.value as number;
      return state;
    case RenderParamKey.scaleOffset:
      state.scaleOffset = action.value as number;
      return state;
    case RenderParamKey.period:
      state.period = action.value as number;
      return state;
    case RenderParamKey.colorCycle:
      state.colorCycle = action.value as number;
      return state;
    case RenderParamKey.zscale:
      state.zscale = action.value as number;
      return state;
    case RenderParamKey.bloom:
      state.bloom = action.value as number;
      return state;
    case RenderParamKey.bloomSharpness:
      state.bloomSharpness = action.value as number;
      return state;
    case RenderParamKey.baseColor:
      state.baseColor = action.value as number;
      return state;
    case RenderParamKey.gammaRed:
      state.gammaRed = action.value as number;
      return state;
    case RenderParamKey.gammaGreen:
      state.gammaGreen = action.value as number;
      return state;
    case RenderParamKey.gammaBlue:
      state.gammaBlue = action.value as number;
      return state;
    case RenderParamKey.offset:
      state.offset = action.value as number;
      return state;
    case RenderParamKey.all:
    case "all":
      return { ...state, ...(action.value as RenderParams) };
    case "load":
      if (!action.value) return state;
      const v = action.value as ImportRenderParams;
      return { ...state, ...v };
  }
};

export type ExportWarpSettings = [VersionString, ...Array<number>];

export interface ImportRenderParams {
  valueScale: number;
  valueOffset: number;
  lightnessScale: number;
  lightnessOffset: number;
  alphaScale: number;
  alphaOffset: number;
  warpScale: number;
  warpOffset: number;
  scaleScale: number;
  scaleOffset: number;
  period: number;
  colorCycle: number;
  zscale?: number;
  bloom?: number;
  bloomSharpness?: number;
  baseColor?: number;
  gammaRed?: number;
  gammaGreen?: number;
  gammaBlue?: number;
  offset?: number;
}

export const fromExportWarpSettings = (
  s: ExportWarpSettings
): ImportRenderParams => {
  const version = s[0];
  if (version === "v0.1") {
    return {
      valueScale: s[1],
      valueOffset: s[2],
      lightnessScale: s[3],
      lightnessOffset: s[4],
      alphaScale: s[5],
      alphaOffset: s[6],
      warpScale: s[7],
      warpOffset: s[8],
      scaleScale: s[9],
      scaleOffset: s[10],
      period: s[11],
      colorCycle: s[12],
      zscale: s[13] || 0,
      bloom: s[14] || 0,
      bloomSharpness: s[15] || 0,
      baseColor: s[16] || 0,
      gammaRed: s[17] || 1,
      gammaGreen: s[18] || 1,
      gammaBlue: s[19] || 1,
      offset: s[20] || 0,
    };
  } else {
    throw new Error(`could not load warp settings: unknown version ${version}`);
  }
};
