import { TextureObject } from "../textures";
import { Dims } from "../types";
import { random_normal } from "./coefficients";

export const TEX_WIDTH = 1024;
export const MAX_PARTICLE_NUM = TEX_WIDTH * TEX_WIDTH;
export const MAX_PARTICLE_TYPES = 128;

export class State {
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
    const stateSize = State.getStateSize(numParticles);
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
          immutable: true,
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
          immutable: true,
        })
    );

    this.types = new TextureObject(gl, {
      mode: gl.NEAREST,
      internalFormat: gl.R32I,
      format: gl.RED_INTEGER,
      type: gl.INT,
      width: TEX_WIDTH,
      height: TEX_WIDTH,
      immutable: true,
    });

    // This is also a float value represented as int.
    // It's rendered to in the AudioUpdate pass.
    this.interactionMatrix = new TextureObject(gl, {
      mode: gl.NEAREST,
      internalFormat: gl.RGB32F,
      format: gl.RGB,
      type: gl.FLOAT,
      width: MAX_PARTICLE_TYPES,
      height: MAX_PARTICLE_TYPES,
      immutable: true,
    });

    this.colors = new TextureObject(gl, {
      mode: gl.NEAREST,
      internalFormat: gl.RGB8,
      format: gl.RGB,
      type: gl.UNSIGNED_BYTE,
      width: MAX_PARTICLE_TYPES,
      height: 1,
      immutable: true,
    });
    this.colors.updateData(
      MAX_PARTICLE_TYPES,
      1,
      new Uint8ClampedArray(MAX_PARTICLE_TYPES * 3).map((_) => 255)
    );

    this.randomizeParticleTypes();
    this.randomizeParticleState();
  }

  public resize(numParticles: number, numTypes: number) {
    const [changedParticles, changedTypes] = [
      numParticles !== this.numParticles,
      numTypes !== this.numTypes,
    ];
    if (changedParticles) {
      this.numParticles = numParticles;
      const stateSize = State.getStateSize(numParticles);
      this.stateSize = stateSize;
    }
    if (changedTypes) {
      this.numTypes = numTypes;
    }
    return [changedParticles, changedTypes];
  }

  public randomizeParticleTypes() {
    const numParticles = Math.ceil(this.numParticles / TEX_WIDTH) * TEX_WIDTH;

    const types = new Int32Array(
      Array.from(Array(numParticles)).map((_) =>
        Math.floor(this.numTypes * Math.random())
      )
    );
    this.types.updateData(
      Math.min(numParticles, TEX_WIDTH),
      numParticles / TEX_WIDTH,
      types
    );
  }

  public randomizeParticleState() {
    const numParticles = Math.ceil(this.numParticles / TEX_WIDTH) * TEX_WIDTH;
    const positions = new Float32Array(
      Array.from(Array(numParticles))
        .map((_) => [Math.random(), Math.random(), 0.0, 0.0])
        .flat()
    );
    const velocities = new Float32Array(
      Array.from(Array(numParticles))
        .map((_) => [
          random_normal() * 0.001,
          random_normal() * 0.001,
          0.0,
          0.0,
        ])
        .flat()
    );
    this.positions.forEach((p) =>
      p.updateData(
        Math.min(numParticles, TEX_WIDTH),
        numParticles / TEX_WIDTH,
        new Int32Array(positions.buffer)
      )
    );
    this.velocities.forEach((p) =>
      p.updateData(
        Math.min(numParticles, TEX_WIDTH),
        numParticles / TEX_WIDTH,
        new Int32Array(velocities.buffer)
      )
    );
  }

  private static getStateSize = (numParticles: number): Dims => ({
    width: Math.max(numParticles, TEX_WIDTH),
    height: Math.ceil(numParticles / TEX_WIDTH),
  });
}
