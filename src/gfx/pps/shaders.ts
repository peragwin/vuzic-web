import { ShaderConfig } from "../graphics";

const drawVertSrc = `#version 300 es

#ifdef GL_ES
precision mediump float;
precision mediump usampler2D;
#endif

uniform usampler2D texPositions;
uniform sampler2D texColors;
uniform ivec2 uStateSize;
// uniform vec2 uPosScale;
// uniform vec2 uResolution;
uniform float uPointSize;

// in uvec2 index;
// out vec2 position;
out vec4 color;

void main() {
    int w = uStateSize.x;
    ivec2 index = ivec2(gl_VertexID % w, gl_VertexID / w);
    uvec2 posu = texelFetch(texPositions, index, 0).xy;
    vec2 position = 2. * (vec2(posu) / 65535.) - 1.;
    gl_Position = mix(vec4(position, 0., 1.), vec4(0.,0.,0.,1.), 0.5);

    color = texelFetch(texColors, index, 0);
    color = mix(color, vec4(0., 1., 0., 1.0), 0.5);

    gl_PointSize = uPointSize;
}
`;

export const drawVertShader = (gl: WebGL2RenderingContext) =>
  new ShaderConfig(drawVertSrc, gl.VERTEX_SHADER, ['index'], []);

const drawFragSrc = `#version 300 es

#ifdef GL_ES
precision mediump float;
#endif

// in vec2 position;
in vec4 color;
out vec4 fragColor;

void main() {
    vec2 p =  2. * gl_PointCoord.xy - 1.;
    float a = 1. - smoothstep(0.8, 1.0, length(p));
    fragColor = a * color;
}
`;

export const drawFragShader = (gl: WebGL2RenderingContext) =>
  new ShaderConfig(drawFragSrc, gl.FRAGMENT_SHADER, ['position', 'color'], []);

const updateVertSrc = `#version 300 es
#ifdef GL_ES
precision mediump float;
precision mediump int;
#endif

uniform ivec2 uStateSize;

flat out ivec2 index;

void main() {
  int w = uStateSize.x;
  index = ivec2(gl_VertexID % w, gl_VertexID / w);
  gl_PointSize = 1.0;
}
`;

export const updateVertShader = (gl: WebGL2RenderingContext) =>
  new ShaderConfig(updateVertSrc, gl.VERTEX_SHADER, [], []);

const updateFragSrc = `#version 300 es
#ifdef GL_ES
precision mediump float;
precision mediump int;
precision mediump usampler2D;
#endif

uniform usampler2D texPositions;
uniform usampler2D texVelocities;
uniform ivec2 uStateSize;
uniform float uAlpha;
uniform float uBeta;
uniform float uRadius;

flat in ivec2 index;
layout(location = 0) out uvec2 position;
layout(location = 1) out uvec2 velocity;
layout(location = 2) out vec4 color;

vec2 fetch(in usampler2D tex, in ivec2 index) {
  uvec2 val = texelFetch(tex, index, 0).xy;
  return 2. * (vec2(val) / 65535.) - 1.;
}

vec2 countNeighbors(in ivec2 aIndex, in vec2 aPos) {
  vec2 count = vec2(0., 0.);

  for (int i = 0; i < uStateSize.x; i++) {
    for (int j = 0; j < uStateSize.y; j++) {

      ivec2 bIndex = ivec2(i, j);
      if (bIndex == aIndex) continue;

      vec2 bPos = fetch(texPositions, bIndex);
      vec2 r = bPos - aPos;
      if (length(r) <= uRadius) {
        if (r.x <= 0.) {
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
  pos += vel;
  vec2 apos = pos + 1.0;
  return mod(apos, 2.0) - 1.0;
}

void main() {
  vec2 pos = fetch(texPositions, index);
  vec2 vel = fetch(texVelocities, index);

  vec2 count = countNeighbors(index, pos);
  float dtheta = deltaTheta(count);

  mat2 rot = rotate2d(dtheta);
  vel = rot * vel;

  // position = vec4(integrate(pos, vel), 0., 1.);
  position = uvec2(mix(integrate(pos, vel), vec2(0.,0.), 0.9) * 65535.);
  // velocity = vec4(vel, 0., 1.);
  velocity = uvec2(vel * 65535.);
  color = vec4(0.5, 0.1, 1., 1.);
}
`;

export const updateFragShader = (gl: WebGL2RenderingContext) =>
  new ShaderConfig(updateFragSrc, gl.FRAGMENT_SHADER, [], []);
