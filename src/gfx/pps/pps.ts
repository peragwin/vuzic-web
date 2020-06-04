import {
  Graphics,
  TextureObject,
  BufferConfig,
  VertexArrayObject,
  CanvasObject,
  FramebufferObject,
} from "../graphics";
import {
  drawVertShader,
  drawFragShader,
  updateVertShader,
  updateFragShader,
} from "./shaders";
import { getPalette, ParamsVersion } from "./params";
import { countingSort } from "./countingsort";

const QUAD2 = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
const TEX_WIDTH = 1024;

export const defaultParams = {
  alpha: Math.PI,
  beta: (17.0 * Math.PI) / 180.0,
  radius: 0.05,
  velocity: 0.0067,
  radialDecay: 0,
  size: 4,
  particles: +(process.env.REACT_APP_INIT_PARTICLES || "8192"),
  palette: "default",
  version: "v0.1" as ParamsVersion,
};

export type RenderParams = {
  alpha: number;
  beta: number;
  radius: number;
  velocity: number;
  size: number;
  radialDecay: number;
  particles: number;
  palette: string;
  version: ParamsVersion;
};

interface ColorParams {
  palette: number[];
  thresholds: number[];
}

class Textures {
  positions: TextureObject[];
  velocities: TextureObject[];
  sortedPositions: TextureObject;
  countedPositions: TextureObject;

  palette: TextureObject;
  colors: TextureObject;

  constructor(gl: WebGL2RenderingContext) {
    // format is x0, y0, x1, y1, ...
    this.positions = Array.from(Array(2)).map(
      (_) =>
        new TextureObject(gl, {
          mode: gl.NEAREST,
          internalFormat: gl.RG32F,
          format: gl.RG,
          type: gl.FLOAT,
        })
    );

    this.velocities = Array.from(Array(2)).map(
      (_) =>
        new TextureObject(gl, {
          mode: gl.NEAREST,
          internalFormat: gl.RG32F,
          format: gl.RG,
          type: gl.FLOAT,
        })
    );

    this.sortedPositions = new TextureObject(gl, {
      mode: gl.NEAREST,
      internalFormat: gl.RGBA32F,
      format: gl.RGBA,
      type: gl.FLOAT,
    });

    this.countedPositions = new TextureObject(gl, {
      mode: gl.NEAREST,
      internalFormat: gl.RG32I,
      format: gl.RG_INTEGER,
      type: gl.INT,
    });

    this.palette = new TextureObject(gl, {
      mode: gl.NEAREST,
      internalFormat: gl.RGBA,
      format: gl.RGBA,
      type: gl.UNSIGNED_BYTE,
    });

    this.colors = new TextureObject(gl, {
      mode: gl.NEAREST,
      internalFormat: gl.R8UI,
      format: gl.RED_INTEGER,
      type: gl.UNSIGNED_BYTE,
    });
  }
}

export class PPS {
  private gl: WebGL2RenderingContext;

  private particleVAO!: VertexArrayObject;
  private textures!: Textures;
  private renderGfx!: Graphics;
  private updateGfx!: Graphics;

  private swap: number = 1;
  private frameBuffer!: FramebufferObject;

  private stateSize!: { width: number; height: number };
  private gridSize = 48;
  private loopHandle!: number;
  private frameCount = 0;
  private frameRate = 0;
  public paused = false;

  private countingSort = countingSort(this.gridSize, 4);
  private params: RenderParams;
  private colors!: ColorParams;

  constructor(canvas: HTMLCanvasElement, private onRender: (pps: PPS) => void) {
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) throw new Error("webgl2 is required");
    this.gl = gl;

    let ext = gl.getExtension("EXT_color_buffer_float");
    if (!ext) throw new Error("extension EXT_color_buffer_float is required");

    this.params = { ...defaultParams };
    this.stateSize = this.getStateSize();

    this.textures = new Textures(gl);
    this.initRender();
    this.initUpdate();
    this.initState();

