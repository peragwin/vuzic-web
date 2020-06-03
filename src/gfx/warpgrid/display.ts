import { vec2, vec3, vec4, mat4, mat3 } from "gl-matrix";
import {
  Graphics,
  ShaderConfig,
  TextureObject,
  BufferConfig,
  VertexArrayObject,
  CanvasObject,
} from "../graphics";
import PixelMap, { RGBA } from "../pixelmap";

// warp controlls the zoom in the center of the display
// scale controlls the vertical scaling factor
const vertexShaderSource = `#version 300 es
	uniform float warp[{0}];
	uniform float scale[{1}];
  in vec3 vertPos;
  in vec2 texPos;
  in vec2 uvPos;
  out vec2 fragTexPos;
  out vec3 vUvw;
  
	float x, y, s, wv, sv;
	void main() {

    x = vertPos.x;
    y = vertPos.y;

    sv = scale[int((x+1.)*float({1})/2.)];
    wv = warp[int((y+1.)*float({0})/2.)];
    float elev = wv + sv;

		if (x <= 0.0) {
			x = pow(x + 1.1, wv) - 1.0;
		} else {
			x = 1.0 - pow(abs(x - 1.1), wv);
		}

    if (y <= 0.0) {
      // s = (1.0 - y) / 2.0 *sv;
      s = (1. + y/2.) * sv;
			y = pow(y + 1.0, s) - 1.0;
		} else {
      // s = (1.0 + y) / 2.0 *sv;
      s = (1. - y/2.) * sv;
			y = 1.0 - pow(abs(y - 1.0), s);
    }
    
    float z = max(-elev * vertPos.z, 0.);

    vUvw = vec3(uvPos, elev);
		fragTexPos = texPos;
		gl_Position = vec4(elev * x, elev * y, z, 1.0);
	}`;

const fragmenShaderSource = `#version 300 es
	precision highp float;

	uniform sampler2D tex;
  in vec2 fragTexPos;
  in vec3 vUvw;
	out vec4 fragColor;

	void main() {
    vec4 color = texture(tex, fragTexPos.xy);
    float r = length(vUvw.xy);
    float a = vUvw.z * smoothstep(0.0, 1.0, 1. - r*r);
    fragColor = color * a;
 }`;

const square = [
  // add degenerate triangle
  vec2.fromValues(-1, 1),

  vec2.fromValues(-1, 1),
  vec2.fromValues(-1, -1),
  vec2.fromValues(1, -1),

  vec2.fromValues(-1, 1),
  vec2.fromValues(1, 1),
  vec2.fromValues(1, -1),

  // add degenerate triangle
  vec2.fromValues(1, -1),
];

const uvCord = [
  vec2.fromValues(0, 0),

  vec2.fromValues(0, 0),
  vec2.fromValues(0, 1),
  vec2.fromValues(1, 1),

  vec2.fromValues(0, 0),
  vec2.fromValues(1, 0),
  vec2.fromValues(1, 1),

  vec2.fromValues(1, 1),
];

export class WarpGrid {
  private warp: Float32Array;
  private scale: Float32Array;
  private image: ImageData;
  private gfx: Graphics;
  private texture: TextureObject;

  constructor(
    canvas: HTMLCanvasElement,
    readonly rows: number,
    readonly columns: number,
    readonly aspect: number,
    public onRender: (wg: WarpGrid) => void
  ) {
    this.warp = new Float32Array(rows);
    for (let i = 0; i < this.warp.length; i++) this.warp[i] = 1;
    this.scale = new Float32Array(columns);
    for (let i = 0; i < this.scale.length; i++) this.scale[i] = 1;
    this.image = new ImageData(columns, rows);
    this.image.data.forEach((_, i, data) => {
      if (i % 8 === 0) data[i] = 255;
    });

    const gl = canvas.getContext("webgl2");
    if (!gl) throw new Error("canvas does not support webgl");

    const vertexSrc = vertexShaderSource
      .replace(/\{0\}/g, rows.toString())
      .replace(/\{1\}/g, columns.toString());

    const shaderConfigs = [
      new ShaderConfig(vertexSrc, gl.VERTEX_SHADER, [], []),
      new ShaderConfig(fragmenShaderSource, gl.FRAGMENT_SHADER, [], []),
    ];
    const cv = new CanvasObject(gl);
    const gfx = new Graphics(gl, cv, shaderConfigs, this.render.bind(this));
    this.gfx = gfx;

    this.texture = new TextureObject(gl, {
      mode: gl.LINEAR,
      internalFormat: gl.RGBA,
      format: gl.RGBA,
      type: gl.UNSIGNED_BYTE,
    });

    gfx.attachTexture(this.texture, "tex");
    gfx.attachUniform("warp", gfx.gl.uniform1fv.bind(gfx.gl));
    gfx.attachUniform("scale", gfx.gl.uniform1fv.bind(gfx.gl));

    this.createCells(gfx, columns, rows);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this.gfx.start();
  }

