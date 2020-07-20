import { vec3, mat4 } from "gl-matrix";

import {
  TextureObject,
  Texture3DObject,
  UniformBuffer,
  FramebufferObject,
} from "../graphics";
import { PPSMode } from "./pps";

export const TEX_WIDTH = 1024;

export interface StateSize {
  width: number;
  height: number;
}

export class State {
  positions: TextureObject[];
  velocities: TextureObject[];
  orientations: TextureObject[];
  sortedPositions: TextureObject;
  countedPositions: Texture3DObject;

  palette: TextureObject;
  colors: TextureObject;

  frameBuffers: FramebufferObject[];
  uCameraMatrix: UniformBuffer;
  uColorThresholds: UniformBuffer;

  size: StateSize;

  private swap = 0;

  constructor(
    gl: WebGL2RenderingContext,
    size: StateSize,
    gridSize: number,
    computeEnabled: boolean,
    mode: PPSMode
  ) {
    this.size = size;

    // RGBA32I is required by compute shader
    this.positions = Array.from(Array(2)).map(
      (_) =>
        new TextureObject(gl, {
          mode: gl.NEAREST,
          internalFormat: gl.RGBA32I,
          format: gl.RGBA_INTEGER,
          type: gl.INT,
          immutable: computeEnabled,
          width: TEX_WIDTH,
          height: TEX_WIDTH,
        })
    );

    // RGBA32I is required (I'm guessing) because of alignment issues
    this.velocities = Array.from(Array(2)).map(
      (_) =>
        new TextureObject(gl, {
          mode: gl.NEAREST,
          internalFormat: gl.RGBA32I,
          format: gl.RGBA_INTEGER,
          type: gl.INT,
          immutable: computeEnabled,
          width: TEX_WIDTH,
          height: TEX_WIDTH,
        })
    );

    this.orientations = Array.from(Array(2)).map(
      (_) =>
        new TextureObject(gl, {
          mode: gl.NEAREST,
          internalFormat: gl.RGBA32I,
          format: gl.RGBA_INTEGER,
          type: gl.INT,
          immutable: computeEnabled,
          width: TEX_WIDTH,
          height: TEX_WIDTH,
        })
    );

    this.sortedPositions = new TextureObject(gl, {
      mode: gl.NEAREST,
      internalFormat: gl.RGBA32I,
      format: gl.RGBA_INTEGER,
      type: gl.INT,
      immutable: computeEnabled,
      width: TEX_WIDTH,
      height: TEX_WIDTH,
    });

    this.countedPositions = new Texture3DObject(gl, {
      mode: gl.NEAREST,
      internalFormat: gl.RGBA32I,
      format: gl.RGBA_INTEGER,
      type: gl.INT,
      immutable: computeEnabled,
      width: gridSize,
      height: gridSize,
      depth: mode === "3D" ? gridSize : 1,
    });

    this.palette = new TextureObject(gl, {
      mode: gl.LINEAR,
      internalFormat: gl.RGBA,
      format: gl.RGBA,
      type: gl.UNSIGNED_BYTE,
    });

    this.colors = new TextureObject(gl, {
      mode: gl.NEAREST,
      internalFormat: gl.R32I,
      format: gl.RED_INTEGER,
      type: gl.INT,
      immutable: computeEnabled,
      width: TEX_WIDTH,
      height: TEX_WIDTH,
    });

    this.uCameraMatrix = new UniformBuffer(gl, [
      mat4.create() as Float32Array,
      mat4.create() as Float32Array,
      mat4.create() as Float32Array,
    ]);

    this.frameBuffers = Array.from(Array(2)).map(
      (_) => new FramebufferObject(gl, size)
    );

    this.frameBuffers.forEach((fb, i) => {
      fb.attach(this.positions[i], 0);
      fb.attach(this.velocities[i], 1);
      fb.attach(this.orientations[i], 2);
      fb.attach(this.colors, 3);
      fb.bind();
      fb.checkStatus();
    });

    const tdata = new Float32Array(20);
    for (let i = 0; i < 16; i++) {
      tdata[i] = 1000 * (i + 1);
    }
    this.uColorThresholds = new UniformBuffer(gl, [tdata]);
  }

