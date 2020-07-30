import { vec2, vec3, vec4, mat4, mat3 } from "gl-matrix";
import { hsluvToRgb } from "hsluv";
import { CanvasObject, FramebufferObject, RenderTarget } from "../graphics";
import { UpdatePass } from "./update";
import { RenderParams } from "./params";
import { Drivers } from "../../audio/audio";
import { Camera } from "../util/camera";
import { CameraController } from "../util/cameraController";
import { RenderView, XRRenderTarget } from "../xr/renderer";

import { TextureObject } from "../textures";
import { UniformBuffer, VertexArrayObject } from "../buffers";
import { RenderPass } from "./render";
import { Dims } from "../types";

// const linTosRGB = (v: number) =>
//   v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;

// const sRGBtoLin = (v: number) =>
//   v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);

// const sRGB = (vals: number[]) => vals.map(sRGBtoLin);
// const sRGB = (vals: number[]) => vals.map((v) => Math.pow(v, 1.5));
const sRGB = (x: number[]) => x;
// const sRGB = (v: number[]) => [
//   Math.pow(v[0], 1.1),
//   Math.pow(v[1], 2),
//   Math.pow(v[2], 1.2),
// ];

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
class Textures {
  warp: TextureObject;
  scale: TextureObject;
  readonly image: TextureObject;
  readonly drivers: TextureObject;
  readonly amplitudes: TextureObject;
  readonly hsluv: TextureObject;

  constructor(private gl: WebGL2RenderingContext, audioSize: Dims) {
    const { width: columns, height: rows } = audioSize;

    this.warp = new TextureObject(gl, {
      mode: gl.NEAREST,
      internalFormat: gl.R32F,
      format: gl.RED,
      type: gl.FLOAT,
    });
    const wbuf = new Float32Array(rows);
    this.warp.updateData(rows, 1, wbuf);

    this.scale = new TextureObject(gl, {
      mode: gl.NEAREST,
      internalFormat: gl.R32F,
      format: gl.RED,
      type: gl.FLOAT,
    });
    const sbuf = new Float32Array(columns);
    this.scale.updateData(columns, 1, sbuf);

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
      internalFormat: gl.RGBA8, //gl.SRGB8_ALPHA8,
      format: gl.RGBA,
      type: gl.UNSIGNED_BYTE,
      wrap: { s: gl.REPEAT, t: gl.CLAMP_TO_EDGE },
    });
    const hbuf = new Uint8ClampedArray(360 * 100 * 4);
    for (let i = 0; i < 36000; i++) {
      const hue = i % 360;
      const val = i / 360;
      let [r, g, b] = sRGB(hsluvToRgb([hue, 100, val]));
      hbuf.set([r * 255, g * 255, b * 255, 255], i * 4);
    }
    this.hsluv.update(new ImageData(hbuf, 360, 100));
  }

  public update(drivers: Drivers, warp: Float32Array, scale: Float32Array) {
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

    this.warp.updateData(rows, 1, warp);
    this.scale.updateData(columns, 1, scale);
  }

  public updateAudioSize(size: Dims) {
    const gl = this.gl;
    this.warp = new TextureObject(gl, {
      mode: gl.NEAREST,
      internalFormat: gl.R32F,
      format: gl.RED,
      type: gl.FLOAT,
    });
    const wbuf = new Float32Array(size.height);
    this.warp.updateData(size.height, 1, wbuf);

    this.scale = new TextureObject(gl, {
      mode: gl.NEAREST,
      internalFormat: gl.R32F,
      format: gl.RED,
      type: gl.FLOAT,
    });
    const sbuf = new Float32Array(size.width);
    this.scale.updateData(size.width, 1, sbuf);
  }
}

export class WarpGrid {
  gl: WebGL2RenderingContext;

  private warp: Float32Array;
  private scale: Float32Array;
  private updatePass: UpdatePass;
  private renderPass: RenderPass;
  private renderVaos: VertexArrayObject[];
  private canvasTarget: CanvasObject;
  private textures: Textures;
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
    console.log(params);
    const audioSize = params.audioSize;

    this.warp = new Float32Array(audioSize.height);
    for (let i = 0; i < this.warp.length; i++) this.warp[i] = 1;

    this.scale = new Float32Array(audioSize.width);
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

    this.textures = new Textures(gl, audioSize);

