import { vec2, vec3, vec4, mat4, mat3 } from "gl-matrix";
import { hsluvToRgb } from "hsluv";
import {
  Graphics,
  ShaderConfig,
  TextureObject,
  BufferConfig,
  VertexArrayObject,
  CanvasObject,
  FramebufferObject,
  UniformBuffer,
} from "../graphics";
import {
  updateVertShader,
  updateFragShader,
  vertexShaderSource,
  fragmenShaderSource,
} from "./shaders";
import { RenderParams } from "./render";
import { Drivers } from "../../audio/audio";
import { Camera } from "../util/camera";
import { CameraController } from "../util/cameraController";

// const linTosRGB = (v: number) =>
//   v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;

const sRGBtoLin = (v: number) =>
  v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);

const sRGB = (vals: number[]) => vals.map(sRGBtoLin);

// const sRGB = (vals: number[]) => vals.map((v) => v * v);

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
const Z_SCALE = 0.1;

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
      internalFormat: gl.RGBA,
      format: gl.RGBA,
      type: gl.UNSIGNED_BYTE,
      wrap: { s: gl.REPEAT, t: gl.CLAMP_TO_EDGE },
    });
    const hbuf = new Uint8ClampedArray(36000 * 4);
    for (let i = 0; i < 36000; i++) {
      const hue = i % 360;
      const val = Math.floor(i / 360);
      let [r, g, b] = sRGB(hsluvToRgb([hue, 100, val]));
      hbuf.set([r * 255, g * 255, b * 255, 255], i * 4);
    }
    this.hsluv.update(new ImageData(hbuf, 360, 100));
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
  private renderGfx: Graphics;
  private textures: Textures;
  private gridSize: GridSize;
  private buffer: FramebufferObject;
  private camera: Camera;
  private cameraController: CameraController;
  private uCameraMatrix: UniformBuffer;

  public onFrameRate = (f: number) => {};

  constructor(
    canvas: HTMLCanvasElement,
    private params: RenderParams,
    private onUpdate: (wg: WarpGrid) => void
  ) {
    const { columns, rows } = params;
    this.gridSize = { columns: 2 * columns, rows: 2 * rows };

    this.warp = new Float32Array(rows);
    for (let i = 0; i < this.warp.length; i++) this.warp[i] = 1;

    this.scale = new Float32Array(columns);
    for (let i = 0; i < this.scale.length; i++) this.scale[i] = 1;

    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) throw new Error("canvas does not support webgl");
    this.gl = gl;

    this.camera = new Camera((45 * Math.PI) / 180, 1, -1, 1);
    this.camera.location = vec3.fromValues(0, 0, -1);
    this.camera.target = vec3.fromValues(0, 0, 0);
    this.uCameraMatrix = new UniformBuffer(
      gl,
      new Float32Array(this.camera.matrix)
    );
    this.cameraController = new CameraController(this.camera, canvas);

    this.textures = new Textures(gl, this.params);

    const vertexSrc = vertexShaderSource
      .replace(/\{0\}/g, rows.toString())
      .replace(/\{1\}/g, columns.toString());

    const shaderConfigs = [
      new ShaderConfig(vertexSrc, gl.VERTEX_SHADER, [], []),
      new ShaderConfig(fragmenShaderSource, gl.FRAGMENT_SHADER, [], []),
    ];
    const cv = new CanvasObject(gl);
    let gfx = new Graphics(gl, cv, shaderConfigs, this.render.bind(this));
    this.renderGfx = gfx;

    gfx.attachTexture(this.textures.image, "texImage");
    gfx.attachUniform("warp", gfx.gl.uniform1fv.bind(gfx.gl));
    gfx.attachUniform("scale", gfx.gl.uniform1fv.bind(gfx.gl));
    gfx.attachUniform("uzScale", (l, v) => gl.uniform1f(l, v));
    gfx.attachUniformBlock("uCameraMatrix", 0);

    this.createCells(gfx);

    const fbo = new FramebufferObject(gl, { width: columns, height: rows });
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
      new VertexArrayObject(
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

  private createCells(gfx: Graphics) {
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

    const warp = this.warp;
    const scale = this.scale;

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

    const buffer = gfx.newBufferObject(
      new BufferConfig(
        verts,
        [
          { name: "vertPos", size: 3, offset: 0 },
          { name: "texPos", size: 2, offset: 3 },
          { name: "uvPos", size: 2, offset: 5 },
        ],
        (_) => {
          gfx.bindUniform("warp", warp);
          gfx.bindUniform("scale", scale);
          gfx.bindUniform("uzScale", Z_SCALE);
          gfx.bindTexture(this.textures.image, 0);
          gfx.bindUniformBuffer("uCameraMatrix", this.uCameraMatrix);
          return true;
        }
      )
    );

    const vao = new VertexArrayObject(
      buffer,
      0,
      square.length * rows * columns,
      gfx.gl.TRIANGLE_STRIP
    );
    gfx.addVertexArrayObject(vao);
  }

  private render(g: Graphics) {
    const gl = g.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.DST_ALPHA);
  }

  private update(g: Graphics) {
    g.gl.disable(g.gl.BLEND);
    this.buffer.attach(this.textures.image, 0);
  }

  private updateCamera(cameraMatrix: mat4) {
    this.uCameraMatrix.update(new Float32Array(cameraMatrix));
  }

  private loopHandle: number | null = null;

  private loop() {
    // if (this.frameCount > 20) {
    //   return;
    // }
    this.loopHandle = requestAnimationFrame(this.loop.bind(this));
    this.onUpdate(this);
    this.cameraController.update(this.updateCamera.bind(this));

    this.updateGfx.render(false);
    this.renderGfx.render(false);

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
      this.createCells(this.renderGfx);

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
}
