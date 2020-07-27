import { vec2, vec3, vec4, mat4, mat3 } from "gl-matrix";
import { hsluvToRgb } from "hsluv";
import {
  Graphics,
  BufferConfig,
  CanvasObject,
  FramebufferObject,
  VertexArrayObject as VertexArrayObjectOld,
  RenderTarget,
} from "../graphics";
import { updateVertShader, updateFragShader } from "./shaders";
import { RenderParams } from "./params";
import { Drivers } from "../../audio/audio";
import { Camera } from "../util/camera";
import { CameraController } from "../util/cameraController";
import { RenderView, XRRenderTarget } from "../xr/renderer";

import { TextureObject } from "../textures";
import { UniformBuffer, VertexArrayObject } from "../buffers";
import { RenderPass } from "./render";

// const linTosRGB = (v: number) =>
//   v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;

// const sRGBtoLin = (v: number) =>
//   v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);

// const sRGB = (vals: number[]) => vals.map(sRGBtoLin);
const sRGB = (vals: number[]) => vals.map((v) => Math.pow(v, 1.05));
// const sRGB = (x: number[]) => x;

const square = [
  // add degenerate triangle
  vec2.fromValues(-1, 1),

  vec2.fromValues(-1, 1),
  vec2.fromValues(-1, -1),
  vec2.fromValues(1, -1),

  vec2.fromValues(-1, 1),
  vec2.fromValues(1, 1),
  vec2.fromValues(1, -1),

  // add degenerate triangle
  vec2.fromValues(1, -1),
];

const uvCord = [
  vec2.fromValues(-1, -1),

  vec2.fromValues(-1, -1),
  vec2.fromValues(-1, 1),
  vec2.fromValues(1, 1),

  vec2.fromValues(-1, -1),
  vec2.fromValues(1, -1),
  vec2.fromValues(1, 1),

  vec2.fromValues(1, 1),
];

interface GridSize {
  columns: number;
  rows: number;
}

const QUAD2 = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

class Textures {
  readonly image: TextureObject;
  readonly drivers: TextureObject;
  readonly amplitudes: TextureObject;
  readonly hsluv: TextureObject;

  constructor(gl: WebGL2RenderingContext, gridSize: GridSize) {
    const { columns, rows } = gridSize;

    this.image = new TextureObject(gl, {
      mode: gl.LINEAR,
      internalFormat: gl.RGBA,
      format: gl.RGBA,
      type: gl.UNSIGNED_BYTE,
    });
    const ibuf = new Uint8ClampedArray(columns * rows * 4);
    ibuf.forEach((_, i, data) => {
      if ((i & 0xf) < 8) data[i] = 255;
    });
    this.image.update(new ImageData(ibuf, columns, rows));

    this.drivers = new TextureObject(gl, {
      mode: gl.NEAREST,
      internalFormat: gl.RG32F,
      format: gl.RG,
      type: gl.FLOAT,
    });
    const dbuf = new Float32Array(rows * 2);
    this.drivers.updateData(rows, 1, dbuf);

    this.amplitudes = new TextureObject(gl, {
      mode: gl.NEAREST,
      internalFormat: gl.R32F,
      format: gl.RED,
      type: gl.FLOAT,
    });
    const abuf = new Float32Array(rows * columns);
    this.amplitudes.updateData(columns, rows, abuf);

    this.hsluv = new TextureObject(gl, {
      mode: gl.LINEAR,
      internalFormat: gl.SRGB8_ALPHA8,
      format: gl.RGBA,
      type: gl.UNSIGNED_BYTE,
      wrap: { s: gl.REPEAT, t: gl.CLAMP_TO_EDGE },
    });
    const hbuf = new Uint8ClampedArray(720 * 256 * 4);
    for (let i = 0; i < 720 * 256; i++) {
      const hue = (i % 720) / 2;
      const val = ((i / 720) * 100) / 256;
      let [r, g, b] = sRGB(hsluvToRgb([hue, 100, val]));
      hbuf.set([r * 255, g * 255, b * 255, 255], i * 4);
    }
    this.hsluv.update(new ImageData(hbuf, 720, 256));
  }