    this.loop();
  }

  private initRender() {
    const gl = this.gl;
    const particles = this.params.particles;

    const canvas = new CanvasObject(gl);
    const shaderConfigs = [drawFragShader(gl), drawVertShader(gl)];
    const gfx = new Graphics(gl, canvas, shaderConfigs, this.render.bind(this));
    this.renderGfx = gfx;

    this.textures.positions.map((p) => gfx.attachTexture(p, "texPositions"));

    gfx.attachUniform(
      "uStateSize",
      (loc, value: { width: number; height: number }) => {
        gl.uniform2i(loc, value.width, value.height);
      }
    );
    gfx.attachUniform("uPointSize", (l, v) => gl.uniform1f(l, v));

    this.textures.positions.forEach((p) =>
      gfx.attachTexture(p, "texPositions")
    );
    gfx.attachTexture(this.textures.colors, "texColors");
    gfx.attachTexture(this.textures.palette, "texPalette");

    this.particleVAO = new VertexArrayObject(
      null,
      0,
      particles,
      gl.POINTS,
      (gfx: Graphics) => {
        gfx.bindUniform("uStateSize", this.stateSize);
        gfx.bindUniform("uPointSize", this.params.size);
        gfx.bindTexture(this.textures.positions[this.swap], 0);
        gfx.bindTexture(this.textures.colors, 1);
        gfx.bindTexture(this.textures.palette, 2);
        return true;
      }
    );
    gfx.addVertexArrayObject(this.particleVAO);
  }

  private initUpdate() {
    const gl = this.gl;

    this.frameBuffer = new FramebufferObject(gl, this.stateSize);
    const shaders = [updateVertShader(gl), updateFragShader(gl)];
    const gfx = new Graphics(
      gl,
      this.frameBuffer,
      shaders,
      this.update.bind(this)
    );
    this.updateGfx = gfx;

    gfx.attachUniform(
      "uStateSize",
      (loc, value: { width: number; height: number }) =>
        gl.uniform2i(loc, value.width, value.height)
    );
    gfx.attachUniform("uGridSize", (l, v) => gl.uniform1i(l, v));
    gfx.attachUniform("uAlpha", (l, v) => gl.uniform1f(l, v));
    gfx.attachUniform("uBeta", (l, v) => gl.uniform1f(l, v));
    gfx.attachUniform("uRadius", (l, v) => gl.uniform1f(l, v));
    gfx.attachUniform("uVelocity", (l, v) => gl.uniform1f(l, v));
    gfx.attachUniform("uRadialDecay", (l, v) => gl.uniform1f(l, v));
    gfx.attachUniform("uColorThresholds", (l, v) => gl.uniform1fv(l, v));

    this.textures.positions.forEach((p) =>
      gfx.attachTexture(p, "texPositions")
    );
    this.textures.velocities.forEach((p) =>
      gfx.attachTexture(p, "texVelocities")
    );
    gfx.attachTexture(this.textures.sortedPositions, "texSortedPositions");
    gfx.attachTexture(this.textures.countedPositions, "texCountedPositions");

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
          gfx.bindUniform("uStateSize", this.stateSize);
          gfx.bindUniform("uGridSize", this.gridSize);
          gfx.bindUniform("uAlpha", this.params.alpha);
          gfx.bindUniform("uBeta", this.params.beta);
          gfx.bindUniform("uRadius", this.params.radius);
          gfx.bindUniform("uVelocity", this.params.velocity);
          gfx.bindUniform("uRadialDecay", this.params.radialDecay);
          gfx.bindUniform("uColorThresholds", this.colors.thresholds);
          let s = this.swap;
          gfx.bindTexture(this.textures.positions[s], 0);
          gfx.bindTexture(this.textures.velocities[s], 1);
          gfx.bindTexture(this.textures.sortedPositions, 2);
          gfx.bindTexture(this.textures.countedPositions, 3);
          return true;
        }
      )
    );
  }

  private initState() {
    const { width, height } = this.stateSize;
    const particles = width * height;

    this.particleVAO.length = particles;

    const pstate = new Float32Array(particles * 2);
    pstate.forEach((_, i, data) => {
      const xory = i % 2 === 0;
      if (xory) {
        data[i] = Math.random();
      } else {
        data[i] = Math.random();
      }
      data[i] = 2 * data[i] - 1 + Math.random() * 0.05;
    });
    this.textures.positions.forEach((p) => {
      p.updateData(width, height, pstate);
    });

    const vstate = new Float32Array(particles * 2);
    vstate.forEach((_, i, data) => {
      if (i % 2 === 0) {
        const vx = Math.random();
        const vy = Math.random();
        const norm = Math.sqrt(vx * vx + vy * vy);
        data[i] = vx / norm;
        data[i + 1] = vy / norm;
      }
    });
    this.textures.velocities.forEach((v) => {
      v.updateData(width, height, vstate);
    });

    this.writeSortedPositions({
      count: new Int32Array(this.gridSize * this.gridSize * 2),
      output: new Float32Array(particles * 4), // needs RBGA fmt for read
    });

    let palette = (this.params.palette as any) as number[];
    if (typeof palette === "string") {
      const p = getPalette(this.params.palette);
      if (!p) {
        throw new Error(
          `invalid palette in config: ${JSON.stringify(this.params)}`
        );
      }
      palette = p;
    }
    this.colors = {
      palette,
      thresholds: [10, 15, 30, 50],
    };

    const cdata = new Uint8ClampedArray(particles);
    cdata.forEach((_, i, data) => (data[i] = 2));
    this.textures.colors.updateData(width, height, cdata);

    const paldata = new ImageData(new Uint8ClampedArray(palette), 5, 1);
    this.textures.palette.update(paldata);
    console.log(paldata);
  }

  private render(g: Graphics) {
    const gl = g.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  private writeSortedPositions(sort: {
    count: Int32Array;
    output: Float32Array;
  }) {
    const { width, height } = this.stateSize;
    const gridSize = this.gridSize;
    this.textures.countedPositions.updateData(gridSize, gridSize, sort.count);
    this.textures.sortedPositions.updateData(width, height, sort.output);
  }

  private update(g: Graphics) {
    const gl = g.gl;
    gl.disable(gl.BLEND);

    const tgt = this.swap;
    const src = 1 - tgt;
    const particles = this.stateSize.width * this.stateSize.height;

    // attach the src position texture to the buffer so we can read it
    this.frameBuffer.attach(this.textures.positions[src], 1);
    this.frameBuffer.bind();
    const pdata = new Float32Array(particles * 4);
    this.frameBuffer.readData(pdata, 1);
    const sort = this.countingSort(pdata);
    this.writeSortedPositions(sort);

    if (this.frameCount % 16 === 0) {
      this.updateColorThresholds(sort.count);
    }

    this.frameBuffer.attach(this.textures.colors, 0);
    this.frameBuffer.attach(this.textures.positions[tgt], 1);
    this.frameBuffer.attach(this.textures.velocities[tgt], 2);
    this.swap = src;
  }

  private lastTime: number = 0;

  private loop() {
    // if (this.frameCount++ < 2000) {
    this.loopHandle = requestAnimationFrame(this.loop.bind(this));
    // }

    this.onRender(this);

    this.updateGfx.render(false);

    this.renderGfx.render(false);

    if (this.frameCount % 256 === 0) {
      this.captureFrameRate();
    }

    this.frameCount = (this.frameCount + 1) % 0xffff;
  }

  public stop() {
    cancelAnimationFrame(this.loopHandle);
  }

  private getStateSize = () => ({
    width: Math.min(this.params.particles, TEX_WIDTH),
    height: Math.ceil(this.params.particles / TEX_WIDTH),
  });

  public setParams(params: RenderParams) {
    if (params !== this.params) {
      this.stop();

      const oldParams = this.params;
      this.params = params;

      if (oldParams.particles !== params.particles) {
        this.stateSize = this.getStateSize();
        this.textures = new Textures(this.gl);
        this.initRender();
        this.initUpdate();
        this.initState();
      }

      this.loop();
    }
  }

  async updateColorThresholds(count: Int32Array) {
    const [mean, std] = getCountStatistics(count);
    const cellsInRadius = Math.ceil(this.params.radius * this.gridSize);
    this.colors.thresholds = getColorThresholds(mean, std, cellsInRadius);
  }

  public onFrameRate: ((f: number) => void) | undefined;

  captureFrameRate() {
    const now = Date.now();
    const elapsed = now - this.lastTime;
    this.lastTime = now;
    this.frameRate = (256 / elapsed) * 1000;
    if (this.onFrameRate) {
      this.onFrameRate(this.frameRate);
    }
  }
}

function getCountStatistics(countData: Int32Array) {
  let sum = 0;
  for (let i = 0; i < countData.length; i += 2) {
    const c = countData[i];
    sum += c;
  }

  const mean = (sum / countData.length) * 2;

  sum = 0;
  for (let i = 0; i < countData.length; i += 2) {
    let dev = countData[i] - mean;
    sum += dev * dev;
  }

  const std = Math.sqrt((sum / countData.length) * 2);

  return [mean, std];
}

function getColorThresholds(mean: number, std: number, cellsInRadius: number) {
  const c2 = cellsInRadius * cellsInRadius;
  const particlesInRadius = mean * c2;
  const dev = std * c2;

  const thresholds = [];
  for (let i = 0; i < 4; i++) {
    const d = ((-1.5 + i) * dev) / 2;
    thresholds.push(d + particlesInRadius);
  }

  return thresholds;
}
