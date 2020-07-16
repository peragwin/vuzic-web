import {
  TextureObject,
  ShaderConfig,
  FramebufferObject,
  Graphics,
  BufferConfig,
  VertexArrayObject,
} from "../graphics";
import { updateVertShader, PPSMode } from "./shaders";
import { QUAD2, RenderParams } from "./pps";

const GRADIENT_DETAIL = 512;
const gradientDetail = (mode: PPSMode) => {
  return mode === "3D" ? GRADIENT_DETAIL / 2 : GRADIENT_DETAIL;
};

interface Size {
  width: number;
  height: number;
  depth: number;
}

export interface BorderSize {
  radius: number;
  sharpness: number;
  intensity: number;
}

const fieldFragShader = `#version 300 es

precision mediump float;
precision highp int;

// normalize to texture resolution
uniform vec3 uResolution;

// .X is radius from border, .Y is sharpness (using pow), .Z is magnitude
uniform vec3 uBorderSize;

uniform float uTime;

layout(location = 0) out int outFieldValue;

float borderValue(vec3 xyz) {
  vec3 g = uBorderSize.z * pow(abs(xyz) * uBorderSize.x, vec3(uBorderSize.y));
  return length(g);
}

float centerBall(vec3 xyz) {
  float r = 0.5;
  float s = step(length(xyz), r) * pow(1. - length(xyz) / r, 2.); //1. / (1. + 4. * dot(xyz, xyz));
  return cos(uTime) * uBorderSize.z * smoothstep(0., 1., s); //clamp(s, 0., 1.); //
}

vec3 getUVW(in vec2 xy) {
  float s = sqrt(uResolution.z);
  float width = uResolution.x * s;
  float index = floor(gl_FragCoord.x) + floor(gl_FragCoord.y) * width;
  vec3 uvw = vec3(
    mod(index, uResolution.x),
    mod(index / uResolution.x, uResolution.y),
    index / (uResolution.x * uResolution.y));
  return uvw / uResolution;
}

void main () {
  vec3 uvw = getUVW(gl_FragCoord.xy);
  vec3 xyz = 2. * uvw - 1.;

  float bv = borderValue(xyz) + centerBall(xyz);

  outFieldValue = floatBitsToInt(bv);
}
`;

const gradientFragShader = (gl: WebGL2RenderingContext, mode: PPSMode) => {
  const source = `#version 300 es

#define PPS_MODE_${mode}

precision mediump float;
precision highp isampler2D;
precision highp int;

// normalize to texture resolution
uniform vec3 uResolution;

uniform isampler2D texFieldValue;

layout(location = 0) out ivec3 outGradientField;

ivec2 fromUVW(in ivec3 uvw) {
  uvw = clamp(uvw, ivec3(0), ivec3(uResolution));
  float s = sqrt(uResolution.z);
  int width = int(uResolution.x * s);
  int index = uvw.x + uvw.y * int(uResolution.x) + uvw.z * int(uResolution.x * uResolution.y);
  return ivec2(index % width, index / width);
}

float fetchFieldValue(ivec2 uv) {
  return intBitsToFloat(texelFetch(texFieldValue, uv, 0).r);
}

vec3 gradient(in ivec3 uvw) {
  ivec3 h = ivec3(1, 0, 0);
  ivec2 u = fromUVW(uvw + h);
  ivec2 v = fromUVW(uvw - h);
  float dx = (fetchFieldValue(u) - fetchFieldValue(v)) / 2.;
  
  h = ivec3(0, 1, 0);
  u = fromUVW(uvw + h);
  v = fromUVW(uvw - h);
  float dy = (fetchFieldValue(u) - fetchFieldValue(v)) / 2.;

  float dz = 0.;
#ifdef PPS_MODE_3D
  h = ivec3(0, 0, 1);
  u = fromUVW(uvw + h);
  v = fromUVW(uvw - h);
  dz = (fetchFieldValue(u) - fetchFieldValue(v)) / 2.;
#endif

  return vec3(-dx, -dy, -dz);
}

vec3 getUVW(in vec2 xy) {
  float s = sqrt(uResolution.z);
  float width = uResolution.x * s;
  float index = floor(gl_FragCoord.x) + floor(gl_FragCoord.y) * width;
  vec3 uvw = vec3(
    mod(index, uResolution.x),
    mod(index / uResolution.x, uResolution.y),
    index / (uResolution.x * uResolution.y));
  return uvw;
}

void main () {
  ivec3 uvw = ivec3(getUVW(gl_FragCoord.xy));

  vec3 g = gradient(uvw);
  // g += vec3(1., 1., 1.);

  outGradientField = ivec3(floatBitsToInt(g.x), floatBitsToInt(g.y), floatBitsToInt(g.z));
}
`;
  return new ShaderConfig(source, gl.FRAGMENT_SHADER);
};

export class GradientField {
  private texFieldValue: TextureObject;
  private texGradientField: TextureObject;
  private frameBuffer: FramebufferObject;
  private updateField: Graphics;
  private updateGradient: Graphics;

