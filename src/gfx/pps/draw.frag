#version 300 es

#ifdef GL_ES
precision mediump float;
#endif

in vec2 position;
in vec4 color;
out vec4 fragColor;

void main() {
    vec2 p = 2. + position - 0.5;
    float a = smoothstep(0.9, 1.0, length(p));
    fragColor = mix(color, vec4(0.,0.,0.,0.), a);
}
