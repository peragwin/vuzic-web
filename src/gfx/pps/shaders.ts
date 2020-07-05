import { ShaderConfig } from "../graphics";

const drawVertSrc = `#version 300 es
precision mediump float;
precision mediump usampler2D;
precision mediump isampler2D;

uniform isampler2D texPositions;
uniform isampler2D texColors;
uniform sampler2D texPalette;
uniform ivec2 uStateSize;
uniform float uPointSize;

out vec4 color;

void main() {
  int w = uStateSize.x;
  ivec2 index = ivec2(gl_VertexID % w, gl_VertexID / w);
  ivec2 ipos = texelFetch(texPositions, index, 0).xy;
  vec2 position = vec2(intBitsToFloat(ipos.x), intBitsToFloat(ipos.y));
  gl_Position = vec4(position, 0., 1.);

  float cval = intBitsToFloat(texelFetch(texColors, index, 0).r);
  // cval = .00000000000000001 * cval + 0.0001;
  color = texture(texPalette, vec2(cval, 0.0));
  // + vec4(1.0, 0.0, 0.0, 1.0);

  gl_PointSize = uPointSize;
}
`;

export const drawVertShader = (gl: WebGL2RenderingContext) =>
  new ShaderConfig(drawVertSrc, gl.VERTEX_SHADER, [], []);

const drawFragSrc = `#version 300 es
precision mediump float;

uniform float uAlpha;

in vec4 color;
out vec4 fragColor;

void main() {
  vec2 p =  2. * gl_PointCoord.xy - 1.;
  float r = length(p);
  float a = 1. - r*r;
  fragColor = vec4(a * color.rgb, uAlpha);
}
`;

export const drawFragShader = (gl: WebGL2RenderingContext) =>
  new ShaderConfig(drawFragSrc, gl.FRAGMENT_SHADER);

const quadVertSrc = `#version 300 es
precision highp float;
precision highp int;

uniform ivec2 uStateSize;

in vec2 quad;

void main() {
  vec2 p = 2. * quad + 1.;
  gl_Position = vec4(p, 0., 1.);
}`;

export const updateVertShader = (gl: WebGL2RenderingContext) =>
  new ShaderConfig(quadVertSrc, gl.VERTEX_SHADER);

