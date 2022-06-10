import { VertexArrayObject } from "../buffers";
import { drawWithProgram, RenderTarget } from "../graphics";
import { makeQuadVao, quadVertAttributes, quadVertShader } from "./quadvert";
import {
  makeConfig,
  Program,
  ProgramType,
  ShaderSourceConfig,
} from "../program";
import { uniform1f } from "../types";
import { TextureObject } from "../textures";

const shaders = (): ShaderSourceConfig[] => [
  quadVertShader,
  {
    type: "fragment",
    source: `#version 300 es
precision mediump float;

uniform sampler2D tex_last_frame;
uniform float fade;

out vec4 color;

void main() {
  color = fade * texture(tex_last_frame, gl_FragCoord.xy).rgb;
}
    `,
  },
];

interface Input {
  fade: number;
  image: TextureObject;
}

export class Fade {
  private static config = makeConfig({
    sources: shaders(),
    attributes: quadVertAttributes,
    textures: {
      tex_last_frame: { binding: 0 },
    },
    uniforms: {
      fade: { bindFunc: uniform1f },
    },
  });

  private readonly program: ProgramType<typeof Fade.config>;
  private quad: VertexArrayObject;

  constructor(private gl: WebGL2RenderingContext) {
    const config = { ...Fade.config };
    this.program = new Program(gl, config);
    this.quad = makeQuadVao(gl);
  }

  public render(input: Input, target: RenderTarget) {
    this.gl.disable(this.gl.BLEND);
    drawWithProgram(
      this.program,
      () => {
        this.program.uniforms.fade.bind(input.fade);
        this.program.textures.tex_last_frame.bind(input.image);
      },
      target,
      [this.quad]
    );
  }
}
