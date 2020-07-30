import {
  ShaderSourceConfig,
  makeConfig,
  ProgramType,
  Program,
} from "../program";
import {
  uniform2f,
  uniform1i,
  uniform3f,
  uniform1f,
  setDimensions,
  Dims,
} from "../types";
import { RenderTarget, drawWithProgram } from "../graphics";
import { Texture } from "../textures";
import { makeQuadVao } from "../misc/quadvert";
import { VertexArrayObject } from "../buffers";

const shaders = (): ShaderSourceConfig[] => [
  {
    type: "vertex",
    source: `#version 300 es
precision mediump float;

in vec2 quad;

void main() {
  vec2 p = 2. * quad + 1.;
  gl_Position = vec4(p, 0., 1.);
}`,
  },
  {
    type: "fragment",
    source: `#version 300 es
#define PI 3.141592653589793

precision mediump float;

// .s is scale, .t is offset
struct ColorParams {
  vec2 valueScale;
  vec2 lightnessScale;
  vec2 alphaScale;
  float period;
  float cycle;
};

uniform int uColumnIndex;
uniform vec2 uStateSize;
uniform ColorParams uColorParams;
uniform vec3 uGamma;
uniform sampler2D texHSLuv;
uniform sampler2D texAmplitudes;
uniform sampler2D texDrivers;

out vec4 fragColor;

float sigmoid(in float x) {
  return (1. + x / (1. + abs(x))) / 2.;
}

vec4 getHSLuv(in float amp, in float ph, in float phi) {
  vec2 vs = uColorParams.valueScale;
  vec2 ls = uColorParams.lightnessScale;
  vec2 as = uColorParams.alphaScale;

  float hue = (0.5 * (uColorParams.cycle * phi + ph) / PI);
  // texture can wrap so no mod
  // hue -= 0.5 * (sign(mod(hue, 1.)) - 1.);

  float val = ls.s * sigmoid(vs.s * amp + vs.t) + ls.t;
  float alpha = sigmoid(as.s * amp + as.t);

  vec3 color = texture(texHSLuv, vec2(hue, val)).rgb;
  color = pow(color, uGamma);
  return vec4(color, alpha);
}

float getAmp(in ivec2 index) {
  index.x = uColumnIndex - index.x;
  if (index.x < 0) index.x += int(uStateSize.x); 
  return texelFetch(texAmplitudes, ivec2(index.y, index.x), 0).r;
}

// .s = scale, .t = energy
vec2 getDrivers(in ivec2 index) {
  return texelFetch(texDrivers, index, 0).rg;
}

void main () {
  float x = gl_FragCoord.x;
  float ws = (2. * PI) / uColorParams.period;
  float phi = x * ws;

  float decay = x / uStateSize.x;
  decay = 1. - decay * decay;

  ivec2 index = ivec2(gl_FragCoord.x, gl_FragCoord.y);
  float amp = getAmp(index);
  vec2 drivers = getDrivers(ivec2(gl_FragCoord.y, 0));

  amp = drivers.s * (amp - 1.);
  vec4 color = getHSLuv(amp, drivers.t, phi);
  fragColor = color * vec4(vec3(decay), 1.);
}`,
  },
];

interface Input {
  stateSize: Dims;
  columnIndex: number;
  gamma: number[];
  valueScale: number[];
  lightnessScale: number[];
  alphaScale: number[];
  period: number;
  cycle: number;
  amplitudes: Texture;
  drivers: Texture;
  hsluv: Texture;
}

export class UpdatePass {
  static config = makeConfig({
    sources: shaders(),
    attributes: {
      quad: {},
    },
    textures: {
      texHSLuv: { binding: 0 },
      texAmplitudes: { binding: 1 },
      texDrivers: { binding: 2 },
    },
    uniforms: {
      uStateSize: { bindFunc: setDimensions },
      uColumnIndex: { bindFunc: uniform1i },
      uGamma: { bindFunc: uniform3f },
      "uColorParams.valueScale": { bindFunc: uniform2f },
      "uColorParams.lightnessScale": { bindFunc: uniform2f },
      "uColorParams.alphaScale": { bindFunc: uniform2f },
      "uColorParams.period": { bindFunc: uniform1f },
      "uColorParams.cycle": { bindFunc: uniform1f },
    },
  });

  private readonly program: ProgramType<typeof UpdatePass.config>;
  private quad: VertexArrayObject;

  constructor(private gl: WebGL2RenderingContext) {
    const config = { ...UpdatePass.config };
    const program = new Program(gl, config);
    this.program = program;
    this.quad = makeQuadVao(gl);
  }

  public render(input: Input, target: RenderTarget) {
    this.gl.disable(this.gl.BLEND);

    // TODO: figure out how to automate all these bind steps -- the Input type should be
    // generic and have a "uniforms", "textures", etc fields that match the names in the program
    // gl blend mode could be set in the constructor

    drawWithProgram(
      this.program,
      () => {
        this.program.uniforms["uColorParams.alphaScale"].bind(input.alphaScale);
        this.program.uniforms["uColorParams.cycle"].bind(input.cycle);
        this.program.uniforms["uColorParams.lightnessScale"].bind(
          input.lightnessScale
        );
        this.program.uniforms["uColorParams.period"].bind(input.period);
        this.program.uniforms["uColorParams.valueScale"].bind(input.valueScale);
        this.program.uniforms.uColumnIndex.bind(input.columnIndex);
        this.program.uniforms.uGamma.bind(input.gamma);
        this.program.uniforms.uStateSize.bind(input.stateSize);
        this.program.textures.texAmplitudes.bind(input.amplitudes);
        this.program.textures.texDrivers.bind(input.drivers);
        this.program.textures.texHSLuv.bind(input.hsluv);
      },
      target,
      [this.quad]
    );
  }
}
