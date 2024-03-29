import React, { useReducer, useEffect, useMemo, useRef } from "react";
import { RouteProps } from "../../types/types";
import { PpsController, ppsRenderParamsReducer } from "../../gfx/pps/params";
import { RenderParams, PPS } from "../../gfx/pps/pps";
import { PPSMode } from "../../gfx/pps/pps";
import { XRManager } from "../../gfx/xr/manager";
import { useSetRecoilState } from "recoil";
import { xrManagerState } from "../XRButton";

interface Props extends RouteProps {
  controller: PpsController;
  mode?: PPSMode;
}

export const useController = (init: RenderParams) => {
  const [params, update] = useReducer(ppsRenderParamsReducer, init);
  return useMemo(() => new PpsController(params, update), [params, update]);
};

const Particle: React.FC<Props> = (props) => {
  const { canvas, controller, setFrameRate, setErrorState, mode, audio } =
    props;

  const setXRManager = useSetRecoilState(xrManagerState);

  const isInit = Boolean(canvas.current);

  const ppsRef = useRef<PPS | null>(null);
  if (ppsRef.current) {
    ppsRef.current.setParams(controller.params);
  }

  useEffect(() => {
    const currentAudio = audio.audio;
    if (!canvas.current) return;
    currentAudio.start(
      (ready) =>
        // fixme: set some warning state in the app
        !ready && console.error("Vuzic requires acess to your microphone!")
    );

    try {
      const pps = new PPS(
        canvas.current,
        controller.params,
        (p: PPS) => {
          if (!currentAudio) return;
          const [drivers, hasUpdate] = currentAudio.getDrivers();
          if (hasUpdate) p.updateAudioDrivers(drivers);
        },
        mode
      );
      ppsRef.current = pps;

      const xrManager = new XRManager(pps, {});
      setXRManager(xrManager);

      const intv = setInterval(() => {
        const fr = pps.getFrameRate(1000);
        setFrameRate(fr);
      }, 1000);

      return () => {
        clearInterval(intv);
        pps.stop();
        if (currentAudio) currentAudio.stop();
      };
    } catch (e) {
      console.error(e);
      setErrorState(e as Error);
      throw e;
    }
    // run once to initialize PPS
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInit]);

  return null;
};

export default Particle;
