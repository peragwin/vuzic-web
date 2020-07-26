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