  private readonly detail: number;
  private size: Size;
  private storageSize: { width: number; height: number };
  private borderSize: BorderSize = { radius: 1, sharpness: 2, intensity: 1 };

  private hasUpdate = true;

  constructor(readonly gl: WebGL2RenderingContext, private mode: PPSMode) {
    this.detail = gradientDetail(mode);
    this.size = {
      width: this.detail,
      height: this.detail,
      depth: this.mode === "3D" ? this.detail : 1,
    };
    const s = Math.sqrt(this.size.depth);
    this.storageSize = {
      width: this.detail * s,
      height: this.detail * s,
    };

    this.frameBuffer = new FramebufferObject(gl, this.storageSize);

    const { texFieldValue, texGradientField } = this.initTextures();
    this.texFieldValue = texFieldValue;
    this.texGradientField = texGradientField;

    this.updateField = this.initUpdateField();
    this.updateGradient = this.initUpdateGradient();
  }

  private initTextures() {
    const gl = this.gl;
    const texWidth = this.storageSize.width;
    const texHeight = this.storageSize.height;
    const size = texWidth * texHeight;

    const texFieldValue = new TextureObject(gl, {
      mode: gl.NEAREST,
      internalFormat: gl.R32I,
      format: gl.RED_INTEGER,
      type: gl.INT,
      width: texWidth,
      height: texHeight,
      wrap: { s: gl.REPEAT, t: gl.REPEAT },
    });
    const fbuf = new Int32Array(size);
    texFieldValue.updateData(texWidth, texHeight, fbuf);

    const texGradientField = new TextureObject(gl, {
      mode: gl.NEAREST,
      internalFormat: gl.RGBA32I,
      format: gl.RGBA_INTEGER,
      type: gl.INT,
      width: texWidth,
      height: texHeight,
      wrap: { s: gl.REPEAT, t: gl.REPEAT }, // clamp for now
    });
    const gbuf = new Int32Array(size * 4);
    texGradientField.updateData(texWidth, texHeight, gbuf);

    return { texFieldValue, texGradientField };
  }

  private initUpdateField() {
    const gl = this.gl;

    const vertexShader = updateVertShader(gl);
    const fragShader = new ShaderConfig(fieldFragShader, gl.FRAGMENT_SHADER);
    const gfx = new Graphics(
      gl,
      this.frameBuffer,
      [vertexShader, fragShader],
      this.onUpdateField.bind(this)
    );

    gfx.attachUniform("uResolution", (l, v: Size) =>
      gl.uniform3f(l, v.width, v.height, v.depth)
    );
    gfx.attachUniform("uBorderSize", (l, v: BorderSize) =>
      gl.uniform3f(l, v.radius, v.sharpness, v.intensity)
    );
    gfx.attachUniform("uTime", (l, v) => gl.uniform1f(l, v));

    this.frameBuffer.attach(this.texFieldValue, 0);
    this.frameBuffer.bind();
    this.frameBuffer.checkStatus();

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
          gfx.bindUniform("uResolution", this.size);
          gfx.bindUniform("uBorderSize", this.borderSize);
          gfx.bindUniform("uTime", performance.now() / 400);
          return true;
        }
      )
    );

    return gfx;
  }

  private onUpdateField() {
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_COLOR, gl.DST_COLOR);
    this.frameBuffer.attach(this.texFieldValue, 0);
  }

  private initUpdateGradient() {
    const gl = this.gl;

    const vertexShader = updateVertShader(gl);
    const fragShader = gradientFragShader(gl, this.mode);
    const gfx = new Graphics(
      gl,
      this.frameBuffer,
      [vertexShader, fragShader],
      this.onUpdateGradient.bind(this)
    );

    gfx.attachUniform("uResolution", (l, v: Size) => {
      gl.uniform3f(l, v.width, v.height, v.depth);
    });

    gfx.attachTexture(this.texFieldValue, "texFieldValue");

    this.frameBuffer.attach(this.texGradientField, 0);
    this.frameBuffer.bind();
    this.frameBuffer.checkStatus();

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
          gfx.bindUniform("uResolution", this.size);
          gfx.bindTexture(this.texFieldValue, 0);
          return true;
        }
      )
    );

    return gfx;
  }

  private onUpdateGradient() {
    const gl = this.gl;
    gl.disable(gl.BLEND);
    this.frameBuffer.attach(this.texGradientField, 0);
  }

  public update(force = false) {
    if (this.hasUpdate || force) {
      this.hasUpdate = false;
      this.updateField.render(false);
      this.updateGradient.render(false);
    }
  }

  public gradientField() {
    return this.texGradientField;
  }

  public fieldValue() {
    return this.texFieldValue;
  }

  public setParams(params: RenderParams) {
    const { borderSize } = params;
    this.borderSize = borderSize;
    this.hasUpdate = true;
  }

  // this kind of assumes the texture is a square
  public getVirtualSize() {
    return [this.size.width, this.storageSize.width];
  }
}
