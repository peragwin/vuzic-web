import React, { useEffect, useReducer, useMemo } from "react";

import {
  RenderParams,
  renderParamReducer,
  WarpController,
  warpRenderParamsInit,
} from "../../gfx/warpgrid/params";
import { WarpGrid } from "../../gfx/warpgrid/display";
import { RouteProps } from "../../types/types";
import { useSetRecoilState } from "recoil";
import { xrManagerState } from "../XRButton";
import { XRManager } from "../../gfx/xr/manager";

interface Props extends RouteProps {
  controller: React.RefObject<WarpController>;
}

export const useController = (init: RenderParams) => {
  const [params, update] = useReducer(renderParamReducer, init);
  return useMemo(() => new WarpController(params, update), [params, update]);
};

const Warp: React.FC<Props> = (props) => {
  const { canvas, audio, controller, setFrameRate, setErrorState } = props;

  const setXRManager = useSetRecoilState(xrManagerState);

  const isInit = Boolean(canvas.current && audio.current);

  useEffect(() => {
    if (!canvas.current || !audio.current) {
      return;
    }

    audio.current.start(
      (ready) =>
        !ready &&
        setErrorState(
          new Error("Vuzic requires access to your microphone! 🎤🎶👩🏽‍🎤")
        )
    );

    try {
      const params = warpRenderParamsInit(
        audio.current.buckets,
        audio.current.length
      );
      const wg = new WarpGrid(canvas.current, params, (w: WarpGrid) => {
        if (!controller.current) return;
        if (!audio.current) return;

        const params = controller.current.params;
        const [drivers, hasUpdate] = audio.current.getDrivers();

        w.setParams(params);
        if (hasUpdate) w.updateFromDrivers(drivers);
      });

      const xrManager = new XRManager(wg, {});
      setXRManager(xrManager);

      const intv = setInterval(() => {
        const fr = wg.getFrameRate(1000);
        setFrameRate(fr);
      }, 1000);

      const currentAudio = audio.current;
      return () => {
        clearInterval(intv);
        wg.stop();
        if (currentAudio) currentAudio.stop();
      };
    } catch (e) {
      setErrorState(e);
      throw e;
    }
    // run once to initialize warp
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInit]);

  return null;
};

export default Warp;
