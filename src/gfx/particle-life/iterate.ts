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
import { uniform1f, uniform1i } from "../types";

export const TEX_WIDTH = 1024;

const shaderSrc = `#version 300 es

precision highp float;
precision highp int;
precision highp isampler2D;

uniform isampler2D texPosition;
uniform isampler2D texVelocity;
uniform isampler2D texTypes;
uniform sampler2D texInteraction;

#define TEX_WIDTH ${TEX_WIDTH}
uniform int uNumParticles;
uniform float uFriction;

layout(location = 0) out ivec3 position;
layout(location = 1) out ivec3 velocity;

#define R_SMOOTH 0.001
#define R_0_FORCE 100.0

vec3 fetch(in isampler2D tex, in ivec2 index) {
    ivec3 ipos = texelFetch(tex, index, 0).xyz;
    return vec3(intBitsToFloat(ipos.x), intBitsToFloat(ipos.y), intBitsToFloat(ipos.z));
}

vec3 wrap(in vec3 X) {
    vec3 w = mod(X, 1.0);
    return mix(w, w + 1.0, lessThan(w, vec3(0.0)));
}

vec3 wrapDistance(vec3 r) {
  // return r;
  // r = mod(r, 100.0);
  r = mix(r, r - 1.0, greaterThan(r, vec3(0.5)));
  r = mix(r, r + 1.0, lessThan(r, vec3(-0.5)));
  return r;
  // vec3 a = abs(r);
  // return sign(r) * mix(a, 1.0 - a, greaterThan(a, vec3(0.5)));
}

struct Particle {
    vec3 pos;
    vec3 vel;
    int type;
};

struct Interaction {
    float attract;
    float minR;
    float maxR;
};

Particle fetchParticle(in ivec2 index) {
    Particle p;
    p.pos = fetch(texPosition, index);
    p.vel = fetch(texVelocity, index);
    p.type = texelFetch(texTypes, index, 0).x;
    return p;
}

Interaction fetchInteraction(in Particle p, in Particle q) {
    vec3 ntr = texelFetch(texInteraction, ivec2(p.type, q.type), 0).xyz;
    return Interaction(ntr.x, ntr.y, ntr.z);
}

ivec3 toIEEE(in vec3 v) {
  return ivec3(floatBitsToInt(v.x), floatBitsToInt(v.y), floatBitsToInt(v.z));
}

void main() {
    ivec2 index = ivec2(gl_FragCoord.xy);
    
    int particleNum = index.y * TEX_WIDTH + index.x;
    if (particleNum >= uNumParticles) {
      position = ivec3(floatBitsToInt(0.0));
      velocity = ivec3(floatBitsToInt(0.0));
      return;
    }

    int width = min(uNumParticles, TEX_WIDTH);
    int height = uNumParticles / TEX_WIDTH;
    if (uNumParticles % TEX_WIDTH != 0) {
      height += 1;
    }

    Particle p = fetchParticle(index);

    for (int i = 0; i < width; i++) {
        for (int j = 0; j < height; j++) {
            ivec2 qIndex = ivec2(i, j);
            if (qIndex == index) continue;
            int particleNum = qIndex.y * TEX_WIDTH + qIndex.x;
            if (particleNum >= uNumParticles) continue;

            Particle q = fetchParticle(qIndex);
            Interaction nt = fetchInteraction(p, q);

            vec3 d = wrapDistance(q.pos - p.pos);
            float r2 = dot(d, d);
            if (r2 > nt.maxR * nt.maxR || r2 < 0.0000001) continue;
            float r = sqrt(r2);

            float f;
            if (r > nt.minR && r < nt.maxR) {
                float nu = 2.0 * abs(r - 0.5 * (nt.maxR + nt.minR));
                float de = nt.maxR - nt.minR;
                f = nt.attract * (1.0 - nu / de);
            } else {
                f = R_0_FORCE * R_SMOOTH * nt.minR * (1.0 / (nt.minR + R_SMOOTH) - 1.0 / (r + R_SMOOTH));
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
      texVelocity: { binding: 1 },
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
        textures.texVelocity.bind(input.velocities);
        textures.texTypes.bind(input.types);
        textures.texInteraction.bind(input.interaction);
      },
      target,
      [this.quad]
    );
  }
}
