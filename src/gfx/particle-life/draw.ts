import { VertexArrayObject } from "../buffers";
import { drawWithProgram, RenderTarget } from "../graphics";
import {
  makeConfig,
  Program,
  ProgramType,
  ShaderSourceConfig,
} from "../program";
import { Texture } from "../textures";
import { uniform1f, uniform1i } from "../types";
// import { TEX_WIDTH } from "./particleLife";

const shaders = (): ShaderSourceConfig[] => [
  {
    type: "vertex",
    source: `#version 300 es
precision mediump float;
precision highp isampler2D;

#define TEX_WIDTH 1024

uniform isampler2D tex_positions;
uniform isampler2D tex_types;
uniform sampler2D tex_colors;
uniform int num_particles;
uniform float point_size;

out vec4 color;
out float v_point_size;

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
  gl_Position = 2.0 * pos - 1.0;
  
  int ptype = texelFetch(tex_types, index, 0).x;
  color = texelFetch(tex_colors, ivec2(ptype, 0), 0);

  v_point_size = point_size;
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
in float v_point_size;
out vec4 frag_color;

void main() {
  vec2 p = 2.0 * gl_PointCoord.xy - 1.0;
  // float psize = v_point_size;
  float r = length(p);
  float a = 1.0 - smoothstep(sharpness, 1.0, r);
  // float a = 1.0 - pow(r, 2.0*sharpness);
  // vec4 bg_color = texture(tex_background, gl_FragCoord.xy);
  // frag_color = mix(color, bg_color, a);
  frag_color = a * vec4(color.rgb, 1.0);
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

  constructor(
    private gl: WebGL2RenderingContext,
    private numParticles: number
  ) {
    const config = { ...Draw.config };
    this.program = new Program(gl, config);
    this.points = new VertexArrayObject(gl, {
      offset: 0,
      length: numParticles,
      drawMode: "points",
      attriutes: [],
    });
  }

  public resize(numParticles: number) {
    this.numParticles = numParticles;
    this.points = new VertexArrayObject(this.gl, {
      offset: 0,
      length: numParticles,
      drawMode: "points",
      attriutes: [],
    });
  }

  public render(input: Input, target: RenderTarget) {
    if (this.numParticles !== input.numParticles) {
      this.resize(input.numParticles);
    }
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
