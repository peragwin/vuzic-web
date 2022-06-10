import { Pane } from "tweakpane";

// eslint-disable-next-line import/no-webpack-loader-syntax
import iterateFrag from "raw-loader!./iterate.frag";
import { AudioProcessor } from "../../audio/audio";
import { TextureObject } from "../textures";
import { CanvasObject, FramebufferObject, RenderTarget } from "../graphics";
import { Dims } from "../types";
import { Iterate } from "./iterate";
import { Draw } from "./draw";
import { Fade } from "../misc/fade";
import { Bloom } from "../misc/bloom";
import { abs } from "mathjs";

const MAX_PARTICLE_TYPES = 128;
export const TEX_WIDTH = 1024;

export interface RenderParams extends RenderInput {
  numParticles: number;
  numTypes: number;
  coefficients: CoefficientParams;
}

export class ParticleLifeController {
  private pane?: Pane;
  public params: RenderParams = {
    numParticles: 1024,
    numTypes: 16,
    friction: 0.1,
    fade: 0.96,
    sharpness: 0.9,
    pointSize: 2.0,
    coefficients: {
      sigma: 0.05,
      mean: 0.0,
      minRadius: { x: 0.0, y: 10.0 },
      maxRadius: { x: 10.0, y: 40.0 },
    },
  };
  public fps: number = 0.0;

  constructor() {}

  public show() {
    if (!this.pane) {
      const pane = new Pane();
      this.pane = pane;

      pane.addInput(this.params, "numParticles");
      const particleShape = pane.addFolder({ title: "Particle Shape" });
      particleShape.addInput(this.params, "pointSize", { label: "size" });
      particleShape.addInput(this.params, "sharpness");
      pane.addInput(this.params, "fade");
      pane.addInput(this.params, "friction");
      pane.addMonitor(this, "fps");
    }
    return this.pane;
  }

  public hide() {
    if (this.pane) {
      this.pane.dispose();
    }
    delete this.pane;
  }

  public config() {
    return [];
  }
  public values() {
    return [];
  }
  public update(action: { type: "all" | "load"; value: any }) {}
  public export() {
    return [];
  }
}

function random_normal() {
  const u = 1 - Math.random();
  const v = 1 - Math.random();
  return Math.sqrt(-2 * Math.log(u) * Math.cos(2 * Math.PI * v));
}

interface CoefficientParams {
  sigma: number;
  mean: number;
  minRadius: { x: number; y: number };
  maxRadius: { x: number; y: number };
}

const MIN_RADIUS = 2.0;
const PARAMETER_SCALE = 0.01; // input parameters are scaled x100

class Coefficients {
  public baseAttraction: Float32Array;
  public minRadii: Float32Array;
  public maxRadii: Float32Array;

  constructor(
    private state: State,
    private audio: AudioProcessor,
    private params: CoefficientParams
  ) {
    const { numTypes } = state;
    this.baseAttraction = new Float32Array(numTypes * numTypes);
    this.minRadii = new Float32Array(numTypes * numTypes);
    this.maxRadii = new Float32Array(numTypes * numTypes);
    this.randomizeCoefficients(numTypes);
  }

  public randomizeCoefficients(numTypes: number) {
    const { params, state, baseAttraction, minRadii, maxRadii } = this;

    for (let i = 0; i < numTypes; i++) {
      for (let j = 0; j < numTypes; j++) {
        const idx = j * numTypes + i;
        const attract = params.sigma * random_normal() + params.mean;
        const minRadius =
          Math.random() * (params.minRadius.y - params.minRadius.x) +
          params.minRadius.x;
        const maxRadius =
          Math.random() * (params.maxRadius.y - params.maxRadius.x) +
          params.maxRadius.x;
        if (i == j) {
          baseAttraction[idx] = -abs(attract);
          minRadii[idx] = MIN_RADIUS;
        } else {
          baseAttraction[idx] = attract;
          minRadii[idx] = Math.max(minRadius, MIN_RADIUS);
        }
        maxRadii[idx] = Math.max(maxRadius, minRadii[idx]);
        // enforce symmetry
        const idxT = i * numTypes + j;
        maxRadii[idxT] = maxRadii[idx];
        minRadii[idxT] = minRadii[idx];
      }
    }

    const interactionMatrix = new Float32Array(
      Array.from(baseAttraction)
        .map((a, i) => [a, minRadii[i], maxRadii[i]])
        .flat()
        .map((v) => v * PARAMETER_SCALE)
    );
    state.interactionMatrix.updateData(numTypes, numTypes, interactionMatrix);
  }

  public updateFromAudio() {
    const [drivers, hasUpdate] = this.audio.getDrivers();
    if (!hasUpdate) return;
    // do things
  }
}

