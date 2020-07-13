import React, { useReducer, useEffect, useMemo } from "react";
import { RouteProps } from "../../types/types";
import { PpsController, ppsRenderParamsReducer } from "../../gfx/pps/params";
import { RenderParams, PPS } from "../../gfx/pps/pps";
import { PPSMode } from "../../gfx/pps/shaders";

interface Props extends RouteProps {
  controller: React.RefObject<PpsController>;
  mode?: PPSMode;
}

export const useController = (init: RenderParams) => {
  const [params, update] = useReducer(ppsRenderParamsReducer, init);
  return useMemo(() => new PpsController(params, update), [params, update]);
};

const Particle: React.FC<Props> = (props) => {
  const { canvas, controller, setFrameRate, setErrorState, mode } = props;

  const isInit = Boolean(canvas.current);

  useEffect(() => {
    if (!canvas.current) return;

    try {
      const pps = new PPS(
        canvas.current,
        (p: PPS) => {
          if (!controller.current) return;

          const params = controller.current.params;
          p.setParams(params);
        },
        mode
      );

      const intv = setInterval(() => {
        const fr = pps.getFrameRate(1000);
        setFrameRate(fr);
      }, 1000);

      return () => {
        clearInterval(intv);
        pps.stop();
      };
    } catch (e) {
      console.error(e);
      setErrorState(e);
    }
    // run once to initialize PPS
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInit]);

  return null;
};

export default Particle;
