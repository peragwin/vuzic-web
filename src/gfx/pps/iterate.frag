#version 300 es

#ifdef GL_ES
precision mediump float;
#endif

struct Params {
    float alpha;
    float beta;
    float radius;
    float vel;
};

// float params[4] = {180., 17., 5., 0.67};
uniform Params params;
uniform sampler2D previousState;

float decode(vec2 )

float countLeft(in vec2 pos) {
    return 0.;
}

float countRight(in vec2 pos) {
    return 0.;
}

in vec2 fragCoord;
out ivec4 position;
out ivec4 velocity;

void main(void) {
    vec2 pos = vec2(fragCoord);
    float nleft = countLeft(pos);
    float nright = countRight(pos);
    float sgn = sign(nright-nleft);

    int t = 4 >> 2;

    float dth = params.alpha + params.beta * (nleft+nright) * sgn;

    fragColor = vec4(1.,float(t),0.,1.);
}