  public update(drivers: Drivers) {
    const { columns, rows } = drivers;

    const adata = new Float32Array(columns * rows);
    for (let i = 0; i < columns; i++) {
      adata.set(drivers.amp[i], rows * i);
    }
    // NOTE: this is transposed now
    this.amplitudes.updateData(rows, columns, adata);

    const ddata = new Float32Array(rows * 2);
    for (let i = 0; i < rows; i++) {
      ddata[2 * i] = drivers.scales[i];
      ddata[2 * i + 1] = drivers.energy[i];
    }
    this.drivers.updateData(rows, 1, ddata);
  }
}

export class WarpGrid {
  gl: WebGL2RenderingContext;

  private warp: Float32Array;
  private scale: Float32Array;
  private updateGfx: Graphics;
  private renderPass: RenderPass;
  private renderVaos: VertexArrayObject[];
  private canvasTarget: CanvasObject;
  private textures: Textures;
  private gridSize: GridSize;
  private buffer: FramebufferObject;
  private camera: Camera;
  private _cameraController: CameraController;
  private uCameraMatrix: UniformBuffer;

  public onFrameRate = (f: number) => {};

  constructor(
    canvas: HTMLCanvasElement,
    private params: RenderParams,
    private onUpdate: (wg: WarpGrid) => void
  ) {
    const { columns, rows } = params;
    this.gridSize = { columns: 2 * columns, rows: 2 * rows };
    const dims = { width: columns, height: rows };

    this.warp = new Float32Array(rows);
    for (let i = 0; i < this.warp.length; i++) this.warp[i] = 1;

    this.scale = new Float32Array(columns);
    for (let i = 0; i < this.scale.length; i++) this.scale[i] = 1;

    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) throw new Error("canvas does not support webgl");
    this.gl = gl;

    const ext = gl.getExtension("WEBGL_color_buffer_float");
    console.log("EXTENSION:", ext);

    this.canvasTarget = new CanvasObject(
      gl,
      (resolution) => {
        this.renderPass.update({ resolution });
      },
      true
    );

    this.camera = new Camera((45 * Math.PI) / 180, 1, -1, 1);
    this.camera.location = vec3.fromValues(0, 0, -2);
    this.camera.target = vec3.fromValues(0, 0, 0);
    this.uCameraMatrix = new UniformBuffer(gl, [
      mat4.create() as Float32Array,
      mat4.create() as Float32Array,
      mat4.create() as Float32Array,
    ]);
    this._cameraController = new CameraController(this.camera, canvas, false);

    this.textures = new Textures(gl, this.params);

    const resolution = { width: canvas.width, height: canvas.height };
    this.renderPass = new RenderPass(gl, dims, resolution);
    this.renderVaos = [this.createGridVao()];

    const fbo = new FramebufferObject(gl, dims);
    fbo.attach(this.textures.image, 0);
    fbo.bind();
    fbo.checkStatus();
    this.buffer = fbo;

    const ugfx = new Graphics(
      gl,
      fbo,
      [updateVertShader(gl), updateFragShader(gl)],
      this.update.bind(this)
    );
    this.updateGfx = ugfx;

    ugfx.attachUniform("uColumnIndex", gl.uniform1i.bind(gl));
    ugfx.attachUniform("uStateSize", (l, v: GridSize) => {
      gl.uniform2f(l, v.columns, v.rows);
    });
    ugfx.attachUniform("uColorParams.valueScale", (l, v: RenderParams) => {
      gl.uniform2f(l, v.valueScale, v.valueOffset);
    });
    ugfx.attachUniform("uColorParams.lightnessScale", (l, v: RenderParams) => {
      gl.uniform2f(l, v.lightnessScale, v.lightnessOffset);
    });
    ugfx.attachUniform("uColorParams.alphaScale", (l, v: RenderParams) => {
      gl.uniform2f(l, v.alphaScale, v.alphaOffset);
    });
    ugfx.attachUniform("uColorParams.period", gl.uniform1f.bind(gl));
    ugfx.attachUniform("uColorParams.cycle", gl.uniform1f.bind(gl));
    ugfx.attachTexture(this.textures.hsluv, "texHSLuv");
    ugfx.attachTexture(this.textures.amplitudes, "texAmplitudes");
    ugfx.attachTexture(this.textures.drivers, "texDrivers");

