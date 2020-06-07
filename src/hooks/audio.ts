import { useReducer, useRef, useEffect, useMemo } from "react";

import {
  AudioProcessorParams,
  audioParamReducer,
  AudioProcessor,
  AudioParamUpdate,
  FilterParams,
  audioParamsInit,
} from "../audio/audio";
import { setUrlParam } from "./routeSettings";

type VersionString = "v0.1";

export class AudioController {
  private version: VersionString = "v0.1";

  constructor(
    readonly audio: React.MutableRefObject<AudioProcessor | null>,
    readonly params: AudioProcessorParams,
    private updateState: React.Dispatch<AudioParamUpdate>
  ) {}

  // this is a hacky interceptor which will push the update to the URL parameter
  // as well updating the internal state. "load" is used to load URL parameters,
  // so don't bother updating it in that case.
  public update(action: AudioParamUpdate) {
    this.updateState(action);
    if (action.type !== "load") {
      const nextState = audioParamReducer(this.params, action);
      setUrlParam("audio", this.exportValues(nextState));
    }
  }

  public values = () => this.getValues(this.params);

  private getValues = (params: AudioProcessorParams) => {
    const filterParams = (fp: FilterParams) => [fp.tao, fp.gain];
    return [
      params.preemphasis,
      params.gainFilterParams.tao,
      params.gainFilterParams.gain,
      ...filterParams(this.params.gainFeedbackParams),
      ...filterParams(this.params.diffFilterParams),
      ...filterParams(this.params.diffFeedbackParams),
      ...filterParams(this.params.posScaleFilterParams),
      ...filterParams(this.params.negScaleFilterParams),
      params.diffGain,
      params.ampScale,
      params.ampOffset,
      params.sync,
      params.decay,
    ];
  };

  public export = () => [this.version as any].concat(this.values());
  private exportValues = (params: AudioProcessorParams) =>
    [this.version as any].concat(this.getValues(params));
}

interface Config {
  window: number;
  frame: number;
  buckets: number;
  length: number;
}

export const useAudio = (config: Config) => {
  const [params, update] = useReducer(audioParamReducer, audioParamsInit);

  // create a ref to hold the audio processor, and initialize it once
  const ap = useRef<AudioProcessor | null>(null);
  useEffect(() => {
    ap.current = new AudioProcessor(
      config.window,
      config.frame,
      config.buckets,
      config.length,
      params
    );
    // init audio processor only once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // trigger a callback to update the audio processor whenever params changes
  useEffect(() => {
    if (ap.current) ap.current.setAudioParams(params);
  }, [params]);

  return useMemo(() => new AudioController(ap, params, update), [
    params,
    update,
  ]);
};
