import { Dims } from "./types";
import { Texture } from "./textures";
import {
  UniformBuffer,
  VertexArrayObject as VertexArrayObjectNew,
} from "./buffers";
import { ProgramBase } from "./program";

export type UniformAssignable = Texture | string;

export class Uniform {
  private uloc: WebGLUniformLocation;

  constructor(
    gl: WebGL2RenderingContext,
    readonly program: WebGLProgram,
    readonly uname: string,
    readonly onBind: (loc: WebGLUniformLocation, value: any) => void
  ) {
    const loc = gl.getUniformLocation(program, uname);
    if (!loc) throw new Error(`uniform location not found for ${uname}`);
    this.uloc = loc;
  }

  public bind(value: any) {
    this.onBind(this.uloc, value);
  }
}

export class BufferObject {
  constructor(
    readonly buffer: WebGLBuffer,
    public setAttribPointers: () => void,
    public ondraw: (gl: WebGL2RenderingContext) => boolean
  ) {}

  public bindBuffer(gl: WebGL2RenderingContext) {
    // took literally like 3 hours to realize this line has to come before
    // setting the attrib pointers...
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    this.setAttribPointers();
    this.ondraw(gl);
  }
}

export class BufferConfig {
  constructor(
    public vertices: ArrayBufferView,
    public attributes: { name: string; offset: number; size: number }[],
    public ondraw: (gl: WebGL2RenderingContext) => boolean,
    public type?: number
  ) {}
}

export class VertexArrayObject {
  constructor(
    public buffer: BufferObject | null,
    public offset: number,
    public length: number,
    public glDrawType: number,
    public onDraw?: (gfx: Graphics) => boolean
  ) {}

  public draw(gfx: Graphics) {
    if (this.onDraw ? this.onDraw(gfx) : true) {
      gfx.gl.drawArrays(this.glDrawType, this.offset, this.length);
    }
  }
}

export abstract class RenderTarget {
  abstract use(): void;
  abstract setView(layer: number): void;
  get layers() {
    return 1;
  }
}

export class FramebufferObject extends RenderTarget {
  private frameBuffer: WebGLFramebuffer;
  private textures: Array<{ id: number; tex: WebGLTexture }> = [];

  constructor(
    private gl: WebGL2RenderingContext,
    private dims: Dims,
    private staticAttachments = false,
    private clearing = false
  ) {
    super();
    const fb = gl.createFramebuffer();
    if (!fb) throw new Error("failed to create frameBuffer");
    this.frameBuffer = fb;
  }

  public attach(tex: Texture, id: number) {
    if (!tex.isInit()) throw new Error(`texture is not initialized: ${id}`);
    const findex = this.textures.findIndex((v) => v.id === id);
    if (findex !== -1) this.textures[findex] = { id, tex: tex.tex };
    else this.textures.push({ id, tex: tex.tex });
  }

  public bind() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameBuffer);
    this.textures.forEach(({ tex, id }) => {
      const attachment = gl.COLOR_ATTACHMENT0 + id;
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        attachment,
        gl.TEXTURE_2D,
        tex,
        0
      );
    });
  }

  public use() {
    const gl = this.gl;
    this.bind();
    gl.drawBuffers(this.textures.map(({ id }) => gl.COLOR_ATTACHMENT0 + id));
    if (!this.staticAttachments) {
      this.textures = [];
    }
  }

  public setView(layer: number) {
    this.gl.viewport(0, 0, this.dims.width, this.dims.height);
    if (this.clearing) {
      this.gl.clearColor(0, 0, 0, 1);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    }
  }

  public readData(
    data: ArrayBufferView,
    id: number,
    format: number,
    type: number,
    width?: number,
    height?: number
  ) {
    const gl = this.gl;
    gl.readBuffer(gl.COLOR_ATTACHMENT0 + id);
    gl.readPixels(
      0,
      0,
      width || this.dims.width,
      height || this.dims.height,
      format,
      type,
      data
    );
    // hacky cleanup.. should find a better way to manage this
    this.textures = [];
  }

  public checkStatus() {
    const st = this.getStatus();
    if (st !== "complete") {
      throw new Error(`framebuffer status error: ${st}`);
    }
  }

  public getStatus(): string | number {
    const gl = this.gl;
    const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    switch (st) {
      case gl.FRAMEBUFFER_COMPLETE:
        return "complete";
      case gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT:
        return "imcomplete attachment";
      case gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS:
        return "incomplete dimensions";
      case gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT:
        return "incomplete missing attachment";
      case gl.FRAMEBUFFER_INCOMPLETE_MULTISAMPLE:
        return "incomplete multisample";
      case gl.FRAMEBUFFER_UNSUPPORTED:
        return "unsupported";
      default:
        return st;
    }
  }

  public setSize(size: Dims) {
    this.dims = size;
  }
}

