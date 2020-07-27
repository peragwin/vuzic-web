import { Texture } from "./textures";
import { AttributeAttachment } from "./types";
import { UniformBuffer } from "./buffers";

export type ShaderType = "vertex" | "fragment" | "compute";
export interface ShaderSourceConfig {
  type: ShaderType;
  source: string;
}

export interface TextureConfig {
  binding: number;
}

export interface AttributeConfig {
  // Techincally opengl lets you specify a binding before you link the program, but
  // in webgl2 is probably way smarter to specify the location= in the shader..
  // binding: number;
  // The internal size doesn't actually have to match the size we specify in vertexAttribPointer,
  // although if it doesn't then it'd be good to be able to set some default AND still
  // set vertexAttribPointer. In any case, this value will be ignored.
  // size: 1 | 2 | 3 | 4;
}

type UniformBindingFunc<T> = (
  gl: WebGL2RenderingContext,
  location: WebGLUniformLocation,
  value: T
) => void;

export interface UniformConfig<T> {
  bindFunc: UniformBindingFunc<T>;
}

export interface UniformBufferConfig {
  location: number;
}

type ProgramAttributeConfig<T> = Record<keyof T, AttributeConfig>;
type ProgramTextureConfig<T> = Record<keyof T, TextureConfig>;
type ProgramUniformConfig<T> = {
  [P in keyof T]: T[P] extends UniformConfig<infer U> ? T[P] : never;
};
type ProgramUniformBufferConfig<T> = Record<keyof T, UniformBufferConfig>;

// export interface ProgramConfig<
//   TexturesT = any,
//   AttrsT = any,
//   UniformsT = {},
//   UBuffersT = any
// > {
export interface ProgramConfig<TexturesT, AttrsT, UniformsT, UBuffersT> {
  sources: ShaderSourceConfig[];
  textures?: ProgramTextureConfig<TexturesT>;
  attributes?: ProgramAttributeConfig<AttrsT>;
  uniforms?: ProgramUniformConfig<UniformsT>;
  uniformBuffers?: ProgramUniformBufferConfig<UBuffersT>;
}

export function makeConfig<T, U, V, W>(config: ProgramConfig<T, U, V, W>) {
  return config;
}

class TextureAttachment {
  constructor(
    private gl: WebGL2RenderingContext,
    private name: string,
    private location: WebGLUniformLocation,
    private binding: number
  ) {}

  public bind(tex: Texture) {
    tex.bind(this.binding);
    this.gl.uniform1i(this.location, this.binding);
  }
}

type TextureAttachments<T extends ProgramTextureConfig<T>> = Record<
  keyof T,
  TextureAttachment
>;

class UniformAttachment<T> {
  constructor(
    private gl: WebGL2RenderingContext,
    private name: string,
    private location: WebGLUniformLocation,
    private bindFunc: UniformBindingFunc<T>
  ) {}

  public bind(v: T) {
    this.bindFunc(this.gl, this.location, v);
  }
}

type UniformAttachments<T extends ProgramUniformConfig<T>> = {
  [P in keyof T]: T[P] extends UniformConfig<infer U>
    ? UniformAttachment<U>
    : never;
};

type AttributeAttachements<T extends ProgramAttributeConfig<T>> = Record<
  keyof T,
  AttributeAttachment
>;

class UniformBufferAttachment {
  constructor(
    private gl: WebGL2RenderingContext,
    private name: string,
    private binding: number
  ) {}

  public bind(ubo: UniformBuffer) {
    this.gl.bindBufferBase(this.gl.UNIFORM_BUFFER, this.binding, ubo.buffer);
  }
}

type UniformBufferAttachments<T extends ProgramUniformBufferConfig<T>> = Record<
  keyof T,
  UniformBufferAttachment
>;

export type ProgramType<P> = P extends ProgramConfig<
  infer T,
  infer U,
  infer V,
  infer W
