
export class TextureObject {
  constructor(
    readonly tex: WebGLTexture,
    // readonly texLoc: WebGLUniformLocation,
  ) { }

  public update(gl: WebGL2RenderingContext, image: ImageData) {
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
  };
}

export class VertexArrayObject {
  constructor(
    readonly vao: WebGLVertexArrayObject,
    readonly length: number,
    readonly glDrawType: number,
    readonly onDraw: (gl: WebGL2RenderingContext) => boolean,
  ) { }

  public draw(gl: WebGL2RenderingContext) {
    if (this.onDraw(gl)) {
      // console.log("draw vao", this)
      gl.bindVertexArray(this.vao)
      gl.drawArrays(this.glDrawType, 0, this.length)
    }
  }
}

export class VAOConfig {
  constructor(
    public vertices: Float32Array,
    public vertAttr: string,
    public texAttr: string,
    public stride: number,
    public size: number,
    public glDrawType: number,
    public onDraw: (gl: WebGL2RenderingContext) => boolean,
  ) { }
}

export class TextureConfig {
  constructor(
    public image: ImageData,
    public uniformName: string,
    public mode: number,
  ) { }
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
  public gl: WebGL2RenderingContext;

  private program: WebGLProgram;
  private shaders: Array<WebGLShader>;
  private uniforms: Map<string, WebGLUniformLocation>;
  private attributes: Map<string, number>;

  private vaos: Array<VertexArrayObject> = [];
  private textures: Array<TextureObject> = [];

  public onRender: (gfx: Graphics) => void;

  constructor(
    gl: WebGL2RenderingContext,
    shaders: Array<ShaderConfig>,
    onRender: (g: Graphics) => void,
  ) {
    this.gl = gl
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

  public newVertexArrayObject(cfg: VAOConfig) {
    const gl = this.gl

    const stride = 4 * cfg.stride

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, cfg.vertices, gl.STATIC_DRAW)
    // console.log(cfg.vertices)

    const vao = gl.createVertexArray()
    if (vao === null) throw new Error("failed to create vao")
    gl.bindVertexArray(vao)

    const vattr = this.attributes.get(cfg.vertAttr)
    if (vattr === undefined) throw new Error(`unknown vertex attribute ${cfg.vertAttr}`)
    gl.enableVertexAttribArray(vattr)
    gl.vertexAttribPointer(vattr, cfg.size, gl.FLOAT, false, stride, 0)

    const tattr = this.attributes.get(cfg.texAttr)
    if (tattr === undefined) throw new Error(`unknown texture attribute ${cfg.texAttr}`)
    gl.enableVertexAttribArray(tattr)
    gl.vertexAttribPointer(tattr, 2, gl.FLOAT, false, stride, cfg.size * 4)

    gl.bindVertexArray(null)

    const vo = new VertexArrayObject(vao, 2 * cfg.size, cfg.glDrawType, cfg.onDraw)
    this.vaos.push(vo)
    return vo
  }

  public newTextureObject(cfg: TextureConfig) {
    const gl = this.gl

    const tex = gl.createTexture()
    if (!tex) throw new Error("failed to create new texture")

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, cfg.mode)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, cfg.mode)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cfg.image.width, cfg.image.height, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, cfg.image)

    // const texLoc = this.uniforms.get(cfg.uniformName)
    // if (texLoc === undefined) throw new Error(`unknown uniform location for ${cfg.uniformName}`)
    // gl.uniform1i(texLoc, 0)

    const to = new TextureObject(tex)
    this.textures.push(to)

    return to
  }

  public start() {
    requestAnimationFrame(this.render.bind(this))
  }

  private render(now: number) {
    const gl = this.gl

    this.resize(gl.canvas)

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)

    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    gl.useProgram(this.program)

    this.onRender(this)

    this.vaos.forEach(v => v.draw(gl))

    // gl.flush()

    requestAnimationFrame(this.render.bind(this))
  }

  private resize(canvas: HTMLCanvasElement) {
    const w = canvas.clientWidth
    const h = canvas.clientHeight

    if (w !== canvas.width || h !== canvas.height) {
      canvas.width = w
      canvas.height = h
    }
  }

  public getUniformLocation(uname: string) {
    return this.uniforms.get(uname)
  }
}