export class CanvasObject extends RenderTarget {
  private canvas: HTMLCanvasElement;

  constructor(
    private gl: WebGL2RenderingContext,
    private onResize?: (size: { width: number; height: number }) => void,
    private clearing = true,
    private stereo = false,
    private onSetView?: () => void
  ) {
    super();
    this.canvas = gl.canvas;
  }

  private resize(canvas: HTMLCanvasElement) {
    if (canvas instanceof HTMLCanvasElement) {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      if (w !== canvas.width || h !== canvas.height) {
        canvas.width = w;
        canvas.height = h;
        if (this.onResize) {
          this.onResize({ width: w, height: h });
        }
      }
    }
  }

  public use() {
    const gl = this.gl;
    this.resize(gl.canvas);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  public setView(layer: 0 | 1) {
    let width = this.canvas.width;
    let offset = 0;
    if (layer === 1) offset = this.canvas.width / 2;
    if (this.stereo) width /= 2;
    this.gl.viewport(offset, 0, width, this.canvas.height);
    if (this.clearing) {
      this.gl.clearColor(0, 0, 0, 1);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    }
    if (this.onSetView) this.onSetView();
  }
}

export class ShaderConfig {
  constructor(
    public source: string,
    public type: number,
    public attributeNames?: Array<string>,
    public uniformNames?: Array<string>
  ) {}
}

export class Graphics {
  private program: WebGLProgram;
  private shaders: Array<WebGLShader>;

  private bos: Array<WebGLBuffer> = [];
  private vaos: Array<VertexArrayObject> = [];

  constructor(
    readonly gl: WebGL2RenderingContext,
    private target: RenderTarget,
    shaders: Array<ShaderConfig>,
    public onRender: (g: Graphics) => void
  ) {
    const program = gl.createProgram();
    if (program === null) throw new Error("could not create gl program");
    this.program = program;

    this.shaders = new Array<WebGLShader>();
    for (let s of shaders) {
      const c = this.compileShader(s);
      if (!c) throw new Error("failed to compile shader");

      this.shaders.push(c);
      gl.attachShader(program, c);
    }

    gl.linkProgram(program);
    const success = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (!success) {
      console.log(gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      throw new Error("failed to link program");
    }
  }

  private compileShader(s: ShaderConfig) {
    const shader = this.gl.createShader(s.type);
    if (!shader) return null;

    this.gl.shaderSource(shader, s.source);
    this.gl.compileShader(shader);
    const success = this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS);
    if (success) return shader;

    const error = this.gl.getShaderInfoLog(shader);
    if (error) {
      const matchError = /^ERROR:\s+\d+:(\d+):\s+(.*)$/;
      const lines = error.split("\n");
      const srcLines = s.source.split("\n");
      const errInfo = lines.map((l) => {
        const match = matchError.exec(l);
        if (match) {
          const line = +match[1] - 1;
          return (
            l +
            srcLines
              .slice(Math.max(0, line - 2), line + 3)
              .map((s, i) => `\n${i - 1 + line} >>> ${s}`)
              .join("")
          );
        }
        return l;
      });
      console.log(errInfo.join("\n"));
    }
    this.gl.deleteShader(shader);
    return null;
  }

  public newBufferObject(cfg: BufferConfig) {
    const gl = this.gl;

    const type = cfg.type === undefined ? gl.FLOAT : cfg.type;
    let dsize = 4;
    if (cfg.type === gl.UNSIGNED_SHORT) dsize = 2;
    if (cfg.type === gl.UNSIGNED_BYTE) dsize = 1;

    const stride = dsize * cfg.attributes.reduce((p, v) => p + v.size, 0);

    const buffer = gl.createBuffer();
    if (buffer === null) throw new Error("failed to create gl buffer");
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, cfg.vertices, gl.STATIC_DRAW);

