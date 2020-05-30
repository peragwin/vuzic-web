#version 300 es

#ifdef GL_ES
precision mediump float;
#endif

uniform sampler2D texPositions;
uniform sampler2D texColors;
uniform vec2 uStateSize;
uniform vec2 uResolution;
uniform float uPointSize;

in vec2 index;
out vec2 position;
out vec4 color;

float decode(ivec2 data) {
    return float(data.x << 8 + data.y);
}

void main() {
    vec4 psample = texture(texPositions, index/uStateSize);
    position = vec2(decode(psample.xy), decode(psample.zw));

    color = texture(texColors, index/uStateSize);

    gl_PointSize = uPointSize;
}
