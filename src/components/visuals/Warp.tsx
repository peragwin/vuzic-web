import React, { useEffect, useReducer, useMemo, useRef } from "react";

import {
  RenderParams,
  renderParamReducer,
  WarpController,
} from "../../gfx/warpgrid/params";
import { WarpGrid } from "../../gfx/warpgrid/display";
import { RouteProps } from "../../types/types";
import { useSetRecoilState } from "recoil";
import { xrManagerState } from "../XRButton";
import { XRManager } from "../../gfx/xr/manager";

interface Props extends RouteProps {
  controller: WarpController;
}

export const useController = (init: RenderParams) => {
  const [params, update] = useReducer(renderParamReducer, init);
  return useMemo(() => new WarpController(params, update), [params, update]);
};

const Warp: React.FC<Props> = (props) => {
  const { canvas, audio, controller, setFrameRate, setErrorState } = props;

  const setXRManager = useSetRecoilState(xrManagerState);

  const isInit = Boolean(canvas.current);

  const warpRef = useRef<WarpGrid | null>(null);
  if (warpRef.current) {
    warpRef.current.setParams(controller.params);
  }

  useEffect(() => {
    const currentAudio = audio.audio;
    if (!canvas.current || !currentAudio) {
      return;
    }

    currentAudio.start(
      (ready) =>
        !ready &&
        setErrorState(
          new Error("Vuzic requires access to your microphone! 🎤🎶👩🏽‍🎤")
        )
    );

    try {
      const wg = new WarpGrid(
        canvas.current,
        controller.params,
        (w: WarpGrid) => {
          if (!currentAudio) return;
          const [drivers, hasUpdate] = currentAudio.getDrivers();
          if (hasUpdate) w.updateFromDrivers(drivers);
        }
      );
      warpRef.current = wg;

      const xrManager = new XRManager(wg, {});
      setXRManager(xrManager);

      const intv = setInterval(() => {
        const fr = wg.getFrameRate(1000);
        setFrameRate(fr);
      }, 1000);

      return () => {
        clearInterval(intv);
        wg.stop();
        if (currentAudio) currentAudio.stop();
      };
    } catch (e) {
      console.error(e);
      setErrorState(e as Error);
      throw e;
    }
    // run once to initialize warp
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInit]);

  return null;
};

export default Warp;
