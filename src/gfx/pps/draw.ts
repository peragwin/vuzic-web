import { WebGL2Context, PPS } from "./pps";
import { Camera } from "../util/camera";
import { vec3, mat4 } from "gl-matrix";
import {
  ShaderConfig,
  Graphics,
  VertexArrayObject,
  CanvasObject,
  RenderTarget,
} from "../graphics";
import { CameraController } from "../util/cameraController";

const shaders = (gl: WebGL2RenderingContext) => {
  const vert = `#version 300 es
precision mediump float;
precision mediump usampler2D;
precision mediump isampler2D;

uniform isampler2D texPositions;
uniform isampler2D texColors;
uniform sampler2D texPalette;
uniform ivec2 uStateSize;
uniform float uPointSize;
layout (std140) uniform uCameraMatrix {
  mat4 matView;
  mat4 matTransform;
  mat4 matProjection;
};

out vec4 color;

void main() {
  int w = uStateSize.x;
  ivec2 index = ivec2(gl_VertexID % w, gl_VertexID / w);
  ivec3 ipos = texelFetch(texPositions, index, 0).xyz;
  vec3 position = vec3(intBitsToFloat(ipos.x), intBitsToFloat(ipos.y), intBitsToFloat(ipos.z));
  vec4 p = vec4(position, 1.);

  float cval = intBitsToFloat(texelFetch(texColors, index, 0).r);
  vec4 c = texture(texPalette, vec2(cval, 0.0));

  gl_Position = matProjection * matTransform * matView * p;
  gl_PointSize = uPointSize; // * (2. - zscale);
  color = c;
}
`;
  const frag = `#version 300 es
precision mediump float;

uniform float uAlpha;

in vec4 color;
out vec4 fragColor;

void main() {
  vec2 p =  2. * gl_PointCoord.xy - 1.;
  float r = length(p);
  // float a = 1. / (1. + r*r);
  float a = 1. - pow(r, 3.);
  // float a = step(r, 1.);
  fragColor = vec4(a * color.rgb, uAlpha);
}
`;
  return [
    new ShaderConfig(vert, gl.VERTEX_SHADER),
    new ShaderConfig(frag, gl.FRAGMENT_SHADER),
  ];
};

export class Draw {
  public gfx: Graphics;
  public cameraController: CameraController;

  private camera: Camera;
  private target: RenderTarget;

  constructor(gl: WebGL2Context, private pps: PPS, canvas: HTMLCanvasElement) {
    const particles = pps.params.particles;

    this.camera = new Camera((45 * Math.PI) / 180, 1, -1, 1);
    const initRadius = 3.5;
    this.camera.orientation = vec3.fromValues(0, 1, 0);
    this.camera.location = vec3.fromValues(0, 0, initRadius);
    this.camera.target = vec3.fromValues(0, 0, 0);

    this.cameraController = new CameraController(
      this.camera,
      canvas,
      pps.mode === "3D",
      initRadius
    );

    const identity = mat4.create() as Float32Array;
    let updateCamera =
      pps.mode === "3D"
        ? () => {
            this.cameraController.update();
            pps.state.uCameraMatrix.update([
              this.camera.matrix as Float32Array,
              identity,
              this.camera.projectionMatrix as Float32Array,
            ]);
          }
        : () => {};
    updateCamera();
    this.target = new CanvasObject(
      gl,
      ({ width, height }) => {
        // uncomment to adjust for aspect ratio and always display a cube
        // if (this.mode === "3D") this.cameraController.setAspect(width / height);
      },
      true,
      false,
      updateCamera
    );

    const gfx = new Graphics(gl, this.target, shaders(gl), () => {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.DST_ALPHA);
    });
    this.gfx = gfx;

    gfx.attachUniform(
      "uStateSize",
      (loc, value: { width: number; height: number }) => {
        gl.uniform2i(loc, value.width, value.height);
      }
    );
    gfx.attachUniform("uPointSize", (l, v) => gl.uniform1f(l, v));
    gfx.attachUniform("uAlpha", gl.uniform1f.bind(gl));
    gfx.attachUniformBlock("uCameraMatrix", 0);

    this.init();

    const vao = new VertexArrayObject(
      null,
      0,
      particles,
      gl.POINTS,
      (gfx: Graphics) => {
        gfx.bindUniform("uStateSize", pps.stateSize);
        gfx.bindUniform("uPointSize", pps.params.size);
        gfx.bindUniform("uAlpha", pps.params.particleDensity);
        gfx.bindUniformBuffer("uCameraMatrix", pps.state.uCameraMatrix);
        gfx.bindTexture(pps.state.getActive().positions, 0);
        gfx.bindTexture(pps.state.colors, 1);
        gfx.bindTexture(pps.state.palette, 2);
        return true;
      }
    );
    gfx.addVertexArrayObject(vao);
  }

  public render(target?: RenderTarget) {
    this.gfx.render(false, target || this.target);
  }

  public init() {
    const { pps, gfx } = this;
    pps.state.positions.forEach((p) => gfx.attachTexture(p, "texPositions"));
    gfx.attachTexture(pps.state.colors, "texColors");
    gfx.attachTexture(pps.state.palette, "texPalette");
  }
}
