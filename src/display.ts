import { vec2, vec3, vec4, mat4, mat3 } from "gl-matrix";
import { Graphics, ShaderConfig, TextureConfig, TextureObject, BufferConfig, VertexArrayObject } from "./graphics";
import PixelMap, { RGBA } from "./pixelmap";

// warp controlls the zoom in the center of the display
// scale controlls the vertical scaling factor
const vertexShaderSource = `#version 300 es
	uniform float warp[{0}];
	uniform float scale[{1}];
	//attribute vec3 vertPos;
  in vec3 vertPos;
  //attribute vec2 texPos;
  in vec2 texPos;
	// varying vec2 fragTexPos;
  out vec2 fragTexPos;
  
	float x, y, s, wv, sv;
	void main() {

    x = vertPos.x;
    y = vertPos.y;

    sv = scale[int((x+1.)*float({1})/2.)];
    wv = warp[int((y+1.)*float({0})/2.)];

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

		fragTexPos = texPos;
		gl_Position = vec4(x, y, vertPos.z, 1.0);
	}`

const fragmenShaderSource = `#version 300 es
	precision highp float;

	vec2 iResolution = vec2(1920.0, 1080.0);
	uniform sampler2D tex;
  // varying vec2 fragTexPos;
  in vec2 fragTexPos;
	out vec4 fragColor;

	vec4 blur(sampler2D image, vec2 uv, vec2 resolution) {
		vec4 color = vec4(0.0);
		const float radius = 2.0;
		for (float scale = 1.0; scale < radius; scale++)
		{
		vec2 direction = vec2(scale,0.0);

		vec2 off1 = vec2(1.411764705882353) * direction;
		vec2 off2 = vec2(3.2941176470588234) * direction;
		vec2 off3 = vec2(5.176470588235294) * direction;

		color += texture(image, uv) * 0.1964825501511404;
		color += texture(image, uv + (off1 / resolution)) * 0.2969069646728344;
		color += texture(image, uv - (off1 / resolution)) * 0.2969069646728344;
		color += texture(image, uv + (off2 / resolution)) * 0.09447039785044732;
		color += texture(image, uv - (off2 / resolution)) * 0.09447039785044732;
		color += texture(image, uv + (off3 / resolution)) * 0.010381362401148057;
		color += texture(image, uv - (off3 / resolution)) * 0.010381362401148057;

		direction = vec2(0,scale);
		off1 = vec2(1.411764705882353) * direction;
		off2 = vec2(3.2941176470588234) * direction;
		off3 = vec2(5.176470588235294) * direction;

		color += texture(image, uv) * 0.1964825501511404;
		color += texture(image, uv + (off1 / resolution)) * 0.2969069646728344;
		color += texture(image, uv - (off1 / resolution)) * 0.2969069646728344;
		color += texture(image, uv + (off2 / resolution)) * 0.09447039785044732;
		color += texture(image, uv - (off2 / resolution)) * 0.09447039785044732;
		color += texture(image, uv + (off3 / resolution)) * 0.010381362401148057;
		color += texture(image, uv - (off3 / resolution)) * 0.010381362401148057;
		}

		return color / 2.0 / (radius-1.0);
	}

	void main() {
		//vec2 uv = fragTexPos.xy / iResolution;
    fragColor = vec4(blur(tex, fragTexPos.xy, iResolution).rgb, 1);
		// vec3 v = texture(tex, fragTexPos).rgb;
    // gl_FragColor = vec4(v, 1);
    // fragColor = vec4(v, 1);
  }`


const square = [
  vec2.fromValues(-1, 1),
  vec2.fromValues(-1, -1),
  vec2.fromValues(1, -1),

  vec2.fromValues(-1, 1),
  vec2.fromValues(1, 1),
  vec2.fromValues(1, -1),
]

const uvCord = [
  vec2.fromValues(0, 0),
  vec2.fromValues(0, 1),
  vec2.fromValues(1, 1),

  vec2.fromValues(0, 0),
  vec2.fromValues(1, 0),
  vec2.fromValues(1, 1),
]

export class WarpGrid {
  private warp: Float32Array
  private scale: Float32Array
  private image: ImageData
  private gfx: Graphics
  private texture: TextureObject

