import {
  Graphics,
  ShaderConfig,
  CanvasObject,
  Texture,
  BufferConfig,
  VertexArrayObject,
} from "./graphics";
import { updateVertShader } from "./pps/shaders";
import { QUAD2 } from "./pps/pps";

const fragShader = `#version 300 es
precision mediump float;
precision highp isampler2D;

uniform isampler2D tex;
uniform isampler2D tex1;
uniform vec2 uResolution;

out vec4 fragColor;

vec3 fetchGradientValue(in vec3 xyz) {
  vec3 s = 0.5 * (xyz + 1.);
  float gfSize = 512.;//uGradientFieldSize.x;
  // fuck this is so annoying. note that the floor(s * gfSize) step is specifically required
  // or rounding issues will completely mess up the arithmetic.
  ivec3 si = ivec3(floor(s * gfSize));
  int index = si.x + si.y * int(gfSize);
#ifdef PPS_MODE_3D
  index = index + si.z * int(gfSize * gfSize);
#endif

  int vSize = 512;//uGradientFieldSize.y;
  ivec2 uv = ivec2(index % vSize, index / vSize);
  // ivec2 uv = ivec2(s.xy * vSize);

  ivec3 di = texelFetch(tex, uv, 0).xyz;
  return vec3(intBitsToFloat(di.x), intBitsToFloat(di.y), intBitsToFloat(di.z));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  // ivec2 c = texture(tex, uv).rg;
  // vec2 color = vec2(intBitsToFloat(c.r), intBitsToFloat(c.g));
  vec2 color = fetchGradientValue(vec3(2. * uv - 1., 0.)).xy;

  color = 0.5 * (5.*color + 1.);

  float c1 = intBitsToFloat(texture(tex1, uv).r);

  fragColor = vec4(color, c1, 1.);
}
`;

export class Debug {
  private gl: WebGL2RenderingContext | WebGL2ComputeRenderingContext;
  private gfx: Graphics;

  constructor(
    canvas: HTMLCanvasElement,
    private tex: Texture,
    private tex1: Texture
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
      new CanvasObject(gl),
      [updateVertShader(gl), new ShaderConfig(fragShader, gl.FRAGMENT_SHADER)],
      () => true
    );
    this.gfx = gfx;

    gfx.attachUniform("uResolution", (l, v) => {
      gl.uniform2f(l, canvas.clientWidth, canvas.clientHeight);
    });
    gfx.attachTexture(tex, "tex");
    gfx.attachTexture(tex1, "tex1");

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
          gfx.bindTexture(tex, 0);
          gfx.bindTexture(tex1, 1);
          return true;
        }
      )
    );
  }

  public render() {
    this.gfx.render(false);
  }
}
