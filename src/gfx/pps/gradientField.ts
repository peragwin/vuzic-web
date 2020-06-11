import {
  TextureObject,
  ShaderConfig,
  FramebufferObject,
  Graphics,
  BufferConfig,
  VertexArrayObject,
} from "../graphics";
import { updateVertShader } from "./shaders";
import { QUAD2, RenderParams } from "./pps";

const GRADIENT_DETAIL = 512;

interface Size {
  width: number;
  height: number;
}

export interface BorderSize {
  radius: number;
  sharpness: number;
  intensity: number;
}

const fieldFragShader = `#version 300 es

precision mediump float;
precision highp isampler2D;
precision highp int;

// normalize to screen resolution
uniform vec2 uResolution;

// .X is radius from border, .Y is sharpness (using pow)
uniform vec3 uBorderSize;

uniform isampler2D texFieldValue;

layout(location = 0) out int outFieldValue;

// vec2 fetchFieldValue(vec2 uv) {
//   return float(texture(texGradientField, uv).rg) / 32768.;
//   // return intBitsToFloat(texelFetch(texGradientField, index, 0).r);
// }

float borderValue(vec2 uv) {
  vec2 xy = 2. * uv - 1.;
  vec2 g = uBorderSize.z * pow(abs(xy) * uBorderSize.x, vec2(uBorderSize.y));
  // vec2 g = uBorderSize.xy * uv;
  return length(g);
}

void main () {
  vec2 uv = gl_FragCoord.xy / 512. + uResolution/32768.;

  float bv = borderValue(uv);

  outFieldValue = floatBitsToInt(bv);
}
`;

const gradientFragShader = `#version 300 es

precision mediump float;
precision highp isampler2D;
precision highp int;

// normalize to screen resolution
// uniform vec2 uResolution;

uniform isampler2D texFieldValue;

layout(location = 0) out ivec2 outGradientField;

float fetchFieldValue(ivec2 uv) {
  return intBitsToFloat(texelFetch(texFieldValue, uv, 0).r);
}

vec2 gradient(in ivec2 uv) {
  ivec2 h = ivec2(1, 0);
  float dx = (fetchFieldValue(uv + h) - fetchFieldValue(uv - h)) / 2.;
  h = ivec2(0, 1);
  float dy = (fetchFieldValue(uv + h) - fetchFieldValue(uv - h)) / 2.;
  return vec2(-dx, -dy);
}

void main () {
  ivec2 uv = ivec2(gl_FragCoord.xy);

  vec2 d = gradient(uv);

  outGradientField = ivec2(floatBitsToInt(d.x), floatBitsToInt(d.y));
}
`;

export class GradientField {
  private texFieldValue: TextureObject[];
  private texGradientField: TextureObject;
  private frameBuffer: FramebufferObject;
  private updateField: Graphics;
  private updateGradient: Graphics;

  private swap = 0;
  private size: Size = { width: GRADIENT_DETAIL, height: GRADIENT_DETAIL };
  private borderSize: BorderSize = { radius: 1, sharpness: 2, intensity: 1 };

  private hasUpdate = true;

  constructor(readonly gl: WebGL2RenderingContext) {
    this.frameBuffer = new FramebufferObject(gl, this.size);

    const { texFieldValue, texGradientField } = this.initTextures();
    this.texFieldValue = texFieldValue;
    this.texGradientField = texGradientField;

    this.updateField = this.initUpdateField();
    this.updateGradient = this.initUpdateGradient();
  }

  private initTextures() {
    const gl = this.gl;
    const texFieldValue = Array.from(Array(2)).map((_) => {
      const tex = new TextureObject(gl, {
        mode: gl.NEAREST,
        internalFormat: gl.R32I,
        format: gl.RED_INTEGER,
        type: gl.INT,
      });
      const fbuf = new Int32Array(GRADIENT_DETAIL * GRADIENT_DETAIL);
      tex.updateData(GRADIENT_DETAIL, GRADIENT_DETAIL, fbuf);
      return tex;
    });

    const texGradientField = new TextureObject(gl, {
      mode: gl.NEAREST,
      internalFormat: gl.RG32I,
      format: gl.RG_INTEGER,
      type: gl.INT,
      // wrap: {s: gl.REPEAT, t: gl.REPEAT} // clamp for now
    });
    const gbuf = new Int32Array(GRADIENT_DETAIL * GRADIENT_DETAIL * 2);
    texGradientField.updateData(GRADIENT_DETAIL, GRADIENT_DETAIL, gbuf);

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
      gl.uniform2f(l, v.width, v.height)
    );
    gfx.attachUniform("uBorderSize", (l, v: BorderSize) =>
      gl.uniform3f(l, v.radius, v.sharpness, v.intensity)
    );

    this.frameBuffer.attach(this.texFieldValue[0], 0);
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
          // gl.clearColor(0, 0, 0, 0);
          // gl.clear(gl.COLOR_BUFFER_BIT);
          gfx.bindUniform("uResolution", this.size);
          gfx.bindUniform("uBorderSize", this.borderSize);
          // gfx.bindTexture(this.texFieldValue[1 - this.swap], 0);
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
    this.frameBuffer.attach(this.texFieldValue[this.swap], 0);
  }

  private initUpdateGradient() {
    const gl = this.gl;

    const vertexShader = updateVertShader(gl);
    const fragShader = new ShaderConfig(gradientFragShader, gl.FRAGMENT_SHADER);
    const gfx = new Graphics(
      gl,
      this.frameBuffer,
      [vertexShader, fragShader],
      this.onUpdateGradient.bind(this)
    );

    // gfx.attachUniform("uResolution", (l, v: Size) =>
    //   gl.uniform2f(l, v.width, v.height)
    // );
    this.texFieldValue.forEach((tex) =>
      gfx.attachTexture(tex, "texFieldValue")
    );

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
          // gl.clearColor(0, 0, 0, 0);
          // gl.clear(gl.COLOR_BUFFER_BIT);
          // gfx.bindUniform("uResolution", this.size);
          gfx.bindTexture(this.texFieldValue[this.swap], 0);
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
      console.log("update gfield");
      this.hasUpdate = false;
      this.updateField.render(false);
      this.updateGradient.render(false);
    }
  }

  public gradientField() {
    return this.texGradientField;
  }

  public fieldValue() {
    return this.texFieldValue[this.swap];
  }

  public setParams(params: RenderParams) {
    const { borderSize } = params;
    this.borderSize = borderSize;
    this.hasUpdate = true;
  }
}
