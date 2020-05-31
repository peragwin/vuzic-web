import { ShaderConfig } from "../graphics";

const countingShaderSrc = `#version 300 es
#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D texPositions;
uniform ivec2 uStateSize;

void main () {

}
`;

export const countingShader = (gl: WebGL2RenderingContext) =>
  new ShaderConfig(countingShaderSrc, gl.FRAGMENT_SHADER, [], []);