const updateFragSrc = `#version 300 es
precision highp float;
precision highp int;
precision highp isampler2D;
precision highp sampler2D;

uniform isampler2D texPositions;
uniform isampler2D texVelocities;
uniform isampler2D texSortedPositions;
uniform isampler2D texCountedPositions;
uniform isampler2D texGradientField;

uniform ivec2 uStateSize;
uniform int uGridSize;
uniform float uAlpha;
uniform float uBeta;
uniform float uRadius;
uniform float uVelocity;
uniform float uRadialDecay;
uniform uColorThresholdBlock {
  float uColorThresholds[5];
};

layout(location = 0) out ivec2 position;
layout(location = 1) out ivec2 velocity;
layout(location = 2) out int color;

struct Bucket {
  int count;
  int index;
};

vec2 fetch(in isampler2D tex, in ivec2 index) {
  ivec2 ipos = texelFetch(tex, index, 0).xy;
  return vec2(intBitsToFloat(ipos.x), intBitsToFloat(ipos.y));
}

Bucket fetchCount(in isampler2D tex, in ivec2 cell) {
  ivec2 count = texelFetch(tex, cell, 0).xy;
  Bucket b;
  b.count = count.x;
  b.index = count.y - count.x;
  return b;
}

vec2 fetchGradientValue(in vec2 xy) {
  vec2 uv = 0.5 * (xy + 1.);
  ivec2 di = texture(texGradientField, uv).rg;
  return vec2(intBitsToFloat(di.x), intBitsToFloat(di.y));
}

ivec2 cellCoord(in vec2 pos, float gridSize) {
  vec2 ipos = floor((pos + 1.) / 2. * gridSize);
  return ivec2(ipos);
}

ivec2 wrap(in ivec2 coord, int gridSize) {
  return coord % ivec2(gridSize, gridSize);
}

int cellIndex(in ivec2 coord, int gridSize) {
  return coord.x + coord.y * gridSize;
}

vec2 fetchIndex(in isampler2D tex, in int index) {
  ivec2 findex = ivec2(index % uStateSize.x, index / uStateSize.x);
  return fetch(tex, findex);
}

vec2 wrapDistance(vec2 r) {
  vec2 a = abs(r);
  a = step(vec2(1.), a) * (2. - a) + step(a, vec2(1.)) * a;
  return sign(r) * a;
}

// head-twisty logic for (r > 0 && lenght(r) <= radius) && (ang < 0 ? (1, 0) : (0, 1))
vec2 countNeighbor(in vec2 aPos, in vec2 aVel, in vec2 bPos, float radius) {
  vec2 r = aPos - bPos;
  // r = wrapDistance(r);
  float ang = aVel.x * r.y - aVel.y * r.x;
  float rl = r.x*r.x + r.y*r.y;
  float r2 = radius*radius;
  float damp = 1. - uRadialDecay * rl;
  damp = damp * step(0., damp);
  return damp * step(rl, r2) * (vec2(-1., 1.) * sign(ang) + 1.) / 2.;
}

vec2 countNeighbors(in ivec2 aIndex, in vec2 aPos, in vec2 aVel) {
  vec2 count = vec2(0.);
  float gridSize = float(uGridSize);
  ivec2 aCell = cellCoord(aPos, gridSize);
  ivec2 bCell;
  Bucket bucket;
  ivec2 bIndex;
  vec2 bPos;

  // gridRadius is how many extra cells we need to scan in addition to our own
  int gridRadius = int(ceil(uRadius * gridSize / 2.));

  // apparently this can be a lot better if its using a lut to avoid branching
  for (int x = -gridRadius; x <= gridRadius; x++) {
    for (int y = -gridRadius; y <= gridRadius; y++) {
      bCell = wrap(aCell + ivec2(x, y), uGridSize);
      bucket = fetchCount(texCountedPositions, bCell);

      for (int i = 0; i < bucket.count; i++) {
        bPos = fetchIndex(texSortedPositions, bucket.index+i);

        // increment left or right count if B is within uRadius of A
        count += countNeighbor(aPos, aVel, bPos, uRadius);
      }
    }
  }

  return count;
}

float deltaTheta(vec2 count) {
  float sum = count.x + count.y;
  float diff = count.y - count.x;
  return uAlpha + uBeta * sum * sign(diff);
}

mat2 rotate2d(float angle){
  return mat2(cos(angle), -sin(angle),
              sin(angle),  cos(angle));
}

vec2 integrate(in vec2 pos, in vec2 vel) {
  vec2 avel = vel + fetchGradientValue(pos);
  pos += avel * uVelocity;
  // return pos;
  vec2 apos = pos + 1.0;
  return mod(apos, 2.0) - 1.0;
}

float getColor(in float count) {
  float[] t = uColorThresholds;

  /*
    using 5th order polynomial interpolation.
    this is suuuper cool but sometimes numerically unstable,
    i'm mixing it with simple lerp between points and this seems alright
  */

  // y0 here is just 0.0
  // float l0 = (count - t[0]) * (count - t[1]) * (count - t[2]) * (count - t[3])
  //          / (t[0] * t[1] * t[2] * t[3]);

  float l1 = count * (count - t[1]) * (count - t[2]) * (count - t[3]) //* (count - 1.)
           / (t[0] * (t[0] - t[1]) * (t[0] - t[2]) * (t[0] - t[3]) ); // * (t[0] - 1.));
  float l2 = count * (count - t[0]) * (count - t[2]) * (count - t[3]) //* (count - 1.)
           / (t[1] * (t[1] - t[0]) * (t[1] - t[2]) * (t[1] - t[3]) ); // * (t[1] - 1.));
  float l3 = count * (count - t[0]) * (count - t[1]) * (count - t[3]) //* (count - 1.)
           / (t[2] * (t[2] - t[0]) * (t[2] - t[1]) * (t[2] - t[3]) ); // * (t[2] - 1.));
  float l4 = count * (count - t[0]) * (count - t[1]) * (count - t[2]) //* (count - 1.)
           / (t[3] * (t[3] - t[0]) * (t[3] - t[1]) * (t[3] - t[2]) ); // * (t[3] - 1.));

  // float l5 = count * (count - t[0]) * (count - t[1]) * (count - t[2]) * (count - t[3])
  //          / (1. * (1. - t[0]) * (1. - t[1]) * (1. - t[2]) * (1. - t[3]));

  float poly = clamp((0.2 * l1) + (0.4 * l2) + (0.6 * l3) + (0.8 * l4) * sign(l4), 0.0, 1.0);

  float lerp = (
    clamp( count         /  t[0]        , 0., 1.) +
    clamp((count - t[0]) / (t[1] - t[0]), 0., 1.) +
    clamp((count - t[1]) / (t[2] - t[1]), 0., 1.) +
    clamp((count - t[2]) / (t[3] - t[2]), 0., 1.) +
    clamp((count - t[3]) / (t[4] - t[3]), 0., 1.)
  ) / 5.;

  return mix(poly, lerp, 1.0);
}

ivec2 toIEEE(in vec2 v) {
  return ivec2(floatBitsToInt(v.x), floatBitsToInt(v.y));
}

void main() {
  ivec2 index = ivec2(gl_FragCoord.xy);
  vec2 pos = fetch(texPositions, index);
  vec2 vel = fetch(texVelocities, index);

  vec2 count = countNeighbors(index, pos, vel);
  float dtheta = deltaTheta(count);

  mat2 rot = rotate2d(dtheta);
  vel = rot * vel;
  pos = integrate(pos, vel);

  position = toIEEE(pos);
  velocity = toIEEE(vel);
  color = floatBitsToInt(getColor(count.x + count.y));
}
`;

export const updateFragShader = (gl: WebGL2RenderingContext) =>
  new ShaderConfig(updateFragSrc, gl.FRAGMENT_SHADER, [], []);
