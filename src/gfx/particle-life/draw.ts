import { VertexArrayObject } from "../buffers";
import { drawWithProgram, RenderTarget } from "../graphics";
import {
  makeConfig,
  Program,
  ProgramType,
  ShaderSourceConfig,
} from "../program";
import { Texture } from "../textures";
import { Dims, setDimensions, uniform1f, uniform1i } from "../types";
import { TEX_WIDTH } from "./particleLife";

const shaders = (): ShaderSourceConfig[] => [
  {
    type: "vertex",
    source: `#version 300 es
precision mediump float;

#define TEX_WIDTH ${TEX_WIDTH}

uniform isampler2D tex_positions;
uniform isampler2D tex_types;
uniform sampler2D tex_colors;
uniform int num_particles;
uniform float point_size;

out vec4 color;

void main() {
  int w = min(num_particles, TEX_WIDTH);
  ivec2 index = ivec2(gl_VertexID % w, gl_VertexID / w);
  
  ivec3 ipos = texelFetch(tex_positions, index, 0).xyz;
  vec4 pos = vec4(
    intBitsToFloat(ipos.x),
    intBitsToFloat(ipos.y),
    intBitsToFloat(ipos.z),
    1.0
  );
  gl_Position = pos;
  
  int ptype = texelFetch(tex_types, index, 0).x;
  color = texelFetch(tex_colors, ivec2(ptype, 0), 0);

  gl_PointSize = point_size;
}
`,
  },
  {
    type: "fragment",
    source: `#version 300 es
precision mediump float;

// uniform sampler2D tex_background;
uniform float sharpness; // range[0.0, 1.0]

in vec4 color;
out vec4 frag_color;

void main() {
  float psize = gl_PointSize;
  vec2 p = 2.0 * gl_PointCoord.xy - 1.0;
  float r = length(p);
  float a = smoothstep(psize * sharpness, psize, r);
  // vec4 bg_color = texture(tex_background, gl_FragCoord.xy);
  // frag_color = mix(color, bg_color, a);
  frag_color = vec4(color.rgb, a);
}
`,
  },
];

interface Input {
  numParticles: number;
  positions: Texture;
  types: Texture;
  colors: Texture;
  pointSize: number;
  sharpness: number;
}

export class Draw {
  private static config = makeConfig({
    sources: shaders(),
    textures: {
      tex_positions: { binding: 0 },
      tex_types: { binding: 1 },
      tex_colors: { binding: 2 },
    },
    uniforms: {
      num_particles: { bindFunc: uniform1i },
      point_size: { bindFunc: uniform1f },
      sharpness: { bindFunc: uniform1f },
    },
  });

  private readonly program: ProgramType<typeof Draw.config>;
  private points: VertexArrayObject;

  constructor(private gl: WebGL2RenderingContext, stateSize: Dims) {
    const config = { ...Draw.config };
    this.program = new Program(gl, config);
    const length = stateSize.width * stateSize.height;
    this.points = new VertexArrayObject(gl, {
      offset: 0,
      length,
      drawMode: "points",
      attriutes: [],
    });
  }

  public render(input: Input, target: RenderTarget) {
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    drawWithProgram(
      this.program,
      () => {
        const { uniforms, textures } = this.program;
        uniforms.num_particles.bind(input.numParticles);
        uniforms.point_size.bind(input.pointSize);
        uniforms.sharpness.bind(input.sharpness);
        textures.tex_positions.bind(input.positions);
        textures.tex_types.bind(input.types);
        textures.tex_colors.bind(input.colors);
      },
      target,
      [this.points]
    );
  }
}
