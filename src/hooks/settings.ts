import React, { useRef, useEffect } from "react";

import { AudioController } from "./audio";
import { WarpController, warpRenderParamsInit } from "../gfx/warpgrid/params";
import { PpsController } from "../gfx/pps/params";
import { useController as useWarpController } from "../components/visuals/Warp";
import { useController as usePpsController } from "../components/visuals/Particles";
import { defaultParams as ppsDefaultParams } from "../gfx/pps/pps";
import { VisualOptions } from "../types/types";
import { AudioProcessorParams } from "../audio/audio";
import { Dims } from "../gfx/types";

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

export interface ExportSettings {
  visual?: VisualOptions;
  params?: unknown;
  audio?: AudioProcessorParams;
}

export class Manager {
  private controllers = new Map<VisualOptions, RenderController>();
  constructor(
    readonly audio: AudioController,
    rc: {
      visual: VisualOptions;
      rc: RenderController;
    }[]
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
      this.audio.update({ type: "load", value: settings.audio });
    }
  }
}

export const useSettingsManager = (
  audio: AudioController,
  audioSize: Dims,
  gridSize: Dims
): [
  React.MutableRefObject<WarpController | null>,
  React.MutableRefObject<PpsController | null>,
  Manager
] => {
  const warpControllerRef = useRef<WarpController | null>(null);
  const warpController = useWarpController(
    warpRenderParamsInit(audioSize, gridSize)
  );
  useEffect(() => {
    warpControllerRef.current = warpController;
  }, [warpController]);

  const ppsControllerRef = useRef<PpsController | null>(null);
  const ppsController = usePpsController(ppsDefaultParams);
  useEffect(() => {
    ppsControllerRef.current = ppsController;
  }, [ppsController]);

  return [
    warpControllerRef,
    ppsControllerRef,
    new Manager(audio, [
      { visual: "warp", rc: warpController },
      { visual: "pps", rc: ppsController },
      { visual: "pps3", rc: ppsController },
    ]),
  ];
};