class State {
  positions: TextureObject[];
  velocities: TextureObject[];
  types: TextureObject;
  colors: TextureObject;
  interactionMatrix: TextureObject;

  stateSize: Dims;

  constructor(
    gl: WebGL2RenderingContext,
    public numParticles: number,
    public numTypes: number
  ) {
    const stateSize = {
      width: Math.max(numParticles, TEX_WIDTH),
      height: Math.floor(numParticles / TEX_WIDTH),
    };
    this.stateSize = stateSize;
    this.numTypes = numTypes;

    this.positions = Array.from(Array(2)).map(
      (_) =>
        new TextureObject(gl, {
          mode: gl.NEAREST,
          internalFormat: gl.RGBA32I,
          format: gl.RGBA_INTEGER,
          type: gl.INT,
          width: TEX_WIDTH,
          height: TEX_WIDTH,
        })
    );

    this.velocities = Array.from(Array(2)).map(
      (_) =>
        new TextureObject(gl, {
          mode: gl.NEAREST,
          internalFormat: gl.RGBA32I,
          format: gl.RGBA_INTEGER,
          type: gl.INT,
          width: TEX_WIDTH,
          height: TEX_WIDTH,
        })
    );

    this.types = new TextureObject(gl, {
      mode: gl.NEAREST,
      internalFormat: gl.R32I,
      format: gl.RED_INTEGER,
      type: gl.INT,
      width: TEX_WIDTH,
      height: TEX_WIDTH,
    });

    // This is also a float value represented as int.
    // It's rendered to in the AudioUpdate pass.
    this.interactionMatrix = new TextureObject(gl, {
      mode: gl.NEAREST,
      internalFormat: gl.RGB32I,
      format: gl.RGB_INTEGER,
      type: gl.INT,
      width: MAX_PARTICLE_TYPES,
      height: MAX_PARTICLE_TYPES,
    });

    this.colors = new TextureObject(gl, {
      mode: gl.NEAREST,
      internalFormat: gl.RGB8_SNORM,
      format: gl.RGB,
      type: gl.UNSIGNED_BYTE,
      width: MAX_PARTICLE_TYPES,
      height: 1,
    });

    this.randomizeParticleTypes();
    this.randomizeParticleState();
  }

  public resize(size: Dims) {
    // todo;
  }

  public randomizeParticleTypes() {
    const types = new Int32Array(
      Array.from(Array(this.numParticles)).map((_) =>
        Math.floor(this.numTypes * Math.random())
      )
    );
    this.types.updateData(
      Math.min(this.numParticles, TEX_WIDTH),
      Math.floor(this.numParticles / TEX_WIDTH),
      types
    );
  }

  public randomizeParticleState() {
    const positions = new Float32Array(
      Array.from(Array(this.numParticles))
        .map((_) => [Math.random(), Math.random(), 0.0])
        .flat()
    );
    const velocities = new Float32Array(
      Array.from(Array(this.numParticles))
        .map((_) => [random_normal() * 0.05, random_normal() * 0.05, 0.0])
        .flat()
    );
    this.positions.forEach((p) =>
      p.updateData(
        Math.min(this.numParticles, TEX_WIDTH),
        Math.floor(this.numParticles / TEX_WIDTH),
        positions
      )
    );
    this.velocities.forEach((p) =>
      p.updateData(
        Math.min(this.numParticles, TEX_WIDTH),
        Math.floor(this.numParticles / TEX_WIDTH),
        velocities
      )
    );
  }
}

interface RenderInput {
  friction: number;
  pointSize: number;
  sharpness: number;
  fade: number;
}

class RenderPipeline {
  private state: State;
  private fb: {
    iterate: FramebufferObject[];
    draw: FramebufferObject[];
  };
  private drawBuffers: TextureObject[];

  private coefficients: Coefficients;
  private iterate: Iterate;
  private draw: Draw;
  private fade: Fade;
  private bloom: Bloom;

  private swap = 0;

