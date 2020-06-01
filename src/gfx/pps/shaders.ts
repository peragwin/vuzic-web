import { ShaderConfig } from "../graphics";

const drawVertSrc = `#version 300 es
precision mediump float;
precision mediump usampler2D;

uniform sampler2D texPositions;
uniform usampler2D texColors;
uniform sampler2D texPalette;
uniform ivec2 uStateSize;
uniform float uPointSize;

out vec4 color;

void main() {
    int w = uStateSize.x;
    ivec2 index = ivec2(gl_VertexID % w, gl_VertexID / w);
    vec2 position = texelFetch(texPositions, index, 0).xy;
    gl_Position = vec4(position, 0., 1.); //mix(vec4(position, 0., 1.), vec4(0.,0.,0.,1.), 0.1);

    uint cval = texelFetch(texColors, index, 0).r;
    color = texelFetch(texPalette, ivec2(cval, 0), 0);

    gl_PointSize = uPointSize;
}
`;

export const drawVertShader = (gl: WebGL2RenderingContext) =>
  new ShaderConfig(drawVertSrc, gl.VERTEX_SHADER, ["index"], []);

const drawFragSrc = `#version 300 es
precision mediump float;

in vec4 color;
out vec4 fragColor;

void main() {
    vec2 p =  2. * gl_PointCoord.xy - 1.;
    float a = 1. - smoothstep(0.8, 1.0, length(p));
    fragColor = a * color;
}
`;

export const drawFragShader = (gl: WebGL2RenderingContext) =>
  new ShaderConfig(drawFragSrc, gl.FRAGMENT_SHADER, ["position", "color"], []);

const updateVertSrc = `#version 300 es
precision mediump float;
precision mediump int;

uniform ivec2 uStateSize;

out vec2 indexf;

void main() {
  int w = uStateSize.x;
  vec2 v = vec2(gl_VertexID % w, gl_VertexID / w);
  indexf = v;
  gl_Position = vec4(2. * v / vec2(uStateSize) - 1., 0., 1.);

  gl_PointSize = 2.;
}
`;

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
  new ShaderConfig(quadVertSrc, gl.VERTEX_SHADER, ["quad", "indexf"], []);

const updateFragSrc = `#version 300 es
precision highp float;
precision highp int;
precision highp isampler2D;
precision highp sampler2D;

uniform sampler2D texPositions;
uniform sampler2D texVelocities;
uniform sampler2D texSortedPositions;
uniform isampler2D texCountedPositions;
uniform ivec2 uStateSize;
uniform int uGridSize;
uniform float uAlpha;
uniform float uBeta;
uniform float uRadius;
uniform float uVelocity;
uniform float uRadialDecay;
uniform float uColorThresholds[4];

layout(location = 0) out uint color;
layout(location = 1) out vec2 position;
layout(location = 2) out vec2 velocity;

struct Bucket {
  int count;
  int index;
};

vec2 fetch(in sampler2D tex, in ivec2 index) {
  return texelFetch(tex, index, 0).xy;
}

Bucket fetchCount(in isampler2D tex, in ivec2 cell) {
  ivec2 count = texelFetch(tex, cell, 0).xy;
  Bucket b;
  b.count = count.x;
  b.index = count.y - count.x;
  return b;
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

vec2 fetchIndex(in sampler2D tex, in int index) {
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
  pos += vel * uVelocity;
  vec2 apos = pos + 1.0;
  return mod(apos, 2.0) - 1.0;
}

uint getColor(in float count) {
  float[] t = uColorThresholds;
  float one =        step(t[0], count) * (1. - step(t[1], count)); // 13 <= N <= 15
  float two =   2. * step(t[1], count) * (1. - step(t[2], count)); // 15 < N <= 35
  float three = 3. * step(t[2], count) * (1. - step(t[3], count)); // 35 < N <= 50
  float four =  4. * step(t[3], count); // 50 < N
  return uint(one + two + three + four);
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

  position = pos;
  velocity = vel;
  color = getColor(count.x + count.y);
}
`;

export const updateFragShader = (gl: WebGL2RenderingContext) =>
  new ShaderConfig(updateFragSrc, gl.FRAGMENT_SHADER, [], []);
