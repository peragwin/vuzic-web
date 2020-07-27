import { ShaderSourceConfig } from "../program";
import { VertexArrayObject } from "../buffers";

export const quadVertShader: ShaderSourceConfig = {
  type: "vertex",
  source: `#version 300 es
precision mediump float;

in vec2 quad;

void main() {
  vec2 p = 2. * quad + 1.;
  gl_Position = vec4(p, 0., 1.);
}`,
};

export const quadVertAttributes = {
  quad: { name: "quad", index: 0 },
};

export const QUAD2 = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

export function makeQuadVao(gl: WebGL2RenderingContext) {
  return new VertexArrayObject(gl, {
    buffer: {
      mode: "static_draw",
      type: "float",
      data: QUAD2,
    },
    offset: 0,
    length: 4,
    drawMode: "triangle_strip",
    attriutes: [
      {
        attr: quadVertAttributes.quad,
        size: 2,
        offset: 0,
        stride: 2,
      },
    ],
  });
}
