import {
  Graphics,
  TextureConfig,
  TextureObject,
  BufferObject,
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

const QUAD2 = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
const TEX_WIDTH = 1024;

export const defaultParams = {
  alpha: Math.PI,
  beta: (17.0 * Math.PI) / 180.0,
  radius: 0.05,
  velocity: 0.0067,
  size: 24,
  particles: 1024,
};

export type RenderParams = {
  alpha: number;
  beta: number;
  radius: number;
  velocity: number;
  size: number;
  particles: number;
};

export class PPS {
  private gl: WebGL2RenderingContext;

  private positions!: TextureObject[];
  private velocities!: TextureObject[];
  private colors!: TextureObject;
  private renderGfx!: Graphics;
  private updateGfx!: Graphics;

  private swap: number = 1;
  private frameBuffer!: FramebufferObject;

  private stateSize!: { width: number; height: number };
  private loopHandle!: number;

  private params: RenderParams;

  constructor(canvas: HTMLCanvasElement, private onRender: (pps: PPS) => void) {
    const gl = canvas.getContext("webgl2");
    if (!gl) throw new Error("webgl2 is required");
    this.gl = gl;

    const ext = gl.getExtension("EXT_color_buffer_float");
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
        new TextureConfig(
          "texPositions",
          gl.NEAREST,
          gl.RG32UI,
          gl.RG_INTEGER,
          gl.UNSIGNED_INT
        )
      )
    );

    this.colors = gfx.newTextureObject(
      new TextureConfig("texColors", gl.NEAREST)
    );

    gfx.addVertexArrayObject(
      new VertexArrayObject(null, 0, particles, gl.POINTS, (gl) => {
        gl.uniform2i(uStateSize, this.stateSize.width, this.stateSize.height);
        gl.uniform1f(uPointSize, this.params.size);
        this.positions[this.swap].bind(gl, 0);
        this.colors.bind(gl, 1);
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
    const uAlpha = gfx.getUniformLocation("uAlpha");
    const uBeta = gfx.getUniformLocation("uBeta");
    const uRadius = gfx.getUniformLocation("uRadius");
    const uVelocity = gfx.getUniformLocation("uVelocity");

    this.velocities = Array.from(Array(2)).map((_) =>
      gfx.newTextureObject(
        new TextureConfig(
          "texVelocities",
          gl.NEAREST,
          gl.RG32UI,
          gl.RG_INTEGER,
          gl.UNSIGNED_INT
        )
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
          gl.uniform1f(uAlpha, this.params.alpha);
          gl.uniform1f(uBeta, this.params.beta);
          gl.uniform1f(uRadius, this.params.radius);
          gl.uniform1f(uVelocity, this.params.velocity);
          let s = this.swap;
          this.positions[s].bind(gl, 0);
          this.velocities[s].bind(gl, 1);
          return true;
        }
      )
    );
  }

  private initState() {
    const gl = this.gl;
    const { width, height } = this.stateSize;
    const particles = width * height;

    const pstate = new Uint32Array(particles * 2);
    pstate.forEach((_, i, data) => {
      const n = Math.floor(i / 2);
      const xory = i % 2 === 0;
      if (xory) {
        data[i] = (0.1 + 0.9 * (((8 * n) / particles) % 1.0)) * 65535;
      } else {
        data[i] = (0.1 + (0.9 * Math.floor((8 * n) / particles)) / 8) * 65535;
      }
    });
    this.positions.forEach((p) => {
      p.updateData(gl, width, height, pstate);
    });

    const vstate = new Uint32Array(particles * 2);
    vstate.forEach((_, i, data) => {
      if (i % 2 === 0) {
        const vx = Math.random();
        const vy = Math.random();
        const norm = Math.sqrt(vx * vx + vy * vy);
        data[i] = (vx / norm) * 65535;
        data[i + 1] = (vy / norm) * 65535;
      }
    });
    this.velocities.forEach((v) => {
      v.updateData(gl, width, height, vstate);
    });

    const cdata = new Uint8ClampedArray(particles * 4);
    const cstate = new ImageData(cdata, width, height);
    cstate.data.forEach((_, i, data) => {
      data[i] = i % 4 >= 2 ? 255 : 0;
    });
    this.colors.update(gl, cstate);
  }

  private render(g: Graphics) {
    const gl = g.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  private update(g: Graphics) {
    const gl = g.gl;
    gl.disable(gl.BLEND);
    const s = this.swap;
    this.frameBuffer.attach(this.colors, 0);
    this.frameBuffer.attach(this.positions[s], 1);
    this.frameBuffer.attach(this.velocities[s], 2);
    this.swap = 1 - s;
  }

  private loop() {
    const gl = this.gl;
    // console.log("render");

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
      console.log(oldParams, params);

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
