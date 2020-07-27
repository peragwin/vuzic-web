import {
  ProgramType,
  makeConfig,
  ShaderSourceConfig,
  Program,
} from "../program";
import { quadVertShader, quadVertAttributes, makeQuadVao } from "./quadvert";
import { Dims, uniform1f } from "../types";
import { VertexArrayObject } from "../buffers";
import { TextureObject, Texture } from "../textures";
import { FramebufferObject, RenderTarget, drawWithProgram } from "../graphics";

const samplerShaders = (): ShaderSourceConfig[] => [
  quadVertShader,
  {
    type: "fragment",
    // Taken from https://www.shadertoy.com/view/lstSRS
    source: `#version 300 es
precision highp float;
precision highp sampler2D;

uniform sampler2D texImage;
uniform vec2 iResolution;
// uniform vec2 outResolution;

//First bloom pass, mipmap tree thing

vec4 ColorFetch(vec2 coord)
{
    return texture(texImage, coord);   
}

vec4 Grab1(vec2 coord, const float octave, const vec2 offset)
{
    float scale = exp2(octave);
    
    coord += offset;
    coord *= scale;

    if (coord.x < 0.0 || coord.x > 1.0 || coord.y < 0.0 || coord.y > 1.0)
    {
        return vec4(0.0);   
    }
    
    vec4 color = ColorFetch(coord);

    return color;
}

vec4 Grab4(vec2 coord, const float octave, const vec2 offset)
{
    float scale = exp2(octave);
    
    coord += offset;
    coord *= scale;

    if (coord.x < 0.0 || coord.x > 1.0 || coord.y < 0.0 || coord.y > 1.0)
    {
        return vec4(0.0);   
    }
    
    vec4 color = vec4(0.0);
    
    const int oversampling = 4;
    const float weight = 1. / 16.;
    
    for (int i = 0; i < oversampling; i++)
    {    	    
        for (int j = 0; j < oversampling; j++)
        {
            vec2 off = (vec2(i, j) / iResolution.xy + vec2(0.0) / iResolution.xy) * scale / float(oversampling);
            color += ColorFetch(coord + off);
        }
    }
    
    color *= weight;
    
    return color;
}

vec4 Grab8(vec2 coord, const float octave, const vec2 offset)
{
    float scale = exp2(octave);
    
    coord += offset;
    coord *= scale;

    if (coord.x < 0.0 || coord.x > 1.0 || coord.y < 0.0 || coord.y > 1.0)
    {
        return vec4(0.0);   
    }
    
    vec4 color = vec4(0.0);
    
    const int oversampling = 8;
    const float weight = 1. / 64.;
    
    for (int i = 0; i < oversampling; i++)
    {    	    
        for (int j = 0; j < oversampling; j++)
        {
            vec2 off = (vec2(i, j) / iResolution.xy + vec2(0.0) / iResolution.xy) * scale / float(oversampling);
            color += ColorFetch(coord + off);
        }
    }
    
    color *= weight;
    
    return color;
}

vec4 Grab16(vec2 coord, const float octave, const vec2 offset)
{
    float scale = exp2(octave);
    
    coord += offset;
    coord *= scale;

    if (coord.x < 0.0 || coord.x > 1.0 || coord.y < 0.0 || coord.y > 1.0)
    {
        return vec4(0.0);   
    }
    
    vec4 color = vec4(0.0);
    float weights = 0.0;
    
    const int oversampling = 16;
    const float weight = 1. / 256.;
    
    for (int i = 0; i < oversampling; i++)
    {    	    
        for (int j = 0; j < oversampling; j++)
        {
            vec2 off = (vec2(i, j) / iResolution.xy + vec2(0.0) / iResolution.xy) * scale / float(oversampling);
            color += ColorFetch(coord + off);
        }
    }
    
    color *= weight;
    
    return color;
}

vec2 CalcOffset(float octave)
{
    vec2 offset = vec2(0.0);
    
    vec2 padding = vec2(10.0) / iResolution.xy;
    
    offset.x = -min(1.0, floor(octave / 3.0)) * (0.25 + padding.x);
    
    offset.y = -(1.0 - (1.0 / exp2(octave))) - padding.y * octave;

    offset.y += min(1.0, floor(octave / 3.0)) * 0.35;
    
    return offset;   
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 uv = fragCoord.xy / iResolution.xy;
    
    vec4 color = vec4(0.0);
    
    /*
    Create a mipmap tree thingy with padding to prevent leaking bloom
      
  Since there's no mipmaps for the previous buffer and the reduction process has to be done in one pass,
    oversampling is required for a proper result
  */

    color += Grab1(uv, 1.0, vec2(0.0,  0.0)   );
    color += Grab4(uv, 2.0, vec2(CalcOffset(1.0))   );
    color += Grab8(uv, 3.0, vec2(CalcOffset(2.0))   );
    color += Grab16(uv, 4.0, vec2(CalcOffset(3.0))   );
    color += Grab16(uv, 5.0, vec2(CalcOffset(4.0))   );
    color += Grab16(uv, 6.0, vec2(CalcOffset(5.0))   );
    color += Grab16(uv, 7.0, vec2(CalcOffset(6.0))   );
    color += Grab16(uv, 8.0, vec2(CalcOffset(7.0))   );

    fragColor = vec4(color.rgb * color.a, 1.0);
}

layout(location = 0) out vec4 color;

void main() {
  mainImage(color, gl_FragCoord.xy);
}
`,
  },
];

