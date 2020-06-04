import { AudioProcessorParams, AudioProcessor } from "../audio/audio";

export interface ParamSliderConfig {
  title: string;
  min: number;
  max: number;
  step: number;
  update: (e: React.ChangeEvent<{}>, value: number) => void;
}

export interface RenderController {
  config(): ParamSliderConfig[];
  values(): any[];
  params: any;
  update: (action: { type: "all" | "load"; value: any }) => void;
  export: () => any[];
}

export type VisualOptions = "warp" | "pps";

export interface ExportSettings {
  visual?: VisualOptions;
  params?: unknown;
  audio?: AudioProcessorParams;
}

export class Manager {
  private controllers = new Map<VisualOptions, RenderController>();
  constructor(
    readonly audio: AudioProcessor,
    rc: { visual: VisualOptions; rc: RenderController }[]
  ) {
    for (let c of rc) {
      this.controllers.set(c.visual, c.rc);
    }
  }

  public controller(visual: VisualOptions) {
    const rc = this.controllers.get(visual);
    if (!rc) throw new Error(`invalid visual: ${visual}`);
    return rc;
  }

  public update(settings: ExportSettings) {
    if (settings.visual) {
      const rc = this.controller(settings.visual);
      rc.update({ type: "load", value: settings.params });
    }
    if (settings.audio) {
      this.audio.setAudioParams(settings.audio);
    }
  }
}