    const resolution = { width: canvas.width, height: canvas.height };
    this.renderPass = new RenderPass(gl, resolution);
    this.renderVaos = [this.createGridVao(params.gridSize)];

    const fbo = new FramebufferObject(gl, audioSize, true);
    fbo.attach(this.textures.image, 0);
    fbo.bind();
    fbo.checkStatus();
    this.buffer = fbo;

    this.updatePass = new UpdatePass(gl);

    this.loop();
  }

  public get cameraController() {
    return this._cameraController;
  }

  private createGridVao({ width, height }: Dims) {
    width *= 2;
    height *= 2;
    console.log(width, height);
    const density = 2;
    const { aspect } = this.params;
    // const aspect = 1.0;

    const texsx = 1 / width;
    const texsy = 1 / height;
    const versx = 1 / width / aspect;
    const versy = 1 / height / aspect;

    const vscale = mat4.create();
    mat4.fromScaling(
      vscale,
      vec3.fromValues(versx / density, versy / density, 1)
    );

    const uscale = mat3.create();
    mat3.fromScaling(uscale, vec2.fromValues(texsx, texsy));

    const stride = 7;
    const verts = new Float32Array(stride * square.length * height * width);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let tx = versx * (1 + 2 * (x - width / 2));
        let ty = versy * (1 + 2 * (y - height / 2));
        const vtrans = mat4.create();
        mat4.fromTranslation(vtrans, vec3.fromValues(tx, ty, 0));

        tx = texsx * x;
        ty = texsy * y;
        const utrans = mat3.create();
        mat3.fromTranslation(utrans, vec2.fromValues(tx, ty));

        const vertsIdx = stride * square.length * (x + width * y);
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
      length: square.length * height * width,
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
        warp: this.textures.warp,
        scale: this.textures.scale,
        columnIndex: this.columnIndex / this.params.audioSize.width,
        offset: this.params.offset,
        zScale: this.params.zscale,
        cameraMatrix: this.uCameraMatrix,
        image: this.textures.image,
        vaos: this.renderVaos,
      },
      target
    );
  }

  private update() {
    this.updatePass.render(
      {
        stateSize: this.params.audioSize,
        columnIndex: this.columnIndex,
        gamma: [
          this.params.gammaRed,
          this.params.gammaGreen,
          this.params.gammaBlue,
        ],
        valueScale: [this.params.valueScale, this.params.valueOffset],
        lightnessScale: [
          this.params.lightnessScale,
          this.params.lightnessOffset,
        ],
        alphaScale: [this.params.alphaScale, this.params.alphaOffset],
        period: this.params.period,
        cycle: this.params.colorCycle,
        amplitudes: this.textures.amplitudes,
        drivers: this.textures.drivers,
        hsluv: this.textures.hsluv,
      },
      this.buffer
    );
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

    this.update();
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
      params.audioSize.width !== this.params.audioSize.width ||
      params.audioSize.height !== this.params.audioSize.height ||
      params.gridSize.width !== this.params.gridSize.width ||
      params.gridSize.height !== this.params.gridSize.height
    ) {
      this.stop();

      this.columnIndex = 0;
      this.params = params;
      this.textures = new Textures(this.gl, this.params.audioSize);
      this.renderVaos = [this.createGridVao(this.params.gridSize)];

      const fbo = new FramebufferObject(this.gl, this.params.audioSize);
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
    const { height: rows, width: columns } = this.params.audioSize;
    if (drivers.rows !== rows) {
      this.stop();
      throw new Error(
        `drivers size (${drivers.rows}, ${drivers.columns}) ` +
          `does not match display (${rows}, ${columns})`
      );
    } else if (drivers.columns !== columns) {
      this.updateAudioSize(drivers.rows, drivers.columns);
    }

    this.columnIndex = drivers.getColumnIndex();
    this.calculateWarp(drivers);
    this.scale = drivers.mean.map((v, i) => {
      const ss = 1; // - (columns - i / 2) / columns;
      return this.params.scaleScale * v * ss + this.params.scaleOffset;
    });
    this.textures.update(drivers, this.warp, this.scale);
  }

  private updateAudioSize(rows: number, columns: number) {
    this.params.audioSize = { width: columns, height: rows };
    this.textures.updateAudioSize(this.params.audioSize);
  }

  private calculateWarp(drivers: Drivers) {
    const { height: rows } = this.params.audioSize;
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
