import { ShaderConfig } from "../graphics";

const drawVertSrc = `#version 300 es

#ifdef GL_ES
precision mediump float;
precision mediump usampler2D;
#endif

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
    gl_Position = mix(vec4(position, 0., 1.), vec4(0.,0.,0.,1.), 0.1);

    uint cval = texelFetch(texColors, index, 0).r;
    color = texelFetch(texPalette, ivec2(cval, 0), 0);

    gl_PointSize = uPointSize;
}
`;

export const drawVertShader = (gl: WebGL2RenderingContext) =>
  new ShaderConfig(drawVertSrc, gl.VERTEX_SHADER, ["index"], []);

const drawFragSrc = `#version 300 es

#ifdef GL_ES
precision mediump float;
#endif

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
#ifdef GL_ES
precision mediump float;
precision mediump int;
#endif

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
#ifdef GL_ES
precision highp float;
precision highp int;
#endif

uniform ivec2 uStateSize;

in vec2 quad;
// out vec2 indexf;

void main() {
  vec2 p = 2. * quad + 1.;
  
  // indexf = quad * vec2(uStateSize);

  gl_Position = vec4(p, 0., 1.);
}`;

export const updateVertShader = (gl: WebGL2RenderingContext) =>
  new ShaderConfig(quadVertSrc, gl.VERTEX_SHADER, ["quad", "indexf"], []);

const updateFragSrc = `#version 300 es
#ifdef GL_ES
precision highp float;
precision highp int;
#endif

uniform sampler2D texPositions;
uniform sampler2D texVelocities;
uniform ivec2 uStateSize;
uniform float uAlpha;
uniform float uBeta;
uniform float uRadius;
uniform float uVelocity;

in vec2 indexf;
layout(location = 0) out uint color;
layout(location = 1) out vec2 position;
layout(location = 2) out vec2 velocity;

vec2 fetch(in sampler2D tex, in ivec2 index) {
  return texelFetch(tex, index, 0).xy;
}

vec2 countNeighbors(in ivec2 aIndex, in vec2 aPos, in vec2 aVel) {
  vec2 count = vec2(0., 0.);

  for (int i = 0; i < uStateSize.x; i++) {
    for (int j = 0; j < uStateSize.y; j++) {

      ivec2 bIndex = ivec2(i, j);
      if (bIndex == aIndex) continue;

      vec2 bPos = fetch(texPositions, bIndex);
      vec2 r = aPos - bPos;
      if (length(r) <= uRadius) {
        float ang = aVel.x * r.y - aVel.y * r.x;
        if (ang <= 0.) {
          count.s += 1.;
        } else {
          count.t += 1.;
        }
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

mat2 rotate2d(float _angle){
  return mat2(cos(_angle), -sin(_angle),
              sin(_angle),  cos(_angle));
}

vec2 integrate(in vec2 pos, in vec2 vel) {
  pos += vel * uVelocity;
  vec2 apos = pos + 1.0;
  return mod(apos, 2.0) - 1.0;
}

uint getColor(in float count) {
  float one =        step(12.9, count) * (1. - step(15.1, count)); // 13 <= N <= 15
  float two =   2. * step(15.1, count) * (1. - step(35.1, count)); // 15 < N <= 35
  float three = 3. * step(35.1, count) * (1. - step(50.1, count)); // 35 < N <= 50
  float four =  4. * step(50.1, count); // 50 < N
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
