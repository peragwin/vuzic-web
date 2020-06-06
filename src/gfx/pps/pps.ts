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
          internalFormat: gl.RG32I,
          format: gl.RG_INTEGER,
          type: gl.INT,
        })
    );

    this.velocities = Array.from(Array(2)).map(
      (_) =>
        new TextureObject(gl, {
          mode: gl.NEAREST,
          internalFormat: gl.RG32I,
          format: gl.RG_INTEGER,
          type: gl.INT,
        })
    );

    this.sortedPositions = new TextureObject(gl, {
      mode: gl.NEAREST,
      internalFormat: gl.RGBA32I,
      format: gl.RGBA_INTEGER,
      type: gl.INT,
    });

    this.countedPositions = new TextureObject(gl, {
      mode: gl.NEAREST,
      internalFormat: gl.RG32I,
      format: gl.RG_INTEGER,
      type: gl.INT,
    });

    this.palette = new TextureObject(gl, {
      mode: gl.LINEAR,
      internalFormat: gl.RGBA,
      format: gl.RGBA,
      type: gl.UNSIGNED_BYTE,
    });

    this.colors = new TextureObject(gl, {
      mode: gl.NEAREST,
      internalFormat: gl.R32I,
      format: gl.RED_INTEGER,
      type: gl.INT,
    });
  }

  public initState(
    stateSize: { width: number; height: number },
    gridSize: number,
    palette: number[]
  ) {
    const { width, height } = stateSize;
    const particles = width * height;

    const pbuf = new ArrayBuffer(particles * 2 * 4);
    const pstate = new Float32Array(pbuf);
    pstate.forEach((_, i, data) => {
      const xory = i % 2 === 0;
      if (xory) {
        data[i] = Math.random();
      } else {
        data[i] = Math.random();
      }
      data[i] = 2 * data[i] - 1 + Math.random() * 0.05;
    });
    this.positions.forEach((p) => {
      p.updateData(width, height, new Int32Array(pbuf));
    });

    const vbuf = new ArrayBuffer(particles * 2 * 4);
    const vstate = new Float32Array(vbuf);
    vstate.forEach((_, i, data) => {
      if (i % 2 === 0) {
        const vx = Math.random();
        const vy = Math.random();
        const norm = Math.sqrt(vx * vx + vy * vy);
        data[i] = vx / norm;
        data[i + 1] = vy / norm;
      }
    });
    this.velocities.forEach((v) => {
      v.updateData(width, height, new Int32Array(vbuf));
    });

    this.writeSortedPositions(
      {
        count: new Int32Array(gridSize * gridSize * 2),
        output: new Int32Array(particles * 4 * 4), // needs RBGA fmt for read
      },
      stateSize,
      gridSize
    );

    const cbuf = new ArrayBuffer(particles * 4);
    const cdata = new Float32Array(cbuf);
    cdata.forEach((_, i, data) => (data[i] = 0.5));
    this.colors.updateData(width, height, new Int32Array(cbuf));

    const paldata = new ImageData(new Uint8ClampedArray(palette), 5, 1);
    this.palette.update(paldata);
  }

  public writeSortedPositions(
    sort: {
      count: Int32Array;
      output: Int32Array;
    },
    stateSize: { width: number; height: number },
    gridSize: number
  ) {
    const { width, height } = stateSize;
    this.countedPositions.updateData(gridSize, gridSize, sort.count);
    this.sortedPositions.updateData(width, height, sort.output);
  }
}

export class PPS {
  private gl: WebGL2RenderingContext | WebGL2ComputeRenderingContext;

  private particleVAO!: VertexArrayObject;
  private textures!: Textures;
  private renderGfx!: Graphics;
  private updateGfx!: Graphics;

  private swap: number = 1;
  private frameBuffers!: FramebufferObject[];

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
    const cgl = canvas.getContext("webgl2-compute");
    if (!cgl) {
      const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
      if (!gl) throw new Error("webgl2 is required");
      this.gl = gl;
    } else {
      console.info("webgl2-compute is supported");
      this.gl = cgl;
    }

