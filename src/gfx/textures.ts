export interface TextureConfig {
  mode: number;
  internalFormat: number;
  format: number;
  type: number;
  wrap?: { s: number; t: number; r?: number };
  immutable?: boolean;
  width?: number;
  height?: number;
  depth?: number;
}

export interface Texture {
  tex: WebGLTexture;
  cfg: TextureConfig;
  bind: (unit: number) => void;
}

export class TextureObject {
  readonly tex: WebGLTexture;

  constructor(
    readonly gl: WebGL2RenderingContext | WebGL2ComputeRenderingContext,
    readonly cfg: TextureConfig
  ) {
    const tex = gl.createTexture();
    if (!tex) throw new Error("failed to create new texture");
    this.tex = tex;

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, cfg.mode);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, cfg.mode);
    let wrap = {
      s: gl.CLAMP_TO_EDGE,
      t: gl.CLAMP_TO_EDGE,
      ...(cfg.wrap || {}),
    };
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap.s);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap.t);

    if (cfg.immutable) {
      if (cfg.width === undefined || cfg.height === undefined) {
        throw new Error("immutable texture requires cfg width and height");
      }
      gl.texStorage2D(
        gl.TEXTURE_2D,
        1,
        cfg.internalFormat,
        cfg.width,
        cfg.height
      );
    }
  }

  public bind(unit: number) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
  }

  public bindImage(unit: number, access: number) {
    const gl = this.gl;
    if ("bindImageTexture" in gl) {
      gl.bindImageTexture(
        unit,
        this.tex,
        0,
        true,
        0,
        access,
        this.cfg.internalFormat
      );
    } else {
      throw new Error("bindImage requires webgl2-compute context");
    }
  }

  public update(image: ImageData, unit: number = 0) {
    const { gl, cfg } = this;
    this.bind(unit);
    if (this.cfg.immutable) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cfg.format, cfg.type, image);
    } else {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        cfg.internalFormat,
        cfg.format,
        cfg.type,
        image
      );
    }
  }

  public updateData(
    width: number,
    height: number,
    data: ArrayBufferView,
    unit: number = 0
  ) {
    const { gl, cfg } = this;
    this.bind(unit);
    if (this.cfg.immutable) {
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        width,
        height,
        cfg.format,
        cfg.type,
        data
      );
    } else {
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
}

export class Texture3DObject {
  readonly tex: WebGLTexture;

  constructor(
    readonly gl: WebGL2RenderingContext | WebGL2ComputeRenderingContext,
    readonly cfg: TextureConfig
  ) {
    const tex = gl.createTexture();
    if (!tex) throw new Error("failed to create new texture");
    this.tex = tex;

    gl.bindTexture(gl.TEXTURE_3D, tex);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, cfg.mode);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, cfg.mode);
    let wrap = {
      s: gl.CLAMP_TO_EDGE,
      t: gl.CLAMP_TO_EDGE,
      r: gl.CLAMP_TO_EDGE,
      ...(cfg.wrap || {}),
    };
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, wrap.s);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, wrap.t);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, wrap.r);

    if (cfg.immutable) {
      if (
        cfg.width === undefined ||
        cfg.height === undefined ||
        cfg.depth === undefined
      ) {
        throw new Error(
          "immutable texture requires cfg width, height, and depth"
        );
      }
      gl.texStorage3D(
        gl.TEXTURE_3D,
        1,
        cfg.internalFormat,
        cfg.width,
        cfg.height,
        cfg.depth
      );
    }
  }

  public bind(unit: number) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_3D, this.tex);
  }

  public bindImage(unit: number, access: number) {
    const gl = this.gl;
    if ("bindImageTexture" in gl) {
      gl.bindImageTexture(
        unit,
        this.tex,
        0,
        true,
        0,
        access,
        this.cfg.internalFormat
      );
    } else {
      throw new Error("bindImage requires webgl2-compute context");
    }
  }

  public update(data: ArrayBufferView, unit: number = 0) {
    return this.updateData(
      this.cfg.width || 1,
      this.cfg.height || 1,
      this.cfg.depth || 1,
      data,
      unit
    );
  }

  public updateData(
    width: number,
    height: number,
    depth: number,
    data: ArrayBufferView,
    unit: number = 0
  ) {
    const { gl, cfg } = this;
    this.bind(unit);
    if (this.cfg.immutable) {
      gl.texSubImage3D(
        gl.TEXTURE_3D,
        0,
        0,
        0,
        0,
        width,
        height,
        depth,
        cfg.format,
        cfg.type,
        data
      );
    } else {
      gl.texImage3D(
        gl.TEXTURE_3D,
        0,
        cfg.internalFormat,
        width,
        height,
        depth,
        0,
        cfg.format,
        cfg.type,
        data
      );
    }
  }
}