  public initState(
    stateSize: { width: number; height: number },
    gridSize: number,
    palette: number[],
    mode: PPSMode
  ) {
    const { width, height } = stateSize;
    const particles = width * height;

    const pbuf = new ArrayBuffer(particles * 4 * 4);
    const pstate = new Float32Array(pbuf);
    pstate.forEach((_, i, data) => {
      data[i] = 2 * Math.random() - 1;
      if (mode === "2D" && i % 4 === 2) data[i] = 0;
    });
    this.positions.forEach((p) => {
      p.updateData(width, height, new Int32Array(pbuf));
    });

    const vecSize = 4;

    const vbuf = new ArrayBuffer(particles * vecSize * 4);
    const vstate = new Float32Array(vbuf);
    vstate.forEach((_, i, data) => {
      if (i % vecSize === 0) {
        const v = vec3.fromValues(Math.random(), Math.random(), Math.random());
        if (mode === "2D") v[2] = 0;
        vec3.normalize(v, v);
        data.set(v, i);
      }
    });
    this.velocities.forEach((v) => {
      v.updateData(width, height, new Int32Array(vbuf));
    });

    const obuf = new ArrayBuffer(particles * vecSize * 4);
    const ostate = new Float32Array(obuf);
    ostate.forEach((_, i, data) => {
      if (i % vecSize === 0) {
        const ori = vec3.fromValues(0, 0, 1);

        if (mode === "3D") {
          const vel = vstate.slice(i, i + 3) as vec3;
          const u = vec3.fromValues(
            Math.random(),
            Math.random(),
            Math.random()
          );
          vec3.cross(ori, vel, u);
          vec3.normalize(ori, ori);
        }

        data.set(ori, i);
      }
    });
    this.orientations.forEach((o) => {
      o.updateData(width, height, new Int32Array(obuf));
    });

    let gcube = gridSize * gridSize;
    if (mode === "3D") gcube *= gridSize;
    const countData = new Int32Array(gcube * 4);
    for (let i = 0; i < countData.length; i++) {
      if (i % 4 === 0) countData[i] = particles / gcube;
      if (i % 4 === 1)
        countData[i] = ((Math.floor(i / 4) + 1) * particles) / gcube;
    }

    this.writeSortedPositions(
      {
        count: countData,
        // needs RBGA fmt for read and when computeEnabled
        output: new Int32Array(particles * 4),
      },
      stateSize,
      gridSize
    );

    const cbuf = new ArrayBuffer(particles * 4);
    const cdata = new Float32Array(cbuf);
    cdata.forEach((_, i, data) => (data[i] = 0.5));
    this.colors.updateData(width, height, new Int32Array(cbuf));

    const paldata = new ImageData(new Uint8ClampedArray(palette), 5, 1);
    this.palette.update(paldata);
  }

  public writeSortedPositions(
    sort: {
      count: Int32Array;
      output: Int32Array;
    },
    stateSize: { width: number; height: number },
    gridSize: number
  ) {
    const { width, height } = stateSize;
    const depth = this.countedPositions.cfg.depth || 1;
    this.countedPositions.updateData(gridSize, gridSize, depth, sort.count);
    this.sortedPositions.updateData(width, height, sort.output);
  }

  public swapBuffers() {
    this.swap = 1 - this.swap;
  }

  public getActive() {
    return {
      frameBuffer: this.frameBuffers[this.swap],
      positions: this.positions[this.swap],
      velocities: this.velocities[this.swap],
      orientations: this.orientations[this.swap],
    };
  }

  public getTarget() {
    return {
      frameBuffer: this.frameBuffers[1 - this.swap],
      positions: this.positions[1 - this.swap],
      velocities: this.velocities[1 - this.swap],
      orientations: this.orientations[1 - this.swap],
    };
  }
}
