import { quadVertShader } from "../misc/quadvert";
import { makeConfig, ShaderSourceConfig } from "../program";

const shaders = (): ShaderSourceConfig[] => [
  quadVertShader,
  {
    type: "fragment",
    source: "",
  },
];

export class UpdateCoefficients {
  //     private static config = makeConfig({
  //     });
}
