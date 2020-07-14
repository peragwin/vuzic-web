import {
  Graphics,
  ShaderConfig,
  CanvasObject,
  Texture,
  BufferConfig,
  VertexArrayObject,
} from "./graphics";
import { updateVertShader, PPSMode } from "./pps/shaders";
import { QUAD2 } from "./pps/pps";

const fragShader = (gl: WebGL2RenderingContext, mode: PPSMode) => {
  const source = `#version 300 es
#define PPS_MODE_${mode}
precision mediump float;
precision highp isampler2D;

uniform isampler2D texField;
uniform isampler2D texGradient;
uniform vec2 uResolution;
uniform vec2 uTexSize;

out vec4 fragColor;

vec3 fetchFieldValue(in isampler2D tex, in vec3 xyz) {
  vec3 s = 0.5 * (xyz + 1.);
  float gfSize = uTexSize.x;
  // fuck this is so annoying. note that this step is specifically required
  // or rounding issues will completely mess up the arithmetic.
  ivec3 si = ivec3(floor(s * gfSize));
  int index = si.x + si.y * int(gfSize);
#ifdef PPS_MODE_3D
  index = index + si.z * int(gfSize * gfSize);
#endif

  int vSize = int(uTexSize.y);
  ivec2 uv = ivec2(index % vSize, index / vSize);
  // ivec2 uv = ivec2(s.xy * vSize);

  ivec3 di = texelFetch(tex, uv, 0).xyz;
  return vec3(intBitsToFloat(di.x), intBitsToFloat(di.y), intBitsToFloat(di.z));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec3 xyz = vec3(2. * uv - 1., 0.);

  // ivec2 c = texture(tex, uv).rg;
  // vec2 color = vec2(intBitsToFloat(c.r), intBitsToFloat(c.g));
  vec2 color = fetchFieldValue(texGradient, xyz).xy;

  color = 0.5 * (5.*color + 1.);

  float c1 = fetchFieldValue(texField, xyz).r;

  fragColor = vec4(color, c1, 0.9);
}
`;
  return new ShaderConfig(source, gl.FRAGMENT_SHADER);
};

export class Debug {
  private gl: WebGL2RenderingContext | WebGL2ComputeRenderingContext;
  private gfx: Graphics;

  constructor(
    canvas: HTMLCanvasElement,
    private texField: Texture,
    private texGradient: Texture,
    texSize: number[],
    mode: PPSMode
  ) {
    const cgl = canvas.getContext("webgl2-compute", {
      preserveDrawingBuffer: true,
    });
    if (!cgl) {
      const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
      if (!gl) throw new Error("webgl2 is required");
      this.gl = gl;
    } else {
      console.info("webgl2-compute is supported");
      this.gl = cgl;
    }
    const gl = this.gl;

    const gfx = new Graphics(
      this.gl,
      new CanvasObject(gl, () => {}, false),
      [updateVertShader(gl), fragShader(gl, mode)],
      () => {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.DST_ALPHA);
      }
    );
    this.gfx = gfx;

    gfx.attachUniform("uResolution", (l, v) => {
      gl.uniform2f(l, canvas.clientWidth, canvas.clientHeight);
    });
    gfx.attachUniform("uTexSize", (l, v) => gl.uniform2f(l, v[0], v[1]));
    gfx.attachTexture(texField, "texField");
    gfx.attachTexture(texGradient, "texGradient");

    const buf = gfx.newBufferObject(
      new BufferConfig(
        QUAD2,
        [{ name: "quad", size: 2, offset: 0 }],
        () => true
      )
    );
    gfx.addVertexArrayObject(
      new VertexArrayObject(
        buf,
        0,
        QUAD2.length / 2,
        gl.TRIANGLE_STRIP,
        (gfx) => {
          gfx.bindUniform("uResolution", null);
          gfx.bindUniform("uTexSize", texSize);
          gfx.bindTexture(texField, 0);
          gfx.bindTexture(texGradient, 1);
          return true;
        }
      )
    );
  }

  public render() {
    this.gfx.render(false);
  }
}
