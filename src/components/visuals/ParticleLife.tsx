import React, { useEffect, useMemo } from "react";
import Universe, {
  ParticleLifeController,
} from "../../gfx/particle-life/particleLife";
import { RouteProps } from "../../types/types";
import "../../gfx/particle-life/tweakpane.css";

export const useController = () =>
  useMemo(() => new ParticleLifeController(), []);

interface Props extends RouteProps {
  controller: ParticleLifeController;
}

const ParticleLife: React.FC<Props> = (props) => {
  const { canvas, controller, audio, setErrorState } = props;

  const isInit = Boolean(canvas.current);
  console.log(isInit);

  useEffect(() => {
    if (!canvas.current) return;
    try {
      const particleLife = new Universe(
        controller,
        canvas.current,
        audio.audio
      );
      return () => {
        particleLife.stop();
      };
    } catch (e) {
      console.log(e);
      setErrorState(e as Error);
    }
  }, [isInit]);

  return null;
};

export default ParticleLife;