  private async render(g: Graphics) {
    this.onRender(this);
    this.texture.update(this.image);
  }

  private createCells(gfx: Graphics, columns: number, rows: number) {
    const density = 2;

    const texsx = 1 / columns;
    const texsy = 1 / rows;
    const versx = 1 / columns / this.aspect;
    const versy = 1 / rows / this.aspect;

    const vscale = mat4.create();
    mat4.fromScaling(
      vscale,
      vec3.fromValues(versx / density, versy / density, 1)
    );

    const uscale = mat3.create();
    mat3.fromScaling(uscale, vec2.fromValues(texsx, texsy));

    const warp = this.warp;
    const scale = this.scale;

    const stride = 7;
    const verts = new Float32Array(stride * square.length * rows * columns);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        let tx = versx * (1 + 2 * (x - columns / 2));
        let ty = versy * (1 + 2 * (y - rows / 2));
        const vtrans = mat4.create();
        mat4.fromTranslation(vtrans, vec3.fromValues(tx, ty, 0));

        tx = texsx * x;
        ty = texsy * y;
        const utrans = mat3.create();
        mat3.fromTranslation(utrans, vec2.fromValues(tx, ty));

        const vertsIdx = stride * square.length * (x + columns * y);
        for (let i = 0; i < square.length; i++) {
          const vec = vec4.fromValues(square[i][0], square[i][1], 1, 1);
          vec4.transformMat4(vec, vec, vscale);
          vec4.transformMat4(vec, vec, vtrans);

          const tex = vec3.fromValues(uvCord[i][0], uvCord[i][1], 1);
          vec3.transformMat3(tex, tex, uscale);
          vec3.transformMat3(tex, tex, utrans);

          const idx = stride * i + vertsIdx;

          verts[idx] = vec[0];
          verts[idx + 1] = vec[1];
          verts[idx + 2] = vec[2];
          verts[idx + 3] = tex[0];
          verts[idx + 4] = tex[1];
          verts[idx + 5] = square[i][0];
          verts[idx + 6] = square[i][1];
        }
      }
    }

    const buffer = gfx.newBufferObject(
      new BufferConfig(
        verts,
        [
          { name: "vertPos", size: 3, offset: 0 },
          { name: "texPos", size: 2, offset: 3 },
          { name: "uvPos", size: 2, offset: 5 },
        ],
        (_) => {
          gfx.bindUniform("warp", warp);
          gfx.bindUniform("scale", scale);
          gfx.bindTexture(this.texture, 0);
          return true;
        }
      )
    );

    const vao = new VertexArrayObject(
      buffer,
      0,
      square.length * rows * columns,
      gfx.gl.TRIANGLE_STRIP
    );
    gfx.addVertexArrayObject(vao);
  }

  public setPixel(x: number, y: number, c: RGBA) {
    const pix = new PixelMap(this.image);
    pix.at(x, y).a = c.a;
    pix.at(x, y).r = c.r;
    pix.at(x, y).g = c.g;
    pix.at(x, y).b = c.b;
  }

  public setPixelSlice(x: number, y: number, c: Uint8ClampedArray) {
    const idx = (this.image.width * y + x) * 4;
    this.image.data.set(c, idx);
  }

  public setImage(img: ImageData) {
    this.image = img;
  }

  public setWarp(warp: Float32Array) {
    for (let i = 0; i < this.warp.length; i++) {
      this.warp[i] = warp[i];
    }
  }

  public setScale(scale: Float32Array) {
    for (let i = 0; i < this.scale.length; i++) {
      this.scale[i] = scale[i];
    }
  }
}
