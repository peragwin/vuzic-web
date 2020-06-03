export interface TextureConfig {
  mode: number;
  internalFormat: number;
  format: number;
  type: number;
}
export class TextureObject {
  readonly tex: WebGLTexture;

  constructor(
    readonly gl: WebGL2RenderingContext,
    readonly cfg: TextureConfig
  ) {
    const tex = gl.createTexture();
    if (!tex) throw new Error("failed to create new texture");
    this.tex = tex;

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, cfg.mode);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, cfg.mode);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  public bind(unit: number) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
  }

  public update(image: ImageData, unit: number = 0) {
    const { gl, cfg } = this;
    this.bind(unit);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      cfg.internalFormat,
      cfg.format,
      cfg.type,
      image
    );
  }

  public updateData(
    width: number,
    height: number,
    data: ArrayBufferView,
    unit: number = 0
  ) {
    const { gl, cfg } = this;
    this.bind(unit);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      cfg.internalFormat,
      width,
      height,
      0,
      cfg.format,
      cfg.type,
      data
    );
  }
}

type UniformAssignable = TextureObject | string;

class Uniform {
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
    this.setAttribPointers();
    this.ondraw(gl);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
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

abstract class RenderTarget {
  abstract use(): void;
}

export class FramebufferObject extends RenderTarget {
  private frameBuffer: WebGLFramebuffer;
  private textures: Array<{ id: number; tex: WebGLTexture }> = [];

  constructor(
    private gl: WebGL2RenderingContext,
    private dims: { width: number; height: number }
  ) {
    super();
    const fb = gl.createFramebuffer();
    if (!fb) throw new Error("failed to create frameBuffer");
    this.frameBuffer = fb;
  }

  public attach(tex: TextureObject, id: number) {
    this.textures.push({ id, tex: tex.tex });
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
      const st = this.getStatus();
      if (st !== "complete") {
        throw new Error(`framebuffer status error: ${st}`);
      }
    });
  }

  public use() {
    const gl = this.gl;
    gl.viewport(0, 0, this.dims.width, this.dims.height);
    this.bind();
    gl.drawBuffers(this.textures.map(({ id }) => gl.COLOR_ATTACHMENT0 + id));
    this.textures = [];
  }

  public readData(data: ArrayBufferView, id: number) {
    const gl = this.gl;
    gl.readBuffer(gl.COLOR_ATTACHMENT0 + id);
    gl.readPixels(
      0,
      0,
      this.dims.width,
      this.dims.height,
      gl.RGBA,
      gl.FLOAT,
      data
    );
    // hacky cleanup.. should find a better way to manage this
    this.textures = [];
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
}

export class CanvasObject extends RenderTarget {
  private canvas: HTMLCanvasElement | OffscreenCanvas;

  constructor(private gl: WebGL2RenderingContext) {
    super();
    this.canvas = gl.canvas;
  }

  private resize(canvas: HTMLCanvasElement | OffscreenCanvas) {
    if (canvas instanceof HTMLCanvasElement) {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      if (w !== canvas.width || h !== canvas.height) {
        canvas.width = w;
        canvas.height = h;
      }
    }
  }

  public use() {
    const gl = this.gl;
    this.resize(gl.canvas);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }
}

export class ShaderConfig {
  constructor(
    public source: string,
    public type: number,
    public attributeNames: Array<string>,
    public uniformNames: Array<string>
  ) {}
}

export class Graphics {
  private program: WebGLProgram;
  private shaders: Array<WebGLShader>;
  private attributes: Map<string, number>;

  private bos: Array<WebGLBuffer> = [];
  private vaos: Array<VertexArrayObject> = [];

  constructor(
    readonly gl: WebGL2RenderingContext,
    private target: RenderTarget,
    shaders: Array<ShaderConfig>,
    public onRender: (g: Graphics) => void
  ) {
    this.attributes = new Map<string, number>();

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

    console.log(this.gl.getShaderInfoLog(shader));
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
  public attachTexture(tex: TextureObject, uname: string) {
    this.uniforms.set(
      tex,
      new Uniform(this.gl, this.program, uname, (l, v: number) => {
        tex.bind(v);
        this.gl.uniform1i(l, v);
      })
    );
  }

  public bindTexture(tex: TextureObject, unit: number) {
    const u = this.uniforms.get(tex);
    if (!u) throw new Error(`texture ${tex} is not attached to any uniform`);
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

  public start() {
    this.gl.useProgram(this.program);

    requestAnimationFrame(this.render.bind(this, true));
  }

  public render(loop: boolean = true) {
    const gl = this.gl;

    gl.useProgram(this.program);

    this.onRender(this);

    this.target.use();

    let lastBuf: BufferObject | null = null;
    this.vaos.forEach((v) => {
      if (v.buffer && v.buffer !== lastBuf) {
        v.buffer.bindBuffer(gl);
        lastBuf = v.buffer;
      }
      v.draw(this);
    });

    gl.flush();

    if (loop) {
      requestAnimationFrame(this.render.bind(this, loop));
    }
  }
}