    const attrs: Array<{ attr: number; size: number; offset: number }> = [];
    for (let attr of cfg.attributes) {
      const a = gl.getAttribLocation(this.program, attr.name);
      if (a === null)
        throw new Error(`attribute location not found for ${attr.name}`);
      attrs.push({ ...attr, attr: a });
    }

    const setAttribPointers = () => {
      for (let a of attrs) {
        gl.enableVertexAttribArray(a.attr);
        if (cfg.type === gl.UNSIGNED_SHORT) {
          gl.vertexAttribIPointer(
            a.attr,
            a.size,
            type,
            stride,
            a.offset * dsize
          );
        } else {
          gl.vertexAttribPointer(
            a.attr,
            a.size,
            type,
            false,
            stride,
            a.offset * dsize
          );
        }
      }
    };

    const bo = new BufferObject(buffer, setAttribPointers, cfg.ondraw);
    this.bos.push(bo);
    return bo;
  }

  private uniforms = new Map<UniformAssignable, Uniform>();

  public addVertexArrayObject(vao: VertexArrayObject) {
    this.vaos.push(vao);
  }

  // associates the texture with the uniform of the given name
  public attachTexture(tex: Texture, uname: string) {
    this.uniforms.set(
      tex,
      new Uniform(this.gl, this.program, uname, (l, v: number) => {
        tex.bind(v);
        this.gl.uniform1i(l, v);
      })
    );
  }

  public bindTexture(tex: Texture, unit: number) {
    const u = this.uniforms.get(tex);
    if (u === undefined) {
      console.log(this.uniforms);
      console.log(tex);
      throw new Error(`texture is not attached to any uniform`);
    }
    u.bind(unit);
  }

  public attachUniform(
    uname: string,
    onBind: (loc: WebGLUniformLocation, value: any) => void
  ) {
    this.uniforms.set(uname, new Uniform(this.gl, this.program, uname, onBind));
  }

  public bindUniform(uname: string, value: any) {
    const u = this.uniforms.get(uname);
    if (!u) throw new Error(`uniform ${uname} is not attached`);
    u.bind(value);
  }

  private uniformBlockLocations = new Map<string, number>();

  public attachUniformBlock(name: string, location: number) {
    const uidx = this.gl.getUniformBlockIndex(this.program, name);
    if (uidx === this.gl.INVALID_INDEX) {
      throw new Error(`unknown uniform block ${name}`);
    }
    this.gl.uniformBlockBinding(this.program, uidx, location);
    this.uniformBlockLocations.set(name, location);
  }

  public bindUniformBuffer(uname: string, uBuffer: UniformBuffer) {
    const loc = this.uniformBlockLocations.get(uname);
    if (loc === undefined) {
      throw new Error(`uniform block not bound for ${uname}`);
    }
    this.gl.bindBufferBase(this.gl.UNIFORM_BUFFER, loc, uBuffer.buffer);
  }

  public start() {
    this.gl.useProgram(this.program);

    requestAnimationFrame(this.render.bind(this, true, undefined));
  }

  public render(loop: boolean = true, target?: RenderTarget) {
    const gl = this.gl;
    target = target || this.target;

    gl.useProgram(this.program);

    this.onRender(this);

    target.use();
    for (let l = 0; l < target.layers; l++) {
      target.setView(l);

      let lastBuf: BufferObject | null = null;
      this.vaos.forEach((v) => {
        if (v.buffer !== lastBuf) {
          lastBuf = v.buffer;
          if (v.buffer) {
            v.buffer.bindBuffer(gl);
          }
        }
        v.draw(this);
      });
    }

    gl.flush();

    if (loop) {
      requestAnimationFrame(this.render.bind(this, loop, undefined));
    }
  }

  public swapTarget(target: RenderTarget) {
    this.target = target;
  }
}

export function drawWithProgram(
  program: ProgramBase,
  bindInput: () => void,
  target: RenderTarget,
  vaos: VertexArrayObjectNew[]
) {
  program.use();

  bindInput();

  target.use();
  for (let l = 0; l < target.layers; l++) {
    target.setView(l);
    for (let v of vaos) {
      v.draw();
    }
  }
}
