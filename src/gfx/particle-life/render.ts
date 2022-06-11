import { AudioProcessor } from "../../audio/audio";
import { FramebufferObject, RenderTarget } from "../graphics";
import { Bloom, Params as BloomParams } from "../misc/bloom";
import { Fade } from "../misc/fade";
import { TextureObject } from "../textures";
import { Dims } from "../types";
import { CoefficientParams, Coefficients } from "./coefficients";
import { Draw } from "./draw";
import { Iterate } from "./iterate";
import { State } from "./state";

export interface RenderParams {
  numParticles: number;
  numTypes: number;
  coefficients: CoefficientParams;
  bloom: BloomParams;
  friction: number;
  pointSize: number;
  sharpness: number;
  fade: number;
}

export class RenderPipeline {
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
    params: RenderParams
  ) {
    const state = new State(gl, numParticles, numTypes);
    this.state = state;

    const iterate = Array.from(Array(2)).map((_, i) => {
      const fb = new FramebufferObject(gl, state.stateSize, true, false);
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
    this.drawBuffers.forEach((b) =>
      b.update(
        new ImageData(
          new Uint8ClampedArray(canvasSize.width * canvasSize.height * 4).map(
            (_, i) => (i % 4 === 3 ? 255 : 255)
          ),
          canvasSize.width,
          canvasSize.height
        )
      )
    );
    const draw = Array.from(Array(2)).map((_, i) => {
      const fb = new FramebufferObject(gl, canvasSize, true, false);
      fb.attach(this.drawBuffers[i], 0);
      fb.bind();
      fb.checkStatus();
      return fb;
    });

    this.fb = { iterate, draw };

    this.coefficients = new Coefficients(state, audio, params.coefficients);
    this.iterate = new Iterate(gl);
    this.draw = new Draw(gl, numParticles);
    this.fade = new Fade(gl);
    this.bloom = new Bloom(gl, canvasSize);
    this.bloom.update({ params: params.bloom });
  }

  public render(input: RenderParams, target: RenderTarget) {
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

    this.bloom.update({ params: input.bloom });
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
      this.drawBuffers = Array.from(Array(2)).map((_) => {
        const tex = new TextureObject(gl, {
          mode: gl.LINEAR,
          internalFormat: gl.RGBA8,
          format: gl.RGBA,
          type: gl.UNSIGNED_BYTE,
          ...canvasSize,
        });
        tex.update(new ImageData(canvasSize.width, canvasSize.height));
        return tex;
      });
      this.fb.draw.forEach((fb, i) => {
        fb.setSize(canvasSize);
        fb.attach(this.drawBuffers[i], 0);
        fb.bind();
        fb.checkStatus();
      });

      this.bloom.update({ resolution: canvasSize });
    }
  }

  // public setNumTypes(numTypes: number) {
  //   this.numTypes = numTypes;
  // }
}
