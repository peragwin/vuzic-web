import {
  Program,
  ShaderSourceConfig,
  ProgramType,
  makeConfig,
} from "../program";
import { VertexArrayObject, UniformBuffer } from "../buffers";
import { Texture, TextureObject } from "../textures";
import { Dims, uniform1f } from "../types";
import { RenderTarget, drawWithProgram, FramebufferObject } from "../graphics";
import { Bloom, Params as BloomParams } from "../misc/bloom";

const shaders = (): ShaderSourceConfig[] => [
  {
    type: "vertex",
    // warp controls the zoom in the center of the display
    // scale controls the vertical scaling factor
    source: `#version 300 es
precision highp float;
precision highp sampler2D;

uniform sampler2D texWarp;
uniform sampler2D texScale;

// uColumnIndex should be normalized [0,1) based on the actual width of texScale
uniform float uColumnIndex;

uniform float uzScale;
uniform float uOffset;

layout (std140) uniform uCameraMatrix {
  mat4 uView;
  mat4 uTransform;
  mat4 uProjection;
};

in vec3 vertPos;
in vec2 texPos;
out vec2 fragTexPos;

float x, y, s, wv, sv;

float fetchValue(in sampler2D tex, in float index) {
  return texture(tex, vec2(index, 0.0)).r;
}

void main() {

  x = vertPos.x;
  y = vertPos.y;

  float warpIndex = abs(y);
  float scaleIndex = mod(uColumnIndex - abs(x), 1.0);

  float ss = 1.0;// - abs(x) / 2.0;

  sv = ss * fetchValue(texScale, scaleIndex);
  wv = fetchValue(texWarp, warpIndex);
  // sv = wv + 0.000001 * sv;

  float elev = (wv + sv);

  // wtf why +/-1.1? (<- adds cool overlapping effect, but should parameterize)
  float os = 1.0 + uOffset;

  if (x <= 0.0) {
    x = pow(x + os, wv) - 1.0;
  } else {
    x = 1.0 - pow(abs(x - os), wv);
  }

  if (y <= 0.0) {
    s = (1. + y/2.) * sv;
    y = pow(y + 1.0, s) - 1.0;
  } else {
    s = (1. - y/2.) * sv;
    y = 1.0 - pow(abs(y - 1.0), s);
  }

  // float z = elev * vertPos.z;
  const float z = 1.0;

  fragTexPos = abs(2.0 * texPos - 1.0);

  x = mix(x, elev * x, uzScale);
  y = mix(y, elev * y, uzScale);

  // vec4 pos = vec4(elev * x, elev * y, 1.0, 1.0);
  vec4 pos = vec4(x, y, z, 1.0);

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

interface Input {
  warp: Texture;
  scale: Texture;
  columnIndex: number;
  zScale: number;
  offset: number;
  cameraMatrix: UniformBuffer;
  image: Texture;
  vaos: VertexArrayObject[];
}

interface Update {
  resolution?: Dims;
  params?: Partial<BloomParams>;
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
    sources: shaders(),
    attributes: {
      vertPos: {},
      texPos: {},
    },
    textures: {
      texWarp: { binding: 0 },
      texScale: { binding: 1 },
      texImage: { binding: 2 },
    },
    uniforms: {
      uColumnIndex: { bindFunc: uniform1f },
      uOffset: { bindFunc: uniform1f },
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
    resolution: Dims,
    private enableBloom = true
  ) {
    const config = { ...RenderPass.config };
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
        this.program.uniforms.uColumnIndex.bind(input.columnIndex);
        this.program.uniforms.uOffset.bind(input.offset);
        this.program.uniforms.uzScale.bind(input.zScale);
        this.program.textures.texWarp.bind(input.warp);
        this.program.textures.texScale.bind(input.scale);
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
