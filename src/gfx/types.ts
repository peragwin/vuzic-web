export interface Dims {
  width: number;
  height: number;
  depth?: number;
}

export interface Point {
  x: number;
  y: number;
  z?: number;
}

export type AttributeAttachment = { name: string; index: number };

export type AttributeType =
  | "byte"
  | "short"
  | "ubyte"
  | "ushort"
  | "float"
  | "hfloat";

export function glTypeInfo(gl: WebGL2RenderingContext, a: AttributeType) {
  switch (a) {
    case "byte":
      return [gl.BYTE, 1];
    case "ubyte":
      return [gl.UNSIGNED_BYTE, 1];
    case "short":
      return [gl.SHORT, 2];
    case "ushort":
      return [gl.UNSIGNED_SHORT, 2];
    case "float":
      return [gl.FLOAT, 4];
    case "hfloat":
      return [gl.HALF_FLOAT, 2];
  }
}

export type BufferMode =
  | "static_draw"
  | "static_copy"
  | "static_read"
  | "dynamic_draw"
  | "dynamic_copy"
  | "dynamic_read"
  | "stream_draw"
  | "stream_read"
  | "stream_copy";

export function glBufferMode(gl: WebGL2RenderingContext, m: BufferMode) {
  switch (m) {
    case "static_draw":
      return gl.STATIC_DRAW;
    case "static_copy":
      return gl.STATIC_COPY;
    case "static_read":
      return gl.STATIC_READ;
    case "dynamic_draw":
      return gl.DYNAMIC_DRAW;
    case "dynamic_copy":
      return gl.DYNAMIC_COPY;
    case "dynamic_read":
      return gl.DYNAMIC_READ;
    case "stream_draw":
      return gl.STREAM_DRAW;
    case "stream_read":
      return gl.STREAM_READ;
    case "stream_copy":
      return gl.STREAM_COPY;
  }
}
