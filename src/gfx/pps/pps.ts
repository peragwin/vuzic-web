import {
  Graphics,
  TextureConfig,
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
import { getPalette } from "./params";
import { countingSort, CountingSorter } from "./countingsort";

const QUAD2 = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
const TEX_WIDTH = 1024;

export const defaultParams = {
  alpha: Math.PI,
  beta: (17.0 * Math.PI) / 180.0,
  radius: 0.05,
  velocity: 0.0067,
  size: 8,
  particles: 8192,
  palette: getPalette("default")!,
};

export type RenderParams = {
  alpha: number;
  beta: number;
  radius: number;
  velocity: number;
  size: number;
  particles: number;
  palette: number[];
};

export class PPS {
  private gl: WebGL2RenderingContext;

  private positions!: TextureObject[];
  private velocities!: TextureObject[];
  private colors!: TextureObject;
  private palette!: TextureObject;
  private renderGfx!: Graphics;
  private updateGfx!: Graphics;
  private sortedPositions!: TextureObject;
  private countedPositions!: TextureObject;

  private swap: number = 1;
  private frameBuffer!: FramebufferObject;

  private stateSize!: { width: number; height: number };
  private gridSize = 32;
  private loopHandle!: number;

  private countingSort = countingSort(this.gridSize, 4);
  private params: RenderParams;

  constructor(canvas: HTMLCanvasElement, private onRender: (pps: PPS) => void) {
    const gl = canvas.getContext("webgl2");
    if (!gl) throw new Error("webgl2 is required");
    this.gl = gl;

    let ext = gl.getExtension("EXT_color_buffer_float");
    if (!ext) throw new Error("extension EXT_color_buffer_float is required");

    this.params = { ...defaultParams };
    this.stateSize = this.getStateSize();

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

    const uStateSize = gfx.getUniformLocation("uStateSize");
    const uPointSize = gfx.getUniformLocation("uPointSize");

    // format is x0, y0, x1, y1, ...
    this.positions = Array.from(Array(2)).map((_) =>
      gfx.newTextureObject(
        new TextureConfig("texPositions", gl.NEAREST, gl.RG32F, gl.RG, gl.FLOAT)
      )
    );

    this.palette = gfx.newTextureObject(
      new TextureConfig(
        "texPalette",
        gl.NEAREST,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE
      )
    );

    this.colors = gfx.newTextureObject(
      new TextureConfig(
        "texColors",
        gl.NEAREST,
        gl.R8UI,
        gl.RED_INTEGER,
        gl.UNSIGNED_BYTE
      )
    );

    gfx.addVertexArrayObject(
      new VertexArrayObject(null, 0, particles, gl.POINTS, (gl) => {
        gl.uniform2i(uStateSize, this.stateSize.width, this.stateSize.height);
        gl.uniform1f(uPointSize, this.params.size);
        this.positions[this.swap].bind(gl, 0);
        this.colors.bind(gl, 1);
        this.palette.bind(gl, 2);
        return true;
      })
    );
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

    const uStateSize = gfx.getUniformLocation("uStateSize");
    const uGridSize = gfx.getUniformLocation("uGridSize");
    const uAlpha = gfx.getUniformLocation("uAlpha");
    const uBeta = gfx.getUniformLocation("uBeta");
    const uRadius = gfx.getUniformLocation("uRadius");
    const uVelocity = gfx.getUniformLocation("uVelocity");

    this.velocities = Array.from(Array(2)).map((_) =>
      gfx.newTextureObject(
        new TextureConfig(
          "texVelocities",
          gl.NEAREST,
          gl.RG32F,
          gl.RG,
          gl.FLOAT
        )
      )
    );

    this.sortedPositions = gfx.newTextureObject(
      new TextureConfig(
        "texSortedPositions",
        gl.NEAREST,
        gl.RGBA32F,
        gl.RGBA,
        gl.FLOAT
      )
    );

    this.countedPositions = gfx.newTextureObject(
      new TextureConfig(
        "texCountedPositions",
        gl.NEAREST,
        gl.RG32I,
        gl.RG_INTEGER,
        gl.INT
      )
    );

    const buf = gfx.newBufferObject(
      new BufferConfig(QUAD2, "quad", "", 2, 4, () => true)
    );
    gfx.addVertexArrayObject(
      new VertexArrayObject(
        buf,
        0,
        QUAD2.length / 2,
        gl.TRIANGLE_STRIP,
        (gl) => {
          gl.uniform2i(uStateSize, this.stateSize.width, this.stateSize.height);
          gl.uniform1i(uGridSize, this.gridSize);
          gl.uniform1f(uAlpha, this.params.alpha);
          gl.uniform1f(uBeta, this.params.beta);
          gl.uniform1f(uRadius, this.params.radius);
          gl.uniform1f(uVelocity, this.params.velocity);
          let s = this.swap;
          this.positions[s].bind(gl, 0);
          this.velocities[s].bind(gl, 1);
          this.sortedPositions.bind(gl, 2);
          this.countedPositions.bind(gl, 3);
          return true;
        }
      )
    );
  }

  private initState() {
    const gl = this.gl;
    const { width, height } = this.stateSize;
    const particles = width * height;

    const pstate = new Float32Array(particles * 2);
    pstate.forEach((_, i, data) => {
      const n = Math.floor(i / 2);
      const xory = i % 2 === 0;
      if (xory) {
        data[i] = Math.random();
      } else {
        data[i] = Math.random();
      }
      data[i] = 2 * data[i] - 1 + Math.random() * 0.05;
    });
    this.positions.forEach((p) => {
      p.updateData(gl, width, height, pstate);
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
    this.velocities.forEach((v) => {
      v.updateData(gl, width, height, vstate);
    });

    this.writeSortedPositions({
      count: new Int32Array(this.gridSize * this.gridSize * 2),
      output: new Float32Array(particles * 4), // needs RBGA fmt for read
    });

    const cdata = new Uint8ClampedArray(particles);
    this.colors.updateData(gl, width, height, cdata);

    const palette = new ImageData(
      new Uint8ClampedArray(this.params.palette),
      5,
      1
    );
    this.palette.update(gl, palette);
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
    this.countedPositions.updateData(this.gl, gridSize, gridSize, sort.count);
    this.sortedPositions.updateData(this.gl, width, height, sort.output);
  }

  private update(g: Graphics) {
    const gl = g.gl;
    gl.disable(gl.BLEND);

    const tgt = this.swap;
    const src = 1 - tgt;
    const particles = this.stateSize.width * this.stateSize.height;

    // attach the src position texture to the buffer so we can read it
    this.frameBuffer.attach(this.positions[src], 1);
    this.frameBuffer.bind();
    const pdata = new Float32Array(particles * 4);
    this.frameBuffer.readData(pdata, 1);
    // console.log(pdata);
    const sort = this.countingSort(pdata);
    // console.log(sort);
    this.writeSortedPositions(sort);

    this.frameBuffer.attach(this.colors, 0);
    this.frameBuffer.attach(this.positions[tgt], 1);
    this.frameBuffer.attach(this.velocities[tgt], 2);
    this.swap = src;
  }

  private loop() {
    const gl = this.gl;

    this.onRender(this);

    this.updateGfx.render(false);

    this.renderGfx.render(false);

    // if (count++ < 20) {
    this.loopHandle = requestAnimationFrame(this.loop.bind(this, gl));
    // }
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
        this.initState();
      }

      this.loop();
    }
  }
}

var count = 0;