  constructor(
    private gl: WebGL2RenderingContext,
    canvasSize: Dims,
    numParticles: number,
    numTypes: number,
    audio: AudioProcessor,
    params: CoefficientParams
  ) {
    const state = new State(gl, numParticles, numTypes);
    this.state = state;

    const iterate = Array.from(Array(2)).map((_, i) => {
      const fb = new FramebufferObject(gl, state.stateSize, true, true);
      fb.attach(state.positions[i], 0);
      fb.attach(state.velocities[i], 1);
      fb.bind();
      fb.checkStatus();
      return fb;
    });

    this.drawBuffers = Array.from(Array(2)).map(
      (_) =>
        new TextureObject(gl, {
          mode: gl.LINEAR,
          internalFormat: gl.RGBA8,
          format: gl.RGBA,
          type: gl.UNSIGNED_BYTE,
          ...canvasSize,
        })
    );
    const draw = Array.from(Array(2)).map((_, i) => {
      const fb = new FramebufferObject(gl, canvasSize, true, false);
      fb.attach(this.drawBuffers[i], 0);
      fb.bind();
      fb.checkStatus();
      return fb;
    });

    this.fb = { iterate, draw };

    this.coefficients = new Coefficients(state, audio, params);
    this.iterate = new Iterate(gl);
    this.draw = new Draw(gl, state.stateSize);
    this.fade = new Fade(gl);
    this.bloom = new Bloom(gl, canvasSize);
  }

  public render(input: RenderInput, target: RenderTarget) {
    this.coefficients.updateFromAudio();

    this.iterate.render(
      {
        numParticles: this.state.numParticles,
        friction: input.friction,
        positions: this.state.positions[1 - this.swap],
        velocities: this.state.velocities[1 - this.swap],
        types: this.state.types,
        interaction: this.state.interactionMatrix,
      },
      this.fb.iterate[this.swap]
    );

    this.fade.render(
      { image: this.drawBuffers[this.swap], fade: input.fade },
      this.fb.draw[1 - this.swap]
    );

    this.draw.render(
      {
        numParticles: this.state.numParticles,
        pointSize: input.pointSize,
        sharpness: input.sharpness,
        positions: this.state.positions[this.swap],
        types: this.state.types,
        colors: this.state.colors,
      },
      this.fb.draw[1 - this.swap]
    );

    this.bloom.render({ image: this.drawBuffers[1 - this.swap] }, target);

    this.swap = 1 - this.swap;
  }

  public resize(size: { stateSize?: Dims; canvasSize?: Dims }) {
    const { stateSize, canvasSize } = size;
    if (stateSize) {
      this.state.resize(stateSize);
      this.fb.iterate.forEach((fb, i) => {
        fb.setSize(stateSize);
        fb.attach(this.state.positions[i], 0);
        fb.attach(this.state.velocities[i], 1);
        fb.bind();
        fb.checkStatus();
      });
    }
    if (canvasSize) {
      const gl = this.gl;
      this.drawBuffers = Array.from(Array(2)).map(
        (_) =>
          new TextureObject(gl, {
            mode: gl.LINEAR,
            internalFormat: gl.RGBA8,
            format: gl.RGBA,
            type: gl.UNSIGNED_BYTE,
            ...canvasSize,
          })
      );
      this.fb.draw.forEach((fb, i) => {
        fb.setSize(canvasSize);
        fb.attach(this.drawBuffers[i], 0);
        fb.bind();
        fb.checkStatus();
      });
    }
  }

  // public setNumTypes(numTypes: number) {
  //   this.numTypes = numTypes;
  // }
}

class Universe {
  readonly gl: WebGL2RenderingContext;
  private pipeline: RenderPipeline;
  private canvasTarget: CanvasObject;
  private loopHandle: number;

  private frameCount = 0;
  private lastTime = 0;

  constructor(
    private controller: ParticleLifeController,
    canvas: HTMLCanvasElement,
    audio: AudioProcessor
  ) {
    controller.show();

    const numParticles = controller.params.numParticles;
    const numTypes = controller.params.numTypes;
    const canvasSize = { width: canvas.width, height: canvas.height };

    console.log({ iterateFrag });

    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) throw new Error("webgl2 is required");
    this.gl = gl;

    this.canvasTarget = new CanvasObject(
      gl,
      (canvasSize) => this.pipeline.resize({ canvasSize }),
      true
    );

    this.pipeline = new RenderPipeline(
      gl,
      canvasSize,
      numParticles,
      numTypes,
      audio,
      controller.params.coefficients
    );
    this.loopHandle = requestAnimationFrame(this.loop.bind(this, true));
  }

  public loop(repeat = true) {
    if (repeat) {
      this.loopHandle = requestAnimationFrame(this.loop.bind(this, true));
    }

    this.pipeline.render({ ...this.controller.params }, this.canvasTarget);

    this.frameCount = (this.frameCount + 1) & 0xffff;
    const now = performance.now();
    const e = now - this.lastTime;
    if (e > 1000) {
      this.lastTime = now;
      this.controller.fps = Math.trunc((1000 * this.frameCount) / e);
      this.frameCount = 0;
    }
  }

  public stop() {
    cancelAnimationFrame(this.loopHandle);
    this.controller.hide();
    console.log("we done");
  }
}

export default Universe;