const convolutionShaders = (
  direction: "HORIZONTAL" | "VERTICAL"
): ShaderSourceConfig[] => [
  quadVertShader,
  {
    type: "fragment",
    source: `#version 300 es
#define ${direction}
precision highp float;
precision highp sampler2D;

uniform vec2 uResolution;
uniform sampler2D texImage;

layout(location = 0) out vec4 color;

const float kernel[5] = float[5](
  0.19638062,
  0.29675293,
  0.09442139,
  0.01037598,
  0.00025940
);

const float offsets[5] = float[5](
  0.00000000,
  1.41176471,
  3.29411765,
  5.17647059,
  7.05882353
);

#if defined(HORIZONTAL)
const vec2 incr = vec2(1., 0.);
#else
const vec2 incr = vec2(0., 1.);
#endif

vec4 fetchColor(vec2 uv) {
  return texture(texImage, uv);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;

  vec4 sum = vec4(0.);

  if (uv.x < 0.52) {
    sum = fetchColor(uv) * kernel[0];
    float s = 1. / dot(uResolution, incr);

    for (int i = 1; i < 5; i++) {
      float offset = s * offsets[i];
      sum += fetchColor(uv + offset * incr) * kernel[i];
      sum += fetchColor(uv - offset * incr) * kernel[i];
    }
  }

  color = sum;
}
`,
  },
];