    const buf = ugfx.newBufferObject(
      new BufferConfig(
        QUAD2,
        [{ name: "quad", offset: 0, size: 2 }],
        () => true
      )
    );
    ugfx.addVertexArrayObject(
      new VertexArrayObjectOld(
        buf,
        0,
        QUAD2.length / 2,
        gl.TRIANGLE_STRIP,
        (g) => {
          g.bindUniform("uColumnIndex", this.columnIndex);
          g.bindUniform("uStateSize", this.params);
          g.bindUniform("uColorParams.valueScale", this.params);
          g.bindUniform("uColorParams.lightnessScale", this.params);
          g.bindUniform("uColorParams.alphaScale", this.params);
          g.bindUniform("uColorParams.period", this.params.period);
          g.bindUniform("uColorParams.cycle", this.params.colorCycle);
          g.bindTexture(this.textures.hsluv, 0);
          g.bindTexture(this.textures.amplitudes, 1);
          g.bindTexture(this.textures.drivers, 2);
          return true;
        }
      )
    );

    this.loop();
  }

  public get cameraController() {
    return this._cameraController;
  }

  private createGridVao() {
    const density = 2;
    const { aspect } = this.params;
    const { columns, rows } = this.gridSize;

    const texsx = 1 / columns;
    const texsy = 1 / rows;
    const versx = 1 / columns / aspect;
    const versy = 1 / rows / aspect;

    const vscale = mat4.create();
    mat4.fromScaling(
      vscale,
      vec3.fromValues(versx / density, versy / density, 1)
    );

    const uscale = mat3.create();
    mat3.fromScaling(uscale, vec2.fromValues(texsx, texsy));

    const stride = 7;
    const verts = new Float32Array(stride * square.length * rows * columns);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        let tx = versx * (1 + 2 * (x - columns / 2));
        let ty = versy * (1 + 2 * (y - rows / 2));
        const vtrans = mat4.create();
        mat4.fromTranslation(vtrans, vec3.fromValues(tx, ty, 0));

        tx = texsx * x;
        ty = texsy * y;
        const utrans = mat3.create();
        mat3.fromTranslation(utrans, vec2.fromValues(tx, ty));

        const vertsIdx = stride * square.length * (x + columns * y);
        for (let i = 0; i < square.length; i++) {
          const vec = vec4.fromValues(square[i][0], square[i][1], 1, 1);
          vec4.transformMat4(vec, vec, vscale);
          vec4.transformMat4(vec, vec, vtrans);

          const tex = vec3.fromValues(uvCord[i][0], uvCord[i][1], 1);
          vec3.transformMat3(tex, tex, uscale);
          vec3.transformMat3(tex, tex, utrans);

          const idx = stride * i + vertsIdx;

          verts[idx] = vec[0];
          verts[idx + 1] = vec[1];
          verts[idx + 2] = vec[2];
          verts[idx + 3] = tex[0];
          verts[idx + 4] = tex[1];
          verts[idx + 5] = square[i][0];
          verts[idx + 6] = square[i][1];
        }
      }
    }

    const vao = new VertexArrayObject(this.gl, {
      buffer: {
        mode: "static_draw",
        type: "float",
        data: verts,
      },
      offset: 0,
      length: square.length * rows * columns,
      drawMode: "triangle_strip",
      attriutes: [
        {
          attr: this.renderPass.program.attributes.vertPos,
          size: 3,
          offset: 0,
          stride: 7,
        },
        {
          attr: this.renderPass.program.attributes.texPos,
          size: 2,
          offset: 3,
          stride: 7,
        },
        // {
        //   attr: this.renderPass.program.attributes.uvPos,
        //   size: 2,
        //   offset: 5,
        //   stride: 7,
        // },
      ],
    });

    return vao;
  }

  private render(target: RenderTarget) {
    this.renderPass.render(
      {
        warp: this.warp,
        scale: this.scale,
        zScale: this.params.zscale,
        cameraMatrix: this.uCameraMatrix,
        image: this.textures.image,
        vaos: this.renderVaos,
      },
      target
    );
  }

  private update(g: Graphics) {
    g.gl.disable(g.gl.BLEND);
    this.buffer.attach(this.textures.image, 0);
  }

  private updateCamera = () => {
    this.uCameraMatrix.update([
      new Float32Array(this.camera.matrix),
      new Float32Array(mat4.create()),
      new Float32Array(this.camera.projectionMatrix),
    ]);
  };

  private loopHandle: number | null = null;

  private loop() {
    // if (this.frameCount > 20) {
    //   return;
    // }
    this.loopHandle = requestAnimationFrame(this.loop.bind(this));
    this.onUpdate(this);
    if (this.cameraController.update()) {
      this.updateCamera();
    }

    this.updateGfx.render(false);
    this.render(this.canvasTarget);

    this.frameCount = (this.frameCount + 1) & 0xffff;
  }

  private frameCount = 0;
  private lastCount = 0;

  public getFrameRate(interval: number) {
    const fc = this.frameCount;
    const count = fc - this.lastCount;
    this.lastCount = fc;
    return Math.trunc((count / interval) * 1000);
  }

  public stop() {
    if (this.loopHandle !== null) {
      cancelAnimationFrame(this.loopHandle);
      this.loopHandle = null;
    }
  }

  public setParams(params: RenderParams) {
    if (params === this.params) return;

    if (
      params.rows !== this.params.rows ||
      params.columns !== this.params.columns
    ) {
      this.stop();

      this.columnIndex = 0;
      this.params = params;
      this.gridSize = { rows: 2 * params.rows, columns: 2 * params.columns };
      this.textures = new Textures(this.gl, this.params);
      this.renderVaos = [this.createGridVao()];

      const fbo = new FramebufferObject(this.gl, {
        width: params.columns,
        height: params.rows,
      });
      fbo.attach(this.textures.image, 0);
      fbo.bind();
      fbo.checkStatus();
      this.buffer = fbo;

      this.loop();
    } else {
      this.params = params;
    }
    this.renderPass.update({ params });
  }

  private columnIndex = 0;

  public updateFromDrivers(drivers: Drivers) {
    const { rows, columns } = this.params;
    if (drivers.rows !== rows || drivers.columns !== columns)
      throw new Error("drivers size does not match display");

    this.columnIndex = drivers.getColumnIndex();
    this.calculateWarp(drivers);
    this.calculateScale(drivers);
    this.textures.update(drivers);
  }

  private calculateWarp(drivers: Drivers) {
    const { rows } = this.params;
    const { warpScale, warpOffset } = this.params;
    for (let i = 0; i < rows; i++) {
      this.warp[i] = warpScale * drivers.diff[i] + warpOffset;
    }
    for (let i = 1; i < rows - 1; i++) {
      const wl = this.warp[i - 1];
      const wr = this.warp[i + 1];
      const w = this.warp[i];
      this.warp[i] = (wl + w + wr) / 3;
    }
  }

  private calculateScale(drivers: Drivers) {
    const { columns, rows } = this.params;
    const { scaleScale, scaleOffset } = this.params;
    for (let i = 0; i < columns; i++) {
      let s = 0;
      const amp = drivers.amp[i]; // getColumn(i); shader will take care of indexing the correct column
      for (let j = 0; j < rows; j++) {
        s += drivers.scales[j] * (amp[j] - 1);
      }
      s /= rows;
      const ss = 1 - (columns - i / 2) / columns;
      this.scale[i] = scaleScale * ss * s + scaleOffset;
    }
  }

  private xrRenderTarget?: XRRenderTarget;

  private updateView = (view: RenderView) => {
    this.uCameraMatrix.update(
      [
        new Float32Array(view.transform.matrix),
        new Float32Array(view.projection),
      ],
      64
    );
    this.renderPass.program.uniformBuffers.uCameraMatrix.bind(
      this.uCameraMatrix
    );
  };

  public onEnterXR(refSpace: XRReferenceSpace) {
    this.cameraController.initReferenceSpace(refSpace);
    this.xrRenderTarget = new XRRenderTarget(
      this.gl,
      refSpace,
      this.updateView
    );
  }

  public drawXRFrame(t: number, frame: XRFrame) {
    if (!this.xrRenderTarget) return;
    this.xrRenderTarget.updateReferenceSpace(
      this.cameraController.referenceSpace
    );
    this.xrRenderTarget.onXRFrame(t, frame);
    this.render(this.xrRenderTarget);
  }
}
