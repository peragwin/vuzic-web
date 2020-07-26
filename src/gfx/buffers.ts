import {
  AttributeAttachment,
  AttributeType,
  BufferMode,
  glBufferMode,
  glTypeInfo,
} from "./types";

export interface ArrayBufferConfig {
  mode: BufferMode;
  type: AttributeType;
  data: ArrayBufferView;
}

export class ArrayBuffer {
  private buffer: WebGLBuffer;

  constructor(
    private gl: WebGL2RenderingContext,
    readonly config: ArrayBufferConfig
  ) {
    const buffer = gl.createBuffer();
    if (buffer === null) throw new Error("failed to create gl buffer");
    this.buffer = buffer;

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, config.data, glBufferMode(gl, config.mode));
  }

  public bind() {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      this.config.data,
      glBufferMode(this.gl, this.config.mode)
    );
  }
}

export type DrawMode =
  | "triangles"
  | "triangle_strip"
  | "triangle_fan"
  | "points";

function glDrawMode(gl: WebGL2RenderingContext, mode: DrawMode) {
  switch (mode) {
    case "triangles":
      return gl.TRIANGLES;
    case "triangle_strip":
      return gl.TRIANGLE_STRIP;
    case "triangle_fan":
      return gl.TRIANGLE_FAN;
    case "points":
      return gl.POINTS;
  }
}

export interface VertexArrayObjectConfig {
  buffer: ArrayBufferConfig;
  offset: number;
  length: number;
  drawMode: DrawMode;
  attriutes: {
    attr: AttributeAttachment;
    size: 0 | 1 | 2 | 3 | 4;
    stride: number;
    offset: number;
    normalized?: boolean;
    astype?: "int" | "float"; // default to float
    default?: (gl: WebGL2RenderingContext) => void;
  }[];
}

export class VertexArrayObject {
  private buffer: ArrayBuffer;
  private vao: WebGLVertexArrayObject;

  constructor(
    private gl: WebGL2RenderingContext,
    readonly config: VertexArrayObjectConfig,
    private onDraw?: () => void
  ) {
    const vao = gl.createVertexArray();
    if (vao === null)
      throw new Error("failed to create gl vertex array object");
    this.vao = vao;

    gl.bindVertexArray(vao);

    this.buffer = new ArrayBuffer(gl, config.buffer);
    this.execute(config);

    gl.bindVertexArray(null);
  }

  private execute(config: VertexArrayObjectConfig) {
    const gl = this.gl;
    // for (let c of config) {

    this.buffer.bind();
    const [type, dsize] = glTypeInfo(gl, config.buffer.type);

    for (let a of config.attriutes) {
      if (a.size > 0) {
        if (a.astype === "int") {
          gl.vertexAttribIPointer(
            a.attr.index,
            a.size,
            type,
            a.stride * dsize,
            a.offset * dsize
          );
        } else {
          gl.vertexAttribPointer(
            a.attr.index,
            a.size,
            type,
            a.normalized || false,
            a.stride * dsize,
            a.offset * dsize
          );
        }
        gl.enableVertexAttribArray(a.attr.index);
      } else {
        gl.disableVertexAttribArray(a.attr.index);
      }
      if (a.default !== undefined) {
        a.default(gl);
      }
    }
    // }
  }

  public draw() {
    this.gl.bindVertexArray(this.vao);

    if (this.onDraw) this.onDraw();

    const mode = glDrawMode(this.gl, this.config.drawMode);
    this.gl.drawArrays(mode, this.config.offset, this.config.length);

    // important to unbind this or gl doesn't actually execute anything..
    this.gl.bindVertexArray(null);
  }
}

export class UniformBuffer {
  buffer: WebGLBuffer;

  constructor(
    private gl: WebGL2RenderingContext,
    data: ArrayBufferView[],
    mode?: BufferMode
  ) {
    const buffer = gl.createBuffer();
    if (!buffer) {
      throw new Error("failed to create uniform buffer");
    }
    this.buffer = buffer;

    const glMode = glBufferMode(gl, mode || "dynamic_draw");

    gl.bindBuffer(gl.UNIFORM_BUFFER, this.buffer);
    gl.bufferData(
      gl.UNIFORM_BUFFER,
      data.reduce((p, n) => p + n.byteLength, 0),
      glMode
    );
    let offset = 0;
    for (let d of data) {
      gl.bufferSubData(gl.UNIFORM_BUFFER, offset, d);
      offset += d.byteLength;
    }
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);
  }

  update(data: ArrayBufferView[], offset: number = 0) {
    const gl = this.gl;
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.buffer);
    for (let d of data) {
      gl.bufferSubData(gl.UNIFORM_BUFFER, offset, d);
      offset += d.byteLength;
    }
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);
  }
}

export class ShaderStorageBuffer {
  private buffer: WebGLBuffer;

  constructor(
    private readonly gl: WebGL2ComputeRenderingContext,
    data: ArrayBufferView,
    mode = gl.DYNAMIC_DRAW
  ) {
    const buffer = gl.createBuffer();
    if (!buffer) {
      throw new Error("failed to create shader buffer");
    }
    this.buffer = buffer;

    gl.bindBuffer(gl.SHADER_STORAGE_BUFFER, buffer);
    gl.bufferData(gl.SHADER_STORAGE_BUFFER, data, mode);
    gl.bindBuffer(gl.SHADER_STORAGE_BUFFER, null);
  }

  public bind(id: number) {
    this.gl.bindBufferBase(this.gl.SHADER_STORAGE_BUFFER, id, this.buffer);
  }
}
