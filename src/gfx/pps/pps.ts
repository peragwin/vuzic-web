import {
  Graphics, TextureConfig, TextureObject, BufferObject, BufferConfig, VertexArrayObject, CanvasObject, FramebufferObject,
} from "../graphics";
import { drawVertShader, drawFragShader, updateVertShader, updateFragShader } from './shaders';

const QUAD2 = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
const TEX_WIDTH = 2048;
const POINT_SIZE = 24;

export class PPS {
  private positions!: TextureObject[];
  private velocities!: TextureObject[];
  private colors!: TextureObject;
  private renderGfx!: Graphics;
  private updateGfx!: Graphics;

  private swap: number = 1;
  private frameBuffer!: FramebufferObject;

  private stateSize!: { width: number, height: number };
  private params: { alpha: number, beta: number, radius: number };

  constructor(
    canvas: HTMLCanvasElement,
    readonly particles: number,
  ) {
    const gl = canvas.getContext('webgl2');
    if (!gl) throw new Error("webgl2 is required");

    const ext = gl.getExtension('EXT_color_buffer_float');
    if (!ext) throw new Error("extension EXT_color_buffer_float is required");

    this.stateSize = {
      width: Math.min(particles, TEX_WIDTH),
      height: Math.ceil(particles / TEX_WIDTH),
    };

    this.params = {
      alpha: Math.PI,
      beta: 2 * Math.PI / 17.0,
      radius: 64,
    }

    this.initRender(gl);
    this.initUpdate(gl);
    this.initState(gl);

    this.loop(gl);
  }

  private initRender(gl: WebGL2RenderingContext) {
    const particles = this.particles;

    const canvas = new CanvasObject(gl);
    const shaderConfigs = [drawFragShader(gl), drawVertShader(gl)];
    const gfx = new Graphics(gl, canvas, shaderConfigs, this.render.bind(this));
    this.renderGfx = gfx;

    const uStateSize = gfx.getUniformLocation('uStateSize');
    const uPointSize = gfx.getUniformLocation('uPointSize');

    // format is x0, y0, x1, y1, ...
    this.positions = Array.from(Array(2)).map(_ =>
      gfx.newTextureObject(
        new TextureConfig('texPositions', gl.NEAREST, gl.RG16UI, gl.RG_INTEGER, gl.UNSIGNED_SHORT),
      ));

    this.colors = gfx.newTextureObject(
      new TextureConfig('texColors', gl.NEAREST),
    );

    gfx.addVertexArrayObject(
      new VertexArrayObject(null, 0, particles, gl.POINTS, gl => {
        gl.uniform2i(uStateSize, this.stateSize.width, this.stateSize.height);
        gl.uniform1f(uPointSize, POINT_SIZE);
        this.positions[this.swap].bind(gl, 0);
        this.colors.bind(gl, 1);
        return true;
      })
    );
  }

  private initUpdate(gl: WebGL2RenderingContext) {
    this.frameBuffer = new FramebufferObject(gl, this.stateSize);
    const shaders = [updateVertShader(gl), updateFragShader(gl)];
    const gfx = new Graphics(gl, this.frameBuffer, shaders, this.update.bind(this));
    this.updateGfx = gfx;

    const uStateSize = gfx.getUniformLocation('uStateSize');
    const uAlpha = gfx.getUniformLocation('uAlpha');
    const uBeta = gfx.getUniformLocation('uBeta');
    const uRadius = gfx.getUniformLocation('uRadius');

    this.velocities = Array.from(Array(2)).map(_ =>
      gfx.newTextureObject(
        new TextureConfig('texVelocities', gl.NEAREST, gl.RG16UI, gl.RG_INTEGER, gl.UNSIGNED_SHORT),
      ));

    gfx.addVertexArrayObject(
      new VertexArrayObject(null, 0, this.particles, gl.POINTS, gl => {
        gl.uniform2i(uStateSize, this.stateSize.width, this.stateSize.height);
        gl.uniform1f(uAlpha, this.params.alpha);
        gl.uniform1f(uBeta, this.params.beta);
        gl.uniform1f(uRadius, this.params.radius);
        let s = this.swap;
        this.positions[s].bind(gl, 0);
        this.velocities[s].bind(gl, 1);
        return true;
      })
    );
  }

  private initState(gl: WebGL2RenderingContext) {
    const { width, height } = this.stateSize;

    const pstate = new Uint16Array(this.particles * 2);
    pstate.forEach((_, i, data) => {
      const n = Math.floor(i / 2);
      const xory = (i % 2) === 0;
      if (xory) {
        data[i] = (.1 + .9 * ((8 * n / this.particles) % 1.0)) * 65535;
      } else {
        data[i] = (.1 + .9 * Math.floor(8 * n / this.particles) / 8) * 65535;
      }
    });
    this.positions.forEach(p => {
      p.updateData(gl, width, height, pstate);
    });

    const vstate = new Uint16Array(this.particles * 2);
    vstate.forEach((_, i, data) => {
      if (i % 2 === 0) {
        const vx = Math.random();
        const vy = Math.random();
        const norm = Math.sqrt(vx * vx + vy * vy);
        data[i] = (vx / norm) * 65535;
        data[i + 1] = (vy / norm) * 65535;
      }
    });
    this.velocities.forEach(v => {
      v.updateData(gl, width, height, vstate);
    });

    const cdata = new Uint8ClampedArray(this.particles * 4);
    const cstate = new ImageData(cdata, width, height);
    cstate.data.forEach((_, i, data) => {
      data[i] = (i % 4 >= 2) ? 255 : 0;
    })
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
    this.frameBuffer.attach(this.positions[s], 0);
    this.frameBuffer.attach(this.velocities[s], 1);
    this.frameBuffer.attach(this.colors, 2);
    this.swap = 1 - s;
  }

  private loop(gl: WebGL2RenderingContext) {
    // const st = this.frameBuffer.getStatus();
    // if (st === 'complete') {
    this.updateGfx.render(false);


    // if (count < 10) {
    //   const w = this.stateSize.width,
    //     h = this.stateSize.height,
    //     rgba = new Uint8Array(w * h * 4);
    //   gl.readPixels(0, 0, w, h, gl.RG, gl.UNSIGNED_BYTE, rgba);
    //   console.log(rgba);
    //   count++;
    // }
    // if (count < 10) {
    //   const w = this.stateSize.width,
    //     h = this.stateSize.height,
    //     rgba = new Float32Array(w * h * 2);
    //   gl.readPixels(0, 0, w, h, gl.RG, gl.FLOAT, rgba);
    //   console.log(rgba);
    //   count++;
    // }

    this.renderGfx.render(false);

    // if (count < 10) {
    //   const w = this.stateSize.width,
    //     h = this.stateSize.height,
    //     rgba = new Uint8Array(w * h * 4);
    //   gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    //   console.log(rgba);
    //   count++;
    // }
    // }
    requestAnimationFrame(this.loop.bind(this, gl));
  }
}

var count = 0;

