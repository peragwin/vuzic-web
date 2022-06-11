import { VertexArrayObject } from "../buffers";
import { drawWithProgram, RenderTarget } from "../graphics";
import { makeQuadVao, quadVertAttributes, quadVertShader } from "./quadvert";
import {
  makeConfig,
  Program,
  ProgramType,
  ShaderSourceConfig,
} from "../program";
import { uniform1f, uniform2f } from "../types";
import { TextureObject } from "../textures";

const shaders = (): ShaderSourceConfig[] => [
  quadVertShader,
  {
    type: "fragment",
    source: `#version 300 es
precision mediump float;

uniform sampler2D tex_last_frame;
uniform vec2 resolution;
uniform float fade;
uniform vec2 point;

out vec4 color;

void main() {
  vec4 oc = texture(tex_last_frame, gl_FragCoord.xy / resolution);
  vec3 fc = floor(fade * 256.0 * oc.rgb) / 256.0;
  color = vec4(fc, 1.0);

  // float c = gl_FragCoord.x / 2048.0;
  // float k = smoothstep(2.8, 3.0, length(point - gl_FragCoord.xy));
  // color = mix(vec4(0.0, 0.5, c, 1.0), vec4(fc, 1.0), k);
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
      resolution: { bindFunc: uniform2f },
      fade: { bindFunc: uniform1f },
      // point: { bindFunc: uniform2f },
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
        // const t = performance.now();
        // const x = (Math.cos(t / 200) / 4 + 0.5) * 1024;
        // const y = (Math.sin(t / 200) / 4 + 0.5) * 800;
        const w = input.image.cfg.width || 1.0;
        const h = input.image.cfg.height || 1.0;
        this.program.uniforms.resolution.bind([w, h]);
        // this.program.uniforms.point.bind([x, y]);
        this.program.uniforms.fade.bind(input.fade);
        this.program.textures.tex_last_frame.bind(input.image);
      },
      target,
      [this.quad]
    );
  }
}
