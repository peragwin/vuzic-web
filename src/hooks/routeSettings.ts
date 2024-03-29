import { useEffect } from "react";
import { Base64 } from "js-base64";

import { VisualOptions } from "../types/types";
import { AudioProcessorParams } from "../audio/audio";
import {
  ImportRenderParams as PpsImportRenderParams,
  fromExportPpsSettings,
  ExportPpsSettings,
} from "../gfx/pps/params";
import {
  ImportRenderParams as WarpImportRenderParams,
  fromExportWarpSettings,
  ExportWarpSettings,
} from "../gfx/warpgrid/params";
import { ExportAudioSettings, fromExportAudioSettings } from "../audio/audio";
import { Manager } from "./settings";
import { ParticleLifeController } from "../gfx/particle-life/particleLife";

type ImportRenderParams =
  | WarpImportRenderParams
  | PpsImportRenderParams
  | object;

interface Settings {
  audio?: AudioProcessorParams;
  params?: ImportRenderParams;
}

type ExportSettings = [string, ...Array<any>];

function decodeSettings<T extends ExportSettings>(enc: string) {
  try {
    const dec = Base64.decode(enc);
    return JSON.parse(dec) as T;
  } catch (e) {
    console.error("failed to parse settings");
  }
}

const fromVisualSettings = (visual: VisualOptions, dec: ExportSettings) => {
  switch (visual) {
    case "pps":
    case "pps3":
      return fromExportPpsSettings(dec as ExportPpsSettings);
    case "warp":
      return fromExportWarpSettings(dec as ExportWarpSettings);
    case "particleLife":
      return dec;
  }
};

const getSettingsFromRoute = (visual: VisualOptions | undefined) => {
  if (!visual) return;
  const ret: Settings = {};

  const query = new URLSearchParams(window.location.search);
  let enc = query.get("audio");
  if (enc) {
    const dec = decodeSettings<ExportAudioSettings>(enc);
    if (dec) ret.audio = fromExportAudioSettings(dec);
  }
  enc = query.get("params");
  if (enc) {
    const dec = decodeSettings<ExportSettings>(enc);
    if (dec) {
      ret.params = fromVisualSettings(visual, dec);
    }
  }
  return ret;
};

export const useSettingsFromRoute = (
  visual: VisualOptions | undefined,
  manager: Manager
) => {
  useEffect(() => {
    const settings = getSettingsFromRoute(visual);
    if (settings) {
      manager.update({
        visual,
        params: settings.params,
        audio: settings.audio,
      });
    }
    // useSettingsFromRoute is meant to load settings once when the app mounts.
    // therefore, visual and manager are not captured in the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};

export const setUrlParam = (name: string, value: any) => {
  // console.log("value to encode", JSON.stringify(value));
  const enc = Base64.encodeURL(JSON.stringify(value));
  const query = new URLSearchParams(window.location.search);
  query.set(name, enc);
  window.history.pushState(
    null,
    "",
    `${window.location.pathname}?${query.toString()}`
  );
};
