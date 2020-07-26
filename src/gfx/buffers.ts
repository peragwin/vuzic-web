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
  }
}

export interface VertexArrayObjectConfig {
  buffer: ArrayBuffer;
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
  private vao: WebGLVertexArrayObject;

  constructor(
    gl: WebGL2RenderingContext,
    readonly config: VertexArrayObjectConfig[]
  ) {
    const vao = gl.createVertexArray();
    if (vao === null)
      throw new Error("failed to create gl vertex array object");
    this.vao = vao;

    gl.bindVertexArray(vao);

    for (let c of config) {
      c.buffer.bind();
      const [type, dsize] = glTypeInfo(gl, c.buffer.config.type);

      for (let a of c.attriutes) {
        if (a.size > 0) {
          gl.enableVertexAttribArray(a.attr.index);
          if (a.astype === "int") {
            gl.vertexAttribIPointer(
              a.attr.index,
              a.size,
              type,
              a.stride,
              a.offset * dsize
            );
          } else {
            gl.vertexAttribPointer(
              a.attr.index,
              a.size,
              type,
              a.normalized || false,
              a.stride,
              a.offset
            );
          }
        } else {
          gl.disableVertexAttribArray(a.attr.index);
        }
        if (a.default !== undefined) {
          a.default(gl);
        }
      }
    }

    gl.bindVertexArray(null);
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