>
  ? Program<
      ProgramTextureConfig<T>,
      ProgramAttributeConfig<U>,
      ProgramUniformConfig<V>,
      ProgramUniformBufferConfig<W>
    >
  : never;

export interface ProgramBase {
  use(): void;
}

export class Program<
  TexturesT extends ProgramTextureConfig<TexturesT>,
  AttrsT extends ProgramAttributeConfig<AttrsT>,
  UniformsT extends ProgramUniformConfig<UniformsT>,
  UBuffersT extends ProgramUniformBufferConfig<UBuffersT>
> implements ProgramBase {
  public attributes: AttributeAttachements<AttrsT>;
  public textures: TextureAttachments<TexturesT>;
  public uniforms: UniformAttachments<UniformsT>;
  public uniformBuffers: UniformBufferAttachments<UBuffersT>;

  private program: WebGLProgram;
  private shaders: WebGLShader[];

  constructor(
    readonly gl: WebGL2RenderingContext,
    config: ProgramConfig<TexturesT, AttrsT, UniformsT, UBuffersT>
  ) {
    const program = gl.createProgram();
    if (program === null) throw new Error("could not create gl program");
    this.program = program;

    this.shaders = [];
    for (let { type, source } of config.sources) {
      const c = this.compileShader(type, source);
      if (!c) throw new Error("failed to compile shader");

      this.shaders.push(c);
      gl.attachShader(program, c);
    }

    gl.linkProgram(program);
    const success = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (!success) {
      console.error(gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      throw new Error("failed to link program");
    }

    this.uniforms = {} as UniformAttachments<UniformsT>;
    if (config.uniforms) {
      for (let uni in config.uniforms) {
        // Really don't know here since the public type seems to work..
        // @ts-ignore
        this.uniforms[uni] = this.uniformAttachment(uni, config.uniforms[uni]);
      }
    }

    this.textures = {} as TextureAttachments<TexturesT>;
    if (config.textures) {
      for (let tex in config.textures) {
        this.textures[tex] = this.textureAttachement(tex, config.textures[tex]);
      }
    }

    this.attributes = {} as AttributeAttachements<AttrsT>;
    if (config.attributes) {
      for (let attr in config.attributes) {
        this.attributes[attr] = this.attributeAttachment(
          attr,
          config.attributes[attr]
        );
      }
    }

    this.uniformBuffers = {} as UniformBufferAttachments<UBuffersT>;
    if (config.uniformBuffers) {
      for (let ubo in config.uniformBuffers) {
        this.uniformBuffers[ubo] = this.uniformBufferAttachment(
          ubo,
          config.uniformBuffers[ubo]
        );
      }
    }
  }

  public use() {
    this.gl.useProgram(this.program);
  }

  // look up an attribute location. conf is not used for now.
  private attributeAttachment(name: string, conf: AttributeConfig) {
    const index = this.gl.getAttribLocation(this.program, name);
    if (index === -1 || index === this.gl.INVALID_INDEX)
      throw new Error(`attribute index not found for ${name}`);
    return { name, index };
  }

  // associates a uniform name with a location and binding function
  private uniformAttachment<T>(name: string, conf: UniformConfig<T>) {
    const loc = this.gl.getUniformLocation(this.program, name);
    if (loc === null) throw new Error(`uniform location not found for ${name}`);
    return new UniformAttachment(this.gl, name, loc, conf.bindFunc);
  }

  // associates the texture with the uniform of the given name
  private textureAttachement(name: string, conf: TextureConfig) {
    const loc = this.gl.getUniformLocation(this.program, name);
    if (loc === null) throw new Error(`uniform location not found for ${name}`);
    return new TextureAttachment(this.gl, name, loc, conf.binding);
  }

  // associates the uniform buffer with a provided binding index
  private uniformBufferAttachment(name: string, conf: UniformBufferConfig) {
    const index = this.gl.getUniformBlockIndex(this.program, name);
    if (index === this.gl.INVALID_INDEX)
      throw new Error(`uniform block index not found for ${name}`);

    this.gl.uniformBlockBinding(this.program, index, conf.location);
    return new UniformBufferAttachment(this.gl, name, conf.location);
  }

  private compileShader(type: ShaderType, source: string) {
    const gl = this.gl;
    const shadertype = (() => {
      switch (type) {
        case "vertex":
          return gl.VERTEX_SHADER;
        case "fragment":
          return gl.FRAGMENT_SHADER;
        case "compute":
          const t = (gl as WebGL2ComputeRenderingContext).COMPUTE_SHADER;
          if (t === undefined) throw new Error("compute shader not supported");
          return t;
      }
    })();

    const shader = gl.createShader(shadertype);
    if (!shader) throw new Error(`failed to create shader ${type}`);

    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (success) return shader;

    const error = gl.getShaderInfoLog(shader);
    if (error) {
      const matchError = /^ERROR:\s+\d+:(\d+):\s+(.*)$/;
      const lines = error.split("\n");
      const srcLines = source.split("\n");
      const errInfo = lines.map((l) => {
        const match = matchError.exec(l);
        if (match) {
          const line = +match[1] - 1;
          return (
            l +
            srcLines
              .slice(Math.max(0, line - 2), line + 3)
              .map((s, i) => `\n${i - 1 + line} >>> ${s}`)
              .join("")
          );
        }
        return l;
      });
      console.error(errInfo.join("\n"));
    } else {
      console.error("no shader info log :(");
    }
    this.gl.deleteShader(shader);
    return null;
  }
}

/*

type UC<T extends UniformConfig<any>> = Parameters<T["bind"]>[0];

function makeCfg<
  T extends ProgramTextureConfig<T>,
  U extends ProgramAttributeConfig<U>,
  V extends ProgramUniformConfig<V>,
  W extends ProgramUniformBufferConfig<W>
>(cfg: ProgramConfig<T, U, V, W>): ProgramConfig<T, U, V, W> {
  return cfg;
}

const cfg = makeCfg({
  sources: [],
  attributes: { foo: { binding: 420, size: 4 } },
  textures: { tex1: { binding: 69 } },
  uniforms: {
    val: { bind: (gl: WebGL2RenderingContext, loc: string, v: number) => {} },
    dims: { bind: (gl: WebGL2RenderingContext, loc: number, v: Dims) => {} },
    // foo: { nope: "fail" },
  },
});

// cfg.uniforms?.dims.bind(1); // error: typeof cfg.uniforms.dims === (v: Dims) => void
// cfg.uniforms?.val.bind("s"); // error: typeof cfg.uniforms.val === (v: number) => void

// const uc: UniformConfig<number> = { bind: (v: number) => {} };
// function makeUC<T>(ucc: T): UC<UniformConfig<T>> {
//   return ucc;
// }
// const ucc = makeUC(uc); // typeof ucc === UniformConfig<number>

// function makeAttr<T extends ProgramAttributeConfig<T>>(
//   attr: T
// ): ProgramAttributeConfig<T> {
//   return attr;
// }

// const a = makeAttr({ foo: { attr: "t" } });

// cfg.attributes?.foo.attr;

type ProgramAttrs<T> = T extends undefined ? {} : T;

let canvas = document.createElement("canvas");
let gl = canvas.getContext("webgl2")!;

const p = new Program(gl, cfg);

if (p.attributes) console.log(p.uniforms.dims);
console.log(p);

// type UniformAttachments<T> = {
//   [P in keyof ProgramUniformConfig<T>]: UniformAttachment<
//     ProgramUniformConfig<T>[P]
//   >;
// };
    // conf: ValueOf<ProgramUniformConfig<UniformsT>>
  // [P in keyof T]: T[P] extends UniformConfig<U> ? ;

//  type ValueOf<T> = T[keyof T];

*/
