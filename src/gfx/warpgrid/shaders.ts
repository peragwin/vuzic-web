import { ShaderConfig } from "../graphics";

const quadVertSrc = `#version 300 es
precision mediump float;

uniform vec2 uGridSize;

in vec2 quad;

void main() {
  vec2 p = 2. * quad + 1.;
  gl_Position = vec4(p, 0., 1.);
}`;

export const updateVertShader = (gl: WebGL2RenderingContext) =>
  new ShaderConfig(quadVertSrc, gl.VERTEX_SHADER, [], []);

const updateFragSource = `#version 300 es
#define PI 3.141592653589793

precision mediump float;

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
}`;

export const updateFragShader = (gl: WebGL2RenderingContext) =>
  new ShaderConfig(updateFragSource, gl.FRAGMENT_SHADER, [], []);

// warp controls the zoom in the center of the display
// scale controls the vertical scaling factor
export const vertexShaderSource = `#version 300 es

uniform float warp[{0}]; // for y rows
uniform float scale[{1}]; // for x cols
uniform float uzScale;
layout (std140) uniform uCameraMatrix {
  mat4 uView;
  mat4 uTransform;
  mat4 uProjection;
};

const vec2 gridSize = vec2({1}, {0});

in vec3 vertPos;
in vec2 texPos;
in vec2 uvPos;
out vec2 fragTexPos;
out vec3 vUvw;

float x, y, s, wv, sv;

void main() {

  x = vertPos.x;
  y = vertPos.y;

  ivec2 index = ivec2(gridSize * abs(vertPos.xy));

  // sv = scale[int((x+1.)*float({1})/2.)];
  // wv = warp[int((y+1.)*float({0})/2.)];
  sv = scale[index.x];
  wv = warp[index.y];
  float elev = wv + sv;

  if (x <= 0.0) {
    x = pow(x + 1.1, wv) - 1.0; // wtf why 1.1? (<- adds cool overlapping effect)
  } else {
    x = 1.0 - pow(abs(x - 1.1), wv);
  }

  if (y <= 0.0) {
    s = (1. + y/2.) * sv;
    y = pow(y + 1.0, s) - 1.0;
  } else {
    s = (1. - y/2.) * sv;
    y = 1.0 - pow(abs(y - 1.0), s);
  }

  // float z = max(-1000. + elev * vertPos.z, 0.);
  float z = elev * vertPos.z * uzScale;
  // float z = 0.;

  vUvw = vec3(uvPos, elev);
  fragTexPos = abs(2.*texPos-1.);
  vec4 pos = vec4(elev * x, elev * y, z, 1.0);

  gl_Position = uProjection * uTransform * uView * pos;
}`;

export const fragmenShaderSource = `#version 300 es
precision highp float;

uniform sampler2D texImage;
in vec2 fragTexPos;
in vec3 vUvw;
out vec4 fragColor;

void main() {
  vec4 color = texture(texImage, fragTexPos.xy);
  // float r = length(vUvw.xy);
  // float a = (1. - r*r);// vUvw.z * (1. - r*r);
  // if (a < 0.) discard;
  // fragColor = color * a;
  fragColor = color;
}`;