  constructor(
    canvas: HTMLCanvasElement,
    readonly rows: number,
    readonly columns: number,
    readonly aspect: number,
    public onRender: (wg: WarpGrid) => void,
  ) {
    this.warp = new Float32Array(rows)
    for (let i = 0; i < this.warp.length; i++) this.warp[i] = 1
    this.scale = new Float32Array(columns)
    for (let i = 0; i < this.scale.length; i++) this.scale[i] = 1
    this.image = new ImageData(columns, rows)
    this.image.data.forEach((_, i, data) => { if (i % 8 === 0) data[i] = 255 })
    // console.log(this.warp, this.scale, this.image.data)

    const gl = canvas.getContext('webgl2')
    if (!gl) throw new Error("canvas does not support webgl")

    const vertexSrc = vertexShaderSource
      .replace(/\{0\}/g, rows.toString())
      .replace(/\{1\}/g, columns.toString())

    const shaderConfigs = [
      new ShaderConfig(
        vertexSrc,
        gl.VERTEX_SHADER,
        ["vertPos", "texPos"],
        ["warp", "scale"],
      ),
      new ShaderConfig(
        fragmenShaderSource,
        gl.FRAGMENT_SHADER,
        [],
        ["tex"],
      ),
    ]
    const gfx = new Graphics(gl, shaderConfigs, this.render.bind(this))
    this.gfx = gfx

    this.texture = gfx.newTextureObject(new TextureConfig(this.image, "tex", gl.LINEAR))
    this.createCells(gfx, columns, rows)

    this.gfx.start()
  }

  private async render(g: Graphics) {
    this.onRender(this)
    this.texture.update(g.gl, this.image)
  }

  private createCells(gfx: Graphics, columns: number, rows: number) {
    const wuloc = gfx.getUniformLocation("warp")
    if (!wuloc) throw new Error("cant find uniform loc for warp")
    const suloc = gfx.getUniformLocation("scale")
    if (!suloc) throw new Error("cant find uniform loc for scale")

    const density = 2

    const texsx = 1 / columns
    const texsy = 1 / rows
    const versx = 1 / columns / this.aspect
    const versy = 1 / rows / this.aspect

    const vscale = mat4.create()
    mat4.fromScaling(vscale, vec3.fromValues(versx / density, versy / density, 1))

    const uscale = mat3.create()
    mat3.fromScaling(uscale, vec2.fromValues(texsx, texsy))

    const warp = this.warp
    const scale = this.scale

    const verts = new Float32Array(5 * square.length * rows * columns)
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        let tx = versx * (1. + 2. * (x - columns / 2))
        let ty = versy * (1 + 2 * (y - rows / 2))
        const vtrans = mat4.create()
        mat4.fromTranslation(vtrans, vec3.fromValues(tx, ty, 0))

        tx = texsx * x
        ty = texsy * y
        const utrans = mat3.create()
        mat3.fromTranslation(utrans, vec2.fromValues(tx, ty))

        const vertsIdx = 5 * square.length * (x + columns * y)
        for (let i = 0; i < square.length; i++) {
          const vec = vec4.fromValues(square[i][0], square[i][1], 0, 1)
          vec4.transformMat4(vec, vec, vscale)
          vec4.transformMat4(vec, vec, vtrans)

          const tex = vec3.fromValues(uvCord[i][0], uvCord[i][1], 1)
          vec3.transformMat3(tex, tex, uscale)
          vec3.transformMat3(tex, tex, utrans)

          const idx = 5 * i + vertsIdx

          verts[idx] = vec[0]
          verts[idx + 1] = vec[1]
          verts[idx + 2] = vec[2]
          verts[idx + 3] = tex[0]
          verts[idx + 4] = tex[1]
        }
      }
    }

    const buffer = gfx.newBufferObject(
      new BufferConfig(verts, 'vertPos', 'texPos', 5, 3,
        (gl: WebGLRenderingContext) => {
          // console.log(warp, scale)
          // for (let i = 0; i < warp.length; i++) {
          //   warp[i] = 2 * (1 - i / warp.length);
          // }
          gl.uniform1fv(wuloc, warp)
          gl.uniform1fv(suloc, scale)
          return true
        }))//square.length * rows * columns))

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        const offset = square.length * (x + columns * y)
        //     const wi = (y >= warp.length) ? 2 * warp.length - 1 - y : y
        //     const si = (x >= scale.length) ? 2 * scale.length - 1 - x : x

        const vao = new VertexArrayObject(buffer, offset, square.length, gfx.gl.TRIANGLE_STRIP,
          (gl: WebGLRenderingContext) => true)
        gfx.addVertexArrayObject(vao)
      }
    }

  }

  public setPixel(x: number, y: number, c: RGBA) {
    const pix = new PixelMap(this.image)
    pix.at(x, y).a = c.a
    pix.at(x, y).r = c.r
    pix.at(x, y).g = c.g
    pix.at(x, y).b = c.b
  }

  public setPixelSlice(x: number, y: number, c: Uint8ClampedArray) {
    const idx = (this.image.width * y + x) * 4
    this.image.data.set(c, idx)
  }

  public setImage(img: ImageData) {
    this.image = img
  }

  public setWarp(warp: Float32Array) {
    for (let i = 0; i < this.warp.length; i++) {
      this.warp[i] = warp[i]
    }
  }

  public setScale(scale: Float32Array) {
    for (let i = 0; i < this.scale.length; i++) {
      this.scale[i] = scale[i]
    }
  }
}