    this.params = { ...defaultParams };
    this.stateSize = this.getStateSize();

    this.textures = new Textures(this.gl);
    this.initState();
    this.initRender();
    this.initUpdate();

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

    this.frameBuffers = Array.from(Array(2)).map(
      (_) => new FramebufferObject(gl, this.stateSize)
    );

    const gfx = new Graphics(
      gl,
      this.frameBuffers[0],
      [updateVertShader(gl), updateFragShader(gl)],
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

    this.frameBuffers.forEach((fb, i) => {
      fb.attach(this.textures.positions[i], 0);
      fb.attach(this.textures.velocities[i], 1);
      fb.attach(this.textures.colors, 2);
      fb.bind();
      fb.checkStatus();
    });

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
          let s = 1 - this.swap;
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

    this.textures.initState(this.stateSize, this.gridSize, palette);
  }

  private render(g: Graphics) {
    const gl = g.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  private update(g: Graphics) {
    const gl = g.gl;
    gl.disable(gl.BLEND);

    const tgt = 1 - this.swap;
    this.swap = tgt;

    this.updateGfx.swapTarget(this.frameBuffers[tgt]);

    this.frameBuffers[tgt].attach(this.textures.positions[tgt], 0);
    this.frameBuffers[tgt].attach(this.textures.velocities[tgt], 1);
    this.frameBuffers[tgt].attach(this.textures.colors, 2);
  }

  private calculateSortedPositions(src: number) {
    const gl = this.gl;
    const particles = this.stateSize.width * this.stateSize.height;

    // // attach the src position texture to the buffer so we can read it
    this.frameBuffers[src].attach(this.textures.positions[src], 0);
    this.frameBuffers[src].bind();

    const pbuf = new ArrayBuffer(particles * 4 * 4);
    const pdata = new Float32Array(pbuf);
    this.frameBuffers[src].readData(
      new Int32Array(pbuf),
      0,
      gl.RGBA_INTEGER,
      gl.INT
    );
    const sort = this.countingSort(pdata);
    const output = new Int32Array(sort.output.buffer);
    this.textures.writeSortedPositions(
      { ...sort, output },
      this.stateSize,
      this.gridSize
    );

    if (this.frameCount % 4 === 0) {
      this.updateColorThresholds(sort.count);
    }
  }

  private lastTime: number = 0;

  private loop() {
    // if (this.frameCount++ < 20) {
    this.loopHandle = requestAnimationFrame(this.loop.bind(this));
    // }

    this.onRender(this);

    this.calculateSortedPositions(this.swap);
    this.updateGfx.render(false);
    this.renderGfx.render(false);

    if (this.frameCount % 16 === 0) {
      this.captureFrameRate(16);
    }
    this.frameCount = (this.frameCount + 1) & 0xffff;
  }

  public stop() {
    cancelAnimationFrame(this.loopHandle);
  }

  private getStateSize = () => ({
    width: Math.min(this.params.particles, TEX_WIDTH),
    height: Math.ceil(this.params.particles / TEX_WIDTH),
  });

  public setParams(params: RenderParams) {
    if (params === this.params) return;

    if (this.params.particles !== params.particles) {
      this.stop();
      this.params = params;

      this.stateSize = this.getStateSize();
      this.textures = new Textures(this.gl);
      this.initState();
      this.initRender();
      this.initUpdate();

      this.loop();
    } else {
      this.params = params;
    }
  }

  async updateColorThresholds(count: Int32Array) {
    const [mean, std] = getCountStatistics(count);
    const cellsInRadius = Math.ceil(this.params.radius * this.gridSize);
    this.colors.thresholds = getColorThresholds(mean, std, cellsInRadius);
  }

  public onFrameRate: ((f: number) => void) | undefined;

  private captureFrameRate(interval: number) {
    const now = Date.now();
    const elapsed = now - this.lastTime;
    this.lastTime = now;
    this.frameRate = (interval / elapsed) * 1000;
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
