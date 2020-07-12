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
layout (std140) uniform uCameraMatrix {
  mat4 uvpMatrix;
};

out vec4 color;

void main() {
  int w = uStateSize.x;
  ivec2 index = ivec2(gl_VertexID % w, gl_VertexID / w);
  ivec3 ipos = texelFetch(texPositions, index, 0).xyz;
  vec3 position = vec3(intBitsToFloat(ipos.x), intBitsToFloat(ipos.y), intBitsToFloat(ipos.z));
  gl_Position = uvpMatrix * vec4(position, 1.);

  float cval = intBitsToFloat(texelFetch(texColors, index, 0).r);
  color = texture(texPalette, vec2(cval, 0.0));

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
  // float a = 1. / (1. + r*r); ??
  float a = 1. - pow(r, 3.);
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
precision highp isampler3D;
precision highp sampler3D;

uniform isampler2D texPositions;
uniform isampler2D texVelocities;
uniform isampler2D texOrientations;
uniform isampler2D texSortedPositions;
uniform isampler3D texCountedPositions;
// uniform isampler3D texGradientField;

uniform ivec2 uStateSize;
uniform int uGridSize;
uniform vec2 uAlpha;
uniform vec2 uBeta;
uniform float uRadius;
uniform float uVelocity;
uniform float uRadialDecay;
uniform float uColorScale;
uniform float uGroupWeight;

uniform uColorThresholdBlock {
  float uColorThresholds[5];
};

layout(location = 0) out ivec3 position;
layout(location = 1) out ivec3 velocity;
layout(location = 2) out ivec3 orientation;
layout(location = 3) out int color;

struct Bucket {
  int count;
  int index;
};

struct Compare {
  vec2 countX;
  vec2 countY;
  vec3 groupVel;
  vec3 groupOri;
};

vec3 fetch(in isampler2D tex, in ivec2 index) {
  ivec3 ipos = texelFetch(tex, index, 0).xyz;
  return vec3(intBitsToFloat(ipos.x), intBitsToFloat(ipos.y), intBitsToFloat(ipos.z));
}

Bucket fetchCount(in isampler3D tex, in ivec3 cell) {
  ivec2 count = texelFetch(tex, cell, 0).xy;
  Bucket b;
  b.count = count.x;
  b.index = count.y - count.x;
  return b;
}

// vec3 fetchGradientValue(in vec3 xyz) {
//   vec3 uvw = 0.5 * (xyz + 1.);
//   ivec3 di = texture(texGradientField, uvw).xyz;
//   return vec3(intBitsToFloat(di.x), intBitsToFloat(di.y), intBitsToFloat(di.z));
// }

ivec3 cellCoord(in vec3 pos, float gridSize) {
  vec3 ipos = floor((pos + 1.) / 2. * gridSize);
  return ivec3(ipos);
}

ivec3 wrap(in ivec3 coord, int gridSize) {
  return coord % ivec3(gridSize);
}

vec3 fetchIndex(in isampler2D tex, in int index) {
  ivec2 findex = ivec2(index % uStateSize.x, index / uStateSize.x);
  return fetch(tex, findex);
}

vec3 wrapDistance(vec3 r) {
  vec3 a = abs(r);
  a = step(vec3(1.), a) * (2. - a) + step(a, vec3(1.)) * a;
  return sign(r) * a;
}

mat3 particleViewMatrix(in vec3 vel, in vec3 ori) {
  vec3 u = normalize(cross(vel, ori));
  vec3 v = normalize(ori);
  vec3 w = normalize(vel);
  return transpose(mat3(u, v, w));
}

// the direction of r is expected to be relative a particle oriented such that 
// forward = (0,0,1) and up = (0,1,0)
void compareNeighbor(in vec3 r, in float radius, in vec3 bVel, in vec3 bOri, inout Compare compare) {
  if (r == vec3(0.)) return;

  r = wrapDistance(r);
  
  float rl = dot(r, r);
  float r2 = radius*radius;

  float damp = 1. / (1. + rl * uRadialDecay* uRadialDecay);
  float s = damp * step(rl, r2);

  // head-twisty logic for (r > 0 && lenght(r) <= radius) && (ang < 0 ? (1, 0) : (0, 1))
  compare.countX += s * (vec2(1., -1) * sign(r.x) + 1.) / 2.;
  compare.countY += s * (vec2(1., -1) * sign(r.y) + 1.) / 2.;

  compare.groupVel += s * bVel;
  compare.groupOri += s * bOri;
}

Compare compareNeighbors(in ivec2 index, in vec3 aPos, in mat3 pView) {
  int aIndex = index.x + int(uStateSize.x) * index.y;

  Compare compare = Compare(vec2(0.), vec2(0.), vec3(0.), vec3(0.));

  float gridSize = float(uGridSize);
  ivec3 aCell = cellCoord(aPos, gridSize);
  ivec3 bCell;
  Bucket bucket;
  vec3 bPos;
  vec3 bVel;
  vec3 bOri;

  // sanity check
  // if (dot(pView * aVel, vec3(1., 1., 0.)) > 0.01) {
  //   return count;
  // }
  // if (dot(pView * aOri, vec3(1., 0., 1.)) >= 0.01) {
  //   return count;
  // }

  // gridRadius is how many extra cells we need to scan in addition to our own
  int gridRadius = int(ceil(uRadius * gridSize / 2.));

  // apparently this can be a lot better if its using a lut to avoid branching
  for (int x = -gridRadius; x <= gridRadius; x++) {
    for (int y = -gridRadius; y <= gridRadius; y++) {
      for (int z = -gridRadius; z <= gridRadius; z++) {

        bCell = wrap(aCell + ivec3(x, y, z), uGridSize);
        bucket = fetchCount(texCountedPositions, bCell);

        for (int i = 0; i < bucket.count; i++) {
          int bIndex = bucket.index + i;
          if (aIndex == bIndex) continue; // don't count self

          bPos = fetchIndex(texSortedPositions, bIndex);
          vec3 r = aPos - bPos;
          if (length(r) > uRadius) continue;

          r = pView * r;

          bVel = fetchIndex(texVelocities, bIndex);
          bOri = fetchIndex(texOrientations, bIndex);

          // increment left or right counts and groupVel if B is within uRadius of A
          compareNeighbor(r, uRadius, bVel, bOri, compare);
        }
      }
    }
  }



  return compare;
}

vec2 fromPolar(in vec2 p) {
  float s = sin(p.t);
  float c = cos(p.t);
  return vec2(p.s * s, p.s * c);
}

vec2 deltaTheta(in Compare compare) {
  vec4 count = vec4(compare.countX, compare.countY);
  vec2 sum = vec2(count.x + count.y, count.z + count.w);
  vec2 diff = vec2(count.y - count.x, count.w - count.z);
  return fromPolar(uAlpha) + fromPolar(uBeta) * sum * sign(diff);
}

void applyGroupVelocity(inout vec3 vel, inout vec3 ori, in vec3 groupVel) {
  vec3 newVel = normalize(vel + uGroupWeight * groupVel);
  vec3 raxis = cross(newVel, vel);
  vec3 taxis = cross(raxis, vel);
  
  mat3 U = mat3(normalize(vel), normalize(taxis), normalize(raxis));
  mat3 V = transpose(U);

  float s = length(raxis);
  float c = dot(newVel, vel);
  mat3 rot = mat3( c, s, 0., -s, c, 0., 0., 0., 1. );

  ori = U * rot * V * ori;
  vel = newVel;
}

void applyGroupOrientation(in vec3 vel, inout vec3 ori, in vec3 groupOri) {
  vec3 newOri = ori + uGroupWeight * groupOri;
  // project newOri onto the plane orthoganal to vel by subtracting the component in line with vel
  ori = newOri - dot(newOri, vel) * vel;
}

mat2 rotate2d(float angle) {
  return mat2(cos(angle), -sin(angle),
              sin(angle),  cos(angle));
}

mat3 rotate3d(vec2 angle) {
  // angle = 0.00001 * angle;
  // matricies are column major, so these should appear transposed
  mat3 rotY = mat3( cos(angle.s),  0.,           -sin(angle.s),
                    0.,            1.,            0.,
                    sin(angle.s),  0.,            cos(angle.s));
  mat3 rotX = mat3( 1.,            0.,            0.,
                    0.,            cos(angle.t),  sin(angle.t),
                    0.,           -sin(angle.t),  cos(angle.t));
  return rotY * rotX;
}

vec3 integrate(in vec3 pos, in vec3 vel) {
  vec3 avel = vel; // + fetchGradientValue(pos);
  pos += avel * uVelocity;
  // return pos;
  vec3 apos = pos + 1.0;
  return mod(apos, 2.0) - 1.0;
}

float getColor(in float count) {
  count /= uColorScale;
  float[] t = uColorThresholds;
  return (
    (t[0] <= 0. ? 1. : clamp( count /  t[0], 0., 1.)) +
    clamp((count - t[0]) / (t[1] - t[0]), 0., 1.) +
    clamp((count - t[1]) / (t[2] - t[1]), 0., 1.) +
    clamp((count - t[2]) / (t[3] - t[2]), 0., 1.) +
    clamp((count - t[3]) / (t[4] - t[3]), 0., 1.)
  ) / 5.;
}

ivec3 toIEEE(in vec3 v) {
  return ivec3(floatBitsToInt(v.x), floatBitsToInt(v.y), floatBitsToInt(v.z));
}

bool isnanv(in vec3 v) {
  return isnan(v.x) || isinf(v.x) ||
    isnan(v.y) || isinf(v.y) ||
    isnan(v.z) || isinf(v.z);
}

void fixNaN(inout vec3 v, in vec3 fix) {
  if (isnan(v.x) || isinf(v.x)) v.x = fix.x;
  if (isnan(v.y) || isinf(v.y)) v.y = fix.y;
  if (isnan(v.z) || isinf(v.z)) v.z = fix.z;
}

void main() {
  ivec2 index = ivec2(gl_FragCoord.xy);
  vec3 pos = fetch(texPositions, index);
  vec3 vel = fetch(texVelocities, index);
  vec3 ori = fetch(texOrientations, index);

  fixNaN(pos, gl_FragCoord.xyz / vec3(uStateSize, 1.));
  if (isnanv(vel) || isnanv(ori)) {
    fixNaN(vel, vec3(1., 0., 0.));
    fixNaN(ori, vec3(0., 1., 0.));
    ori = normalize(cross(vel, ori));
  }

  // pos = vec3(pos.xy, 0.);
  // ori = normalize(vec3(0., 0., ori.z));

  mat3 pView = particleViewMatrix(vel, ori);

  Compare compare = compareNeighbors(index, pos, pView);
  vec2 dtheta = deltaTheta(compare);
  
  mat3 rot = transpose(pView) * rotate3d(dtheta) * pView;
  
  vel = normalize(rot * vel);
  ori = normalize(rot * ori);
  pos = integrate(pos, vel);

  applyGroupVelocity(vel, ori, compare.groupVel);
  // applyGroupOrientation(vel, ori, compare.groupOri);

  position = toIEEE(pos);
  velocity = toIEEE(vel);
  orientation = toIEEE(ori);
  color = floatBitsToInt(getColor(compare.countX.x + compare.countY.y));
}
`;

export const updateFragShader = (gl: WebGL2RenderingContext) =>
  new ShaderConfig(updateFragSrc, gl.FRAGMENT_SHADER, [], []);

/*

float getColor(in float count) {
  count /= uColorScale;
  float[] t = uColorThresholds;

  
  //  using 5th order polynomial interpolation.
  //  this is suuuper cool but sometimes numerically unstable,
  //  i'm mixing it with simple lerp between points and this seems alright
  

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
    (t[0] <= 0. ? 1. : clamp( count         /  t[0]        , 0., 1.)) +
    clamp((count - t[0]) / (t[1] - t[0]), 0., 1.) +
    clamp((count - t[1]) / (t[2] - t[1]), 0., 1.) +
    clamp((count - t[2]) / (t[3] - t[2]), 0., 1.) +
    clamp((count - t[3]) / (t[4] - t[3]), 0., 1.)
  ) / 5.;

  return mix(poly, lerp, 1.0);
}

*/
