import {
  Program,
  ShaderSourceConfig,
  ProgramType,
  makeConfig,
} from "../program";

const shaders: ShaderSourceConfig[] = [
  {
    type: "vertex",
    source: `#version 300 es

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
}`,
  },
  {
    type: "fragment",
    source: `#version 300 es
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
}`,
  },
];

const uniform1fv = (
  gl: WebGL2RenderingContext,
  l: WebGLUniformLocation,
  v: Float32Array
) => {
  gl.uniform1fv(l, v);
};

const uniform1f = (
  gl: WebGL2RenderingContext,
  l: WebGLUniformLocation,
  v: number
) => {
  gl.uniform1f(l, v);
};

export class RenderPass {
  static config = makeConfig({
    sources: shaders,
    textures: {
      texImage: { binding: 0 },
    },
    uniforms: {
      warp: { bindFunc: uniform1fv },
      scale: { bindFunc: uniform1fv },
      uzScale: { bindFunc: uniform1f },
    },
    uniformBuffers: {
      uCameraMatrix: { location: 0 },
    },
  });
  private program: ProgramType<typeof RenderPass.config>;

  constructor(gl: WebGL2RenderingContext) {
    const program = new Program(gl, RenderPass.config);
    this.program = program;

    program.uniforms.scale.bind(new Float32Array(4));
    // program.uniforms.uzScale.bind();
    // program.uniforms.uzScale.
    // this.program.uniforms.warp.bind();
  }
}
