import { VertexArrayObject } from "../buffers";
import { drawWithProgram, RenderTarget } from "../graphics";
import {
  makeQuadVao,
  quadVertAttributes,
  quadVertShader,
} from "../misc/quadvert";
import {
  makeConfig,
  Program,
  ProgramType,
  ShaderSourceConfig,
} from "../program";
import { Texture } from "../textures";
import { Dims, setDimensions, uniform1f, uniform1i } from "../types";
import { TEX_WIDTH } from "./particleLife";

const shaderSrc = `#version 300 es

precision highp float;
precision highp int;
precision highp isampler2D;

uniform isampler2D texPositions;
uniform isampler2D texVelocities;
uniform isampler2D texTypes;
uniform isampler2D texInteraction;

#define TEX_WIDTH ${TEX_WIDTH}
uniform int uNumParticles;
uniform float uFriction;

layout(location = 0) out ivec3 position;
layout(location = 1) out ivec3 velocity;

#define R_SMOOTH 2.0

vec3 fetch(in isampler2D tex, in ivec2 index) {
    ivec3 ipos = texelFetch(tex, index, 0).xyz;
    return vec3(intBitsToFloat(ipos.x), intBitsToFloat(ipos.y), intBitsToFloat(ipos.z));
}

vec3 wrap(in vec3 X) {
    vec3 w = mod(X, 1.0);
    return mix(w, w + 1.0, lessThan(w, 0.0));
}

vec3 wrapDistance(vec3 r) {
  vec3 a = abs(r);
  return sign(r) * mix(a, 1.0 - a, greaterThan(a, vec3(0.5)));
}

struct Particle {
    vec3 pos;
    vec3 vel;
    int type;
};

struct Interaction {
    float attraction;
    float minR;
    float maxR;
}

Particle fetchParticle(in ivec2 index) {
    Particle p;
    p.pos = fetch(texPositions, index);
    p.vel = fetch(texVelocities, index);
    p.type = texelFetch(texTypes, index, 0).x;
    return p;
}

Interaction fetchInteraction(in Particle p, in particle q) {
    vec3 ntr = fetch(texInteraction, ivec2(p.type, q.type));
    return Interaction(ntr.x, ntr.y, ntr.z);
}

ivec3 toIEEE(in vec3 v) {
  return ivec3(floatBitsToInt(v.x), floatBitsToInt(v.y), floatBitsToInt(v.z));
}

void main() {
    ivec2 index = ivec2(gl_FragCoord.xy);
    
    int particleNum = index.y * TEX_WIDTH + index.x;
    if (particleNum >= uNumParticles) {
      position = ivec3(0);
      velocity = ivec3(0);
      return;
    }

    int width = min(uNumParticles, TEX_WIDTH);
    int height = uNumParticles / TEX_WIDTH;

    Particle p = fetchParticle(index);

    for (int i = 0; i < width; i++) {
        for (int j = 0; j < height; j++) {
            ivec2 qIndex = ivec2(i, j);
            if (qIndex == index) continue;

            Particle q = fetchParticle(qIndex);
            Interaction nt = fetchInteraction(p, q);

            vec3 d = wrapDistance(q.pos - p.pos);
            float r2 = dot(d, d);
            if (r2 > nt.maxR * nt.maxR || r2 < 0.01) continue;
            float r = sqrt(r2);

            float f;
            if (r < nt.minR) {
                float nu = 2.0 * abs(r - 0.5 * (nt.maxR + nt.minR));
                float de = nt.maxR - nt.minR;
                f = nt.attract * (1.0 - nu / de);
            } else {
                f = R_SMOOTH * nt.minR * (1.0 / (nt.minR + R_SMOOTH) - 1.0 / (r + R_SMOOTH));
            }

            p.vel += f * d;
        }
    }

    p.pos += p.vel;
    p.pos = wrap(p.pos);
    p.vel *= vec3(1.0 - uFriction);

    position = toIEEE(p.pos);
    velocity = toIEEE(p.vel);
}`;

const shaders = (): ShaderSourceConfig[] => [
  quadVertShader,
  { type: "fragment", source: shaderSrc },
];

interface Input {
  numParticles: number;
  friction: number;
  positions: Texture;
  velocities: Texture;
  types: Texture;
  interaction: Texture;
}

export class Iterate {
  private static config = makeConfig({
    sources: shaders(),
    attributes: quadVertAttributes,
    textures: {
      texPosition: { binding: 0 },
      texVelocities: { binding: 1 },
      texTypes: { binding: 2 },
      texInteraction: { binding: 3 },
    },
    uniforms: {
      uNumParticles: { bindFunc: uniform1i },
      uFriction: { bindFunc: uniform1f },
    },
  });

  private readonly program: ProgramType<typeof Iterate.config>;
  private quad: VertexArrayObject;

  constructor(private gl: WebGL2RenderingContext) {
    const config = { ...Iterate.config };
    this.program = new Program(gl, config);
    this.quad = makeQuadVao(gl);
  }

  public render(input: Input, target: RenderTarget) {
    this.gl.disable(this.gl.BLEND);

    drawWithProgram(
      this.program,
      () => {
        const { uniforms, textures } = this.program;
        uniforms.uFriction.bind(input.friction);
        uniforms.uNumParticles.bind(input.numParticles);
        textures.texPosition.bind(input.positions);
        textures.texVelocities.bind(input.velocities);
        textures.texTypes.bind(input.types);
        textures.texInteraction.bind(input.interaction);
      },
      target,
      [this.quad]
    );
  }
}
