
export class TextureConfig {
  constructor(
    public uniform: string,
    public mode: number,
    public internalFormat?: number,
    public format?: number,
    public type?: number,
  ) { }
}
export class TextureObject {
  constructor(
    readonly tex: WebGLTexture,
    readonly internalFormat: number, // TODO: specify type enums
    readonly format: number,
    readonly type: number,
    readonly uloc?: WebGLUniformLocation,
    readonly program?: WebGLProgram,
  ) { }

  public bind(gl: WebGL2RenderingContext, unit: number = 0) {
    if (this.uloc) {
      if (this.program) gl.useProgram(this.program);
      gl.uniform1i(this.uloc, unit);
    }
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
  }

  public update(gl: WebGL2RenderingContext, image: ImageData, unit: number = 0) {
    this.bind(gl, unit);
    gl.texImage2D(gl.TEXTURE_2D, 0,
      this.internalFormat, this.format, this.type,
      image)
  };

  public updateData(gl: WebGL2RenderingContext, width: number, height: number,
    data: ArrayBufferView, unit: number = 0) {
    this.bind(gl, unit);
    gl.texImage2D(gl.TEXTURE_2D, 0,
      this.internalFormat, width, height, 0,
      this.format, this.type, data);
  }
}

export class BufferObject {
  constructor(
    readonly buffer: WebGLBuffer,
    public setAttribPointers: () => void,
    public ondraw: (gl: WebGL2RenderingContext) => boolean,
  ) { }

  public bindBuffer(gl: WebGL2RenderingContext) {
    this.setAttribPointers()
    this.ondraw(gl)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
  }
}

export class BufferConfig {
  constructor(
    public vertices: ArrayBufferView,
    public vertAttr: string,
    public texAttr: string,
    public stride: number,
    public size: number,
    public ondraw: (gl: WebGL2RenderingContext) => boolean,
    public type?: number,
  ) { }
}

export class VertexArrayObject {
  constructor(
    readonly buffer: BufferObject | null,
    readonly offset: number,
    readonly length: number,
    readonly glDrawType: number,
    readonly onDraw: (gl: WebGL2RenderingContext) => boolean,
  ) { }

  public draw(gl: WebGL2RenderingContext) {
    if (this.onDraw(gl)) {
      gl.drawArrays(this.glDrawType, this.offset, this.length)
    }
  }
}

abstract class RenderTarget {
  abstract use(): void;
}

export class FramebufferObject extends RenderTarget {
  private frameBuffer: WebGLFramebuffer;
  private textures: Array<{ id: number, tex: WebGLTexture }>;

  constructor(
    private gl: WebGL2RenderingContext,
    private dims: { width: number, height: number },
  ) {
    super();
    const fb = gl.createFramebuffer();
    if (!fb) throw new Error("failed to create frameBuffer");
    this.frameBuffer = fb;
    this.textures = new Array();
  }

  public attach(tex: TextureObject, id: number) {
    this.textures.push({ id, tex: tex.tex });
  }

  public bind() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameBuffer);
    this.textures.forEach(({ tex, id }) => {
      const attachment = gl.COLOR_ATTACHMENT0 + id;
      gl.framebufferTexture2D(gl.FRAMEBUFFER, attachment, gl.TEXTURE_2D, tex, 0);
      const st = this.getStatus();
      if (st !== 'complete') {
        throw new Error(`framebuffer status error: ${st}`);
      }
    })
  }

  public use() {
    const gl = this.gl;
    gl.viewport(0, 0, this.dims.width, this.dims.height);
    this.bind();
    gl.drawBuffers(this.textures.map(({ id }) => gl.COLOR_ATTACHMENT0 + id));
    this.textures = new Array();
  }

  public getStatus(): string | number {
    const gl = this.gl
    const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    switch (st) {
      case gl.FRAMEBUFFER_COMPLETE:
        return 'complete';
      case gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT:
        return 'imcomplete attachment';
      case gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS:
        return 'incomplete dimensions';
      case gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT:
        return 'incomplete missing attachment';
      case gl.FRAMEBUFFER_INCOMPLETE_MULTISAMPLE:
        return 'incomplete multisample';
      case gl.FRAMEBUFFER_UNSUPPORTED:
        return 'unsupported';
      default:
        return st;
    }
  }
}

export class CanvasObject extends RenderTarget {
  private canvas: HTMLCanvasElement | OffscreenCanvas;

  constructor(
    private gl: WebGL2RenderingContext,
  ) {
    super();
    this.canvas = gl.canvas;
  }

