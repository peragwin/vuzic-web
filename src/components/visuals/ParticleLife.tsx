import React, { useEffect, useMemo } from "react";
import Universe, {
  ParticleLifeController,
  RenderParams,
} from "../../gfx/particle-life/particleLife";
import { RouteProps } from "../../types/types";

export const useController = () =>
  useMemo(() => new ParticleLifeController(), []);

interface Props extends RouteProps {
  controller: ParticleLifeController;
}

const ParticleLife: React.FC<Props> = (props) => {
  const { canvas, controller, audio } = props;

  const isInit = Boolean(canvas.current);
  console.log(isInit);

  useEffect(() => {
    if (!canvas.current) return;
    const particleLife = new Universe(controller, canvas.current, audio.audio);
    return () => {
      particleLife.stop();
    };
  }, [isInit]);

  return null;
};

export default ParticleLife;