const applyBloomShader = (): ShaderSourceConfig[] => [
  quadVertShader,
  {
    type: "fragment",
    source: `#version 300 es
precision highp float;
precision highp sampler2D;

uniform sampler2D texImage;
uniform sampler2D texBloom;
uniform vec2 iResolution;
uniform float uBloom;
uniform float uSharpness;

vec3 saturate(vec3 x)
{
    return clamp(x, vec3(0.0), vec3(1.0));
}

vec4 cubic(float x)
{
    float x2 = x * x;
    float x3 = x2 * x;
    vec4 w;
    w.x =   -x3 + 3.0*x2 - 3.0*x + 1.0;
    w.y =  3.0*x3 - 6.0*x2       + 4.0;
    w.z = -3.0*x3 + 3.0*x2 + 3.0*x + 1.0;
    w.w =  x3;
    return w / 6.0;
}

vec4 BicubicTexture(in sampler2D tex, in vec2 coord)
{
  vec2 resolution = iResolution.xy;

  coord *= resolution;

  float fx = fract(coord.x);
    float fy = fract(coord.y);
    coord.x -= fx;
    coord.y -= fy;

    fx -= 0.5;
    fy -= 0.5;

    vec4 xcubic = cubic(fx);
    vec4 ycubic = cubic(fy);

    vec4 c = vec4(coord.x - 0.5, coord.x + 1.5, coord.y - 0.5, coord.y + 1.5);
    vec4 s = vec4(xcubic.x + xcubic.y, xcubic.z + xcubic.w, ycubic.x + ycubic.y, ycubic.z + ycubic.w);
    vec4 offset = c + vec4(xcubic.y, xcubic.w, ycubic.y, ycubic.w) / s;

    vec4 sample0 = texture(tex, vec2(offset.x, offset.z) / resolution);
    vec4 sample1 = texture(tex, vec2(offset.y, offset.z) / resolution);
    vec4 sample2 = texture(tex, vec2(offset.x, offset.w) / resolution);
    vec4 sample3 = texture(tex, vec2(offset.y, offset.w) / resolution);

    float sx = s.x / (s.x + s.y);
    float sy = s.z / (s.z + s.w);

    return mix( mix(sample3, sample2, sx), mix(sample1, sample0, sx), sy);
}

vec4 ColorFetch(vec2 coord)
{
    return texture(texImage, coord);   
}

vec4 BloomFetch(vec2 coord)
{
    return BicubicTexture(texBloom, coord);   
}

vec4 Grab(vec2 coord, const float octave, const vec2 offset)
{
    float scale = exp2(octave);
    
    coord /= scale;
    coord -= offset;

    return BloomFetch(coord);
}

vec2 CalcOffset(float octave)
{
    vec2 offset = vec2(0.0);
    
    vec2 padding = vec2(10.0) / iResolution.xy;
    
    offset.x = -min(1.0, floor(octave / 3.0)) * (0.25 + padding.x);
    
    offset.y = -(1.0 - (1.0 / exp2(octave))) - padding.y * octave;

    offset.y += min(1.0, floor(octave / 3.0)) * 0.35;
    
    return offset;   
}

vec4 GetBloom(vec2 coord)
{
  vec4 bloom = vec4(0.0);
  
  float s = 1. - uSharpness / 2.;

  //Reconstruct bloom from multiple blurred images
  bloom += Grab(coord, 1.0, vec2(CalcOffset(0.0))) * 1.0;
  bloom += Grab(coord, 2.0, vec2(CalcOffset(1.0))) * 1.5 * s;
  bloom += Grab(coord, 3.0, vec2(CalcOffset(2.0))) * 1.0 * pow(s, 2.);
  bloom += Grab(coord, 4.0, vec2(CalcOffset(3.0))) * 1.5 * pow(s, 3.);
  bloom += Grab(coord, 5.0, vec2(CalcOffset(4.0))) * 1.8 * pow(s, 4.);
  bloom += Grab(coord, 6.0, vec2(CalcOffset(5.0))) * 1.0 * pow(s, 5.);
  bloom += Grab(coord, 7.0, vec2(CalcOffset(6.0))) * 1.0 * pow(s, 6.);
  bloom += Grab(coord, 8.0, vec2(CalcOffset(7.0))) * 1.0 * pow(s, 7.);

  return bloom;
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    
    vec2 uv = fragCoord.xy / iResolution.xy;
    
    vec4 imgColor = ColorFetch(uv);
    vec4 bloomColor = GetBloom(uv);

    vec3 color = imgColor.rgb + bloomColor.rgb * uBloom;
    
    // color *= 200.0;
    

    //Tonemapping and color grading
    color = pow(color, vec3(1.5));
    color = color / (1.0 + color);
    color = pow(color, vec3(1.0 / 1.5));

    
    color = mix(color, color * color * (3.0 - 2.0 * color), vec3(1.0));
    color = pow(color, vec3(1.3, 1.20, 1.0));    

    color = saturate(color * 1.01);
    
    color = pow(color, vec3(0.7 / 2.2));

    fragColor = vec4(color, 1.0);

}

layout(location=0) out vec4 color;

void main() {
  mainImage(color, gl_FragCoord.xy);
}
`,
  },
];

const setResolution = (
  gl: WebGL2RenderingContext,
  l: WebGLUniformLocation,
  v: Dims
) => {
  gl.uniform2f(l, v.width, v.height);
};

class Targets {
  sampled: TextureObject;
  sampledBuffer: FramebufferObject;

  convolve1: TextureObject;
  convolve1Buffer: FramebufferObject;

  convolve2: TextureObject;
  convolve2Buffer: FramebufferObject;

  constructor(gl: WebGL2RenderingContext, size: Dims) {
    const pixels = size.width * size.height;

    this.sampled = new TextureObject(gl, {
      mode: gl.LINEAR,
      internalFormat: gl.RGBA8,
      format: gl.RGBA,
      type: gl.UNSIGNED_BYTE,
      ...size,
    });
    this.sampled.updateData(
      size.width,
      size.height,
      new Uint8Array(4 * pixels)
    );
    this.sampledBuffer = new FramebufferObject(gl, size, true, true);
    this.sampledBuffer.attach(this.sampled, 0);
    this.sampledBuffer.bind();
    this.sampledBuffer.checkStatus();

    this.convolve1 = new TextureObject(gl, {
      mode: gl.LINEAR,
      internalFormat: gl.RGBA8,
      format: gl.RGBA,
      type: gl.UNSIGNED_BYTE,
      ...size,
    });
    this.convolve1.updateData(
      size.width,
      size.height,
      new Uint8Array(4 * pixels)
    );
    this.convolve1Buffer = new FramebufferObject(gl, size, true, true);
    this.convolve1Buffer.attach(this.convolve1, 0);
    this.convolve1Buffer.bind();
    this.convolve1Buffer.checkStatus();

    this.convolve2 = new TextureObject(gl, {
      mode: gl.LINEAR,
      internalFormat: gl.RGBA8,
      format: gl.RGBA,
      type: gl.UNSIGNED_BYTE,
      ...size,
    });
    this.convolve2.updateData(
      size.width,
      size.height,
      new Uint8Array(4 * pixels)
    );
    this.convolve2Buffer = new FramebufferObject(gl, size, true, true);
    this.convolve2Buffer.attach(this.convolve2, 0);
    this.convolve2Buffer.bind();
    this.convolve2Buffer.checkStatus();
  }
}