  private resize(canvas: HTMLCanvasElement | OffscreenCanvas) {
    if (canvas instanceof HTMLCanvasElement) {
      const w = canvas.clientWidth
      const h = canvas.clientHeight

      if (w !== canvas.width || h !== canvas.height) {
        canvas.width = w
        canvas.height = h
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
    public uniformNames: Array<string>,
  ) { }
}

export class Graphics {
  private program: WebGLProgram;
  private shaders: Array<WebGLShader>;
  private uniforms: Map<string, WebGLUniformLocation>;
  private attributes: Map<string, number>;

  private bos: Array<WebGLBuffer> = [];
  private vaos: Array<VertexArrayObject> = [];
  private textures: Array<TextureObject> = [];

  public onRender: (gfx: Graphics) => void;

  constructor(
    public gl: WebGL2RenderingContext,
    private target: RenderTarget,
    shaders: Array<ShaderConfig>,
    onRender: (g: Graphics) => void,
  ) {
    this.onRender = onRender
    this.uniforms = new Map<string, WebGLUniformLocation>()
    this.attributes = new Map<string, number>()

    const program = gl.createProgram();
    if (program === null) throw new Error("could not create gl program")
    this.program = program

    this.shaders = new Array<WebGLShader>()
    for (let s of shaders) {
      const c = this.compileShader(s)
      if (!c) throw new Error("failed to compile shader")

      this.shaders.push(c)
      gl.attachShader(program, c)
    }

    gl.linkProgram(program)
    const success = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (!success) {
      console.log(gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      throw new Error("failed to link program")
    }

    shaders.forEach(s => {
      s.uniformNames.forEach(uname => {
        const loc = gl.getUniformLocation(program, uname)
        if (loc === null) throw new Error(`uniform location not found for ${uname}`)
        this.uniforms.set(uname, loc)
      })
      s.attributeNames.forEach(aname => {
        const loc = gl.getAttribLocation(program, aname)
        if (loc === null) throw new Error(`attribute location not found for ${aname}`)
        this.attributes.set(aname, loc)
      })
    })
  }

  private compileShader(s: ShaderConfig) {
    const shader = this.gl.createShader(s.type)
    if (!shader) return null

    this.gl.shaderSource(shader, s.source)
    this.gl.compileShader(shader)
    const success = this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)
    if (success) return shader

    console.log(this.gl.getShaderInfoLog(shader))
    this.gl.deleteShader(shader)
    return null
  }

  public newBufferObject(cfg: BufferConfig) {
    const gl = this.gl

    const type = (cfg.type === undefined) ? gl.FLOAT : cfg.type;
    let dsize = 4;
    if (cfg.type === gl.UNSIGNED_SHORT) dsize = 2;
    if (cfg.type === gl.UNSIGNED_BYTE) dsize = 1;

    const stride = dsize * cfg.stride

    const buffer = gl.createBuffer()
    if (buffer === null) throw new Error("failed to create gl buffer")
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, cfg.vertices, gl.STATIC_DRAW)


    let vattr = -1;
    if (cfg.vertAttr) {
      const v = this.attributes.get(cfg.vertAttr)
      if (v === undefined) throw new Error(`unknown vertex attribute ${cfg.vertAttr}`)
      vattr = v;
    }
    let tattr = -1;
    if (cfg.texAttr) {
      const t = this.attributes.get(cfg.texAttr)
      if (t === undefined) throw new Error(`unknown texture attribute ${cfg.texAttr}`)
      tattr = t;
    }

    const setAttribPointers = () => {
      if (vattr !== -1) {
        gl.enableVertexAttribArray(vattr)
        if (cfg.type === gl.UNSIGNED_SHORT) {
          gl.vertexAttribIPointer(vattr, cfg.size, type, stride, 0);
        } else {
          gl.vertexAttribPointer(vattr, cfg.size, type, false, stride, 0);
        }
      }
      if (tattr !== -1) {
        gl.enableVertexAttribArray(tattr)
        gl.vertexAttribPointer(tattr, 2, type, false, stride, cfg.size * 4)
      }
    }

    const bo = new BufferObject(buffer, setAttribPointers, cfg.ondraw)
    this.bos.push(bo)
    return bo
  }

  public addVertexArrayObject(vao: VertexArrayObject) {
    this.vaos.push(vao)
  }

  public newTextureObject(cfg: TextureConfig) {
    const gl = this.gl

    const tex = gl.createTexture()
    if (!tex) throw new Error("failed to create new texture")

    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, cfg.mode)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, cfg.mode)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    let uloc;
    if (cfg.uniform !== '') {
      uloc = this.getUniformLocation(cfg.uniform);
    }

    const to = new TextureObject(tex,
      (cfg.internalFormat === undefined) ? gl.RGBA : cfg.internalFormat,
      (cfg.format === undefined) ? gl.RGBA : cfg.format,
      (cfg.type === undefined) ? gl.UNSIGNED_BYTE : cfg.type,
      uloc, this.program);
    this.textures.push(to);

    return to;
  }

  public start() {
    this.gl.useProgram(this.program)

    requestAnimationFrame(this.render.bind(this, true))
  }

  public render(loop: boolean = true) {
    const gl = this.gl

    gl.useProgram(this.program)

    this.onRender(this)

    this.target.use();

    // let currentBuffer: (BufferObject | null) = null
    this.vaos.forEach(v => {
      if (v.buffer) { //} && currentBuffer !== v.buffer) {
        v.buffer.bindBuffer(gl)
        // currentBuffer = v.buffer
      }
      v.draw(gl)
    })

    gl.flush()

    if (loop) {
      requestAnimationFrame(this.render.bind(this, loop));
    }
  }

  public getUniformLocation(uname: string) {
    let uloc = this.uniforms.get(uname);
    if (!uloc) {
      this.gl.useProgram(this.program);
      const loc = this.gl.getUniformLocation(this.program, uname);
      if (!loc)
        throw new Error(`uniform location not found for ${uname}`);
      uloc = loc;
      this.uniforms.set(uname, uloc);
    }
    return uloc;
  }
}