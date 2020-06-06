import { Drivers } from "../../audio/audio";

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
export class WarpController {
  constructor(
    public params: RenderParams,
    public update: (action: RenderParamUpdate) => void
  ) {}

  private updater = (type: RenderParamKey) => (
    e: React.ChangeEvent<{}>,
    value: number
  ) => this.update({ type, value });

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
      min: 0.001,
      max: 1.0,
      step: 0.001,
      update: this.updater(RenderParamKey.colorCycle),
    },
  ];

  public values = () => [
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
  ];

  public version = "v0.1";

  public export = () => [this.version as any].concat(this.values());
}

export interface RenderParams {
  rows: number;
  columns: number;
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
}

export interface RenderParamUpdate {
  type: RenderParamKey | "all" | "load";
  value: number | RenderParams;
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
    case RenderParamKey.all:
    case "all":
      return action.value as RenderParams;
    case "load":
      const v = (action.value as unknown) as number[];
      state.valueScale = v[1];
      state.valueOffset = v[2];
      state.lightnessScale = v[3];
      state.lightnessOffset = v[4];
      state.alphaScale = v[5];
      state.alphaOffset = v[6];
      state.warpScale = v[7];
      state.warpOffset = v[8];
      state.scaleScale = v[9];
      state.scaleOffset = v[10];
      state.period = v[11];
      state.colorCycle = v[12];
      return state;
  }
};
