import {
  Program,
  ShaderSourceConfig,
  ProgramType,
  makeConfig,
} from "../program";
import { VertexArrayObject, UniformBuffer } from "../buffers";
import { Texture, TextureObject } from "../textures";
import { Dims } from "../types";
import { RenderTarget, drawWithProgram, FramebufferObject } from "../graphics";
import { Bloom } from "../misc/bloom";

const shaders = (size: Dims): ShaderSourceConfig[] => [
  {
    type: "vertex",
    // warp controls the zoom in the center of the display
    // scale controls the vertical scaling factor
    source: `#version 300 es
#define WIDTH ${size.width}
#define HEIGHT ${size.height}
uniform float warp[HEIGHT]; // for y rows
uniform float scale[WIDTH]; // for x cols
uniform float uzScale;
layout (std140) uniform uCameraMatrix {
  mat4 uView;
  mat4 uTransform;
  mat4 uProjection;
};

const vec2 gridSize = vec2(WIDTH, HEIGHT);

in vec3 vertPos;
in vec2 texPos;
// in vec2 uvPos;
out vec2 fragTexPos;
out vec3 vUvw;

float x, y, s, wv, sv;

void main() {

  x = vertPos.x;
  y = vertPos.y;

  ivec2 index = ivec2(gridSize * abs(vertPos.xy));

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

  // vUvw = vec3(uvPos, elev);
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

interface Input {
  warp: Float32Array;
  scale: Float32Array;
  zScale: number;
  cameraMatrix: UniformBuffer;
  image: Texture;
  vaos: VertexArrayObject[];
}

interface Update {
  resolution?: Dims;
}

class PreBloom {
  image: TextureObject;
  frameBuffer: FramebufferObject;

  constructor(gl: WebGL2RenderingContext, resolution: Dims) {
    this.image = new TextureObject(gl, {
      mode: gl.LINEAR,
      internalFormat: gl.RGBA8,
      format: gl.RGBA,
      type: gl.UNSIGNED_BYTE,
      ...resolution,
    });
    this.image.updateData(
      resolution.width,
      resolution.height,
      new Uint8Array(4 * resolution.width * resolution.height)
    );
    this.frameBuffer = new FramebufferObject(gl, resolution, true, true);
    this.frameBuffer.attach(this.image, 0);
    this.frameBuffer.bind();
    this.frameBuffer.checkStatus();
  }

  public destroy() {
    // TODO: (for now gl objects will be cleared by gc..)
    // this.image.destroy();
    // this.frameBuffer.destroy();
  }
}

export class RenderPass {
  static config = makeConfig({
    sources: [], // placeholder
    attributes: {
      vertPos: {},
      texPos: {},
      // uvPos: {},
    },
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

  public readonly program: ProgramType<typeof RenderPass.config>;

  private bloom: Bloom;
  private preBloom: PreBloom;

  constructor(
    private gl: WebGL2RenderingContext,
    size: Dims,
    resolution: Dims,
    private enableBloom = true
  ) {
    const config = { ...RenderPass.config, sources: shaders(size) };
    const program = new Program(gl, config);
    this.program = program;

    this.bloom = new Bloom(gl, resolution);
    this.preBloom = new PreBloom(gl, resolution);
  }

  public update(update: Update) {
    if (update.resolution) {
      this.preBloom.destroy();
      this.preBloom = new PreBloom(this.gl, update.resolution);
    }
    this.bloom.update(update);
  }

  public render(input: Input, target: RenderTarget) {
    const gl = this.gl;
    const firstTarget = this.enableBloom ? this.preBloom.frameBuffer : target;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.DST_ALPHA);
    drawWithProgram(
      this.program,
      () => {
        this.program.uniforms.warp.bind(input.warp);
        this.program.uniforms.scale.bind(input.scale);
        this.program.uniforms.uzScale.bind(input.zScale);
        this.program.textures.texImage.bind(input.image);
        this.program.uniformBuffers.uCameraMatrix.bind(input.cameraMatrix);
      },
      firstTarget,
      input.vaos
    );

    if (this.enableBloom) {
      this.bloom.render({ image: this.preBloom.image }, target);
    }
  }
}