interface Input {
  image: Texture;
}

interface Update {
  resolution?: Dims;
  params?: Partial<Params>;
}

export interface Params {
  bloom: number;
  bloomSharpness: number;
}

export class Bloom {
  private static samplerConfig = makeConfig({
    sources: samplerShaders(),
    attributes: quadVertAttributes,
    uniforms: {
      iResolution: { bindFunc: setResolution },
    },
    textures: {
      texImage: { binding: 0 },
    },
  });

  private static convolverConfig = makeConfig({
    sources: convolutionShaders("HORIZONTAL"),
    attributes: quadVertAttributes,
    uniforms: {
      uResolution: { bindFunc: setResolution },
    },
    textures: {
      texImage: { binding: 0 },
    },
  });

  private static bloomConfig = makeConfig({
    sources: applyBloomShader(),
    attributes: quadVertAttributes,
    uniforms: {
      uBloom: { bindFunc: uniform1f },
      uSharpness: { bindFunc: uniform1f },
      iResolution: { bindFunc: setResolution },
    },
    textures: {
      texImage: { binding: 0 },
      texBloom: { binding: 1 },
    },
  });

  private quad: VertexArrayObject;
  private targets: Targets;
  private sampler: ProgramType<typeof Bloom.samplerConfig>;
  private convolveHorizontal: ProgramType<typeof Bloom.convolverConfig>;
  private convolveVertical: ProgramType<typeof Bloom.convolverConfig>;
  private bloom: ProgramType<typeof Bloom.bloomConfig>;

  private params: Params = { bloom: 0, bloomSharpness: 1 };

  constructor(private gl: WebGL2RenderingContext, private size: Dims) {
    this.quad = makeQuadVao(gl);
    this.targets = new Targets(gl, size);

    this.sampler = new Program(gl, Bloom.samplerConfig);

    const horizConfig = { ...Bloom.convolverConfig };
    this.convolveHorizontal = new Program(gl, horizConfig);

    const vertConfig = {
      ...Bloom.convolverConfig,
      sources: convolutionShaders("VERTICAL"),
    };
    this.convolveVertical = new Program(gl, vertConfig);

    this.bloom = new Program(gl, Bloom.bloomConfig);
  }

  public update(update: Update) {
    if (update.resolution) {
      // this.targets.destroy() TODO
      this.targets = new Targets(this.gl, update.resolution);
      this.size = update.resolution;
    }
    if (update.params) {
      this.params = { ...this.params, ...update.params };
    }
  }

  public render(input: Input, target: RenderTarget) {
    this.gl.disable(this.gl.BLEND);

    drawWithProgram(
      this.sampler,
      () => {
        this.sampler.textures.texImage.bind(input.image);
        this.sampler.uniforms.iResolution.bind(this.size);
      },
      this.targets.sampledBuffer,
      [this.quad]
    );

    drawWithProgram(
      this.convolveHorizontal,
      () => {
        this.convolveHorizontal.uniforms.uResolution.bind(this.size);
        this.convolveHorizontal.textures.texImage.bind(this.targets.sampled);
      },
      this.targets.convolve1Buffer,
      [this.quad]
    );

    drawWithProgram(
      this.convolveVertical,
      () => {
        this.convolveVertical.uniforms.uResolution.bind(this.size);
        this.convolveVertical.textures.texImage.bind(this.targets.convolve1);
      },
      this.targets.convolve2Buffer,
      [this.quad]
    );

    drawWithProgram(
      this.bloom,
      () => {
        this.bloom.uniforms.iResolution.bind(this.size);
        this.bloom.uniforms.uBloom.bind(this.params.bloom);
        this.bloom.uniforms.uSharpness.bind(this.params.bloomSharpness);
        this.bloom.textures.texImage.bind(input.image);
        this.bloom.textures.texBloom.bind(this.targets.convolve2);
      },
      target,
      [this.quad]
    );
  }
}
