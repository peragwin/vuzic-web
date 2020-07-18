import {
  Graphics,
  TextureObject,
  BufferConfig,
  VertexArrayObject,
  CanvasObject,
  FramebufferObject,
  UniformBuffer,
  Texture3DObject,
} from "../graphics";
import {
  drawVertShader,
  drawFragShader,
  updateVertShader,
  updateFragShader,
  PPSMode,
} from "./shaders";
import { getPalette, ParamsVersion } from "./params";
import { countingSort, CountingSorter } from "./countingsort";
import { GradientField, BorderSize } from "./gradientField";
import { Debug } from "../debug";
import { CountingSortComputer } from "./countingshader";
import { Camera } from "../util/camera";
import { vec3, mat4 } from "gl-matrix";
import { CameraController } from "../util/cameraController";
import { Drivers } from "../../audio/audio";

export const QUAD2 = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
const TEX_WIDTH = 1024;

export const defaultParams = {
  alpha: Math.PI,
  beta: (17.0 * Math.PI) / 180.0,
  alphaMix: (45.0 * Math.PI) / 180.0,
  betaMix: (45.0 * Math.PI) / 180.0,
  radius: 0.05,
  velocity: 0.0067,
  radialDecay: 0,
  size: 4,
  particleDensity: 1,
  particles: +(process.env.REACT_APP_INIT_PARTICLES || "8192"),
  palette: "default",
  borderSize: { radius: 1, sharpness: 2, intensity: 1 },
  colorScale: 1,
  groupWeight: 0,
  autoRotate: { x: 0, y: 0 },
  version: "v0.3" as ParamsVersion,
};

export type RenderParams = {
  alpha: number;
  beta: number;
  alphaMix: number;
  betaMix: number;
  radius: number;
  velocity: number;
  size: number;
  particleDensity: number;
  radialDecay: number;
  particles: number;
  palette: string;
  borderSize: BorderSize;
  colorScale: number;
  groupWeight: number;
  autoRotate: { x: number; y: number };
  version: ParamsVersion;
};

interface ColorParams {
  palette: number[];
  thresholds: number[];
}

class Textures {
  positions: TextureObject[];
  velocities: TextureObject[];
  orientations: TextureObject[];
  sortedPositions: TextureObject;
  countedPositions: Texture3DObject;

  palette: TextureObject;
  colors: TextureObject;

  constructor(
    gl: WebGL2RenderingContext,
    gridSize: number,
    computeEnabled: boolean,
    mode: PPSMode
  ) {
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
}

export class PPS {
  private gl: WebGL2RenderingContext | WebGL2ComputeRenderingContext;
  private computeEnabled = false;

  private particleVAO!: VertexArrayObject;
  private textures!: Textures;
  private renderGfx!: Graphics;
  private updateGfx!: Graphics;
  private computeShader: CountingSortComputer | null = null;
  private gradientField: GradientField;

  private debug: Debug;

  private swap: number = 1;
  private frameBuffers!: FramebufferObject[];

  private stateSize!: { width: number; height: number };
  private gridSize: number;
  private loopHandle!: number;
  private frameCount = 0;
  public paused = false;

  private countingSort: CountingSorter;
  private params: RenderParams;
  private colors!: ColorParams;

  constructor(
    private canvas: HTMLCanvasElement,
    private onRender: (pps: PPS) => void,
    private readonly mode: PPSMode = "2D"
  ) {
    this.gridSize = mode === "2D" ? 64 : 16;
    this.countingSort = countingSort(this.gridSize, 4, mode);

    const cgl = canvas.getContext("webgl2-compute", {
      preserveDrawingBuffer: true,
    });
    if (!cgl) {
      console.info("webgl2-compute is not supported");
      const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
      if (!gl) throw new Error("webgl2 is required");
      this.gl = gl;
    } else {
      console.info("webgl2-compute is supported");
      this.computeEnabled = true;
      this.gl = cgl;

      console.log(
        "max WG invoc=" +
          // @ts-ignore
          cgl.getParameter(cgl.MAX_COMPUTE_WORK_GROUP_INVOCATIONS) +
          " size=" +
          // @ts-ignore
          cgl.getIndexedParameter(cgl.MAX_COMPUTE_WORK_GROUP_SIZE, 0)
      );
      // @ts-ignore
      var mem = cgl.getParameter(cgl.MAX_COMPUTE_SHARED_MEMORY_SIZE);
      console.log("Shared mem=" + mem);
      if (mem < 32000) {
        alert("no shared memory");
      }
    }

    this.params = { ...defaultParams };
    this.stateSize = this.getStateSize();

    this.gradientField = new GradientField(this.gl, this.mode);
    this.textures = new Textures(
      this.gl,
      this.gridSize,
      this.computeEnabled,
      this.mode
    );
    this.initState();
    this.initRender();
    this.initUpdate();
    this.initCompute();

    this.debug = new Debug(
      canvas,
      this.gradientField.fieldValue(),
      this.gradientField.gradientField(),
      this.gradientField.getVirtualSize(),
      this.mode
    );

    this.loop();
  }

  private camera!: Camera;
  private cameraController!: CameraController;
  private uCameraMatrix!: UniformBuffer;

  private initRender() {
    const gl = this.gl;
    const particles = this.params.particles;

    const canvas = new CanvasObject(gl, ({ width, height }) => {
      // if (this.mode === "3D") this.cameraController.setAspect(width / height);
    });
    const shaderConfigs = [drawFragShader(gl), drawVertShader(gl)];
    const gfx = new Graphics(gl, canvas, shaderConfigs, this.render.bind(this));
    this.renderGfx = gfx;

    this.camera = new Camera((45 * Math.PI) / 180, 1, -1, 1);
    const initRadius = 3.5;
    this.camera.orientation = vec3.fromValues(0, 1, 0);
    this.camera.location = vec3.fromValues(0, 0, initRadius);
    this.camera.target = vec3.fromValues(0, 0, 0);
    const cameraMatrix =
      this.mode === "3D" ? this.camera.matrix : mat4.create();
    this.uCameraMatrix = new UniformBuffer(gl, new Float32Array(cameraMatrix));
    this.cameraController = new CameraController(
      this.camera,
      this.canvas,
      this.mode === "3D",
      initRadius
    );

    this.textures.positions.map((p) => gfx.attachTexture(p, "texPositions"));

    gfx.attachUniform(
      "uStateSize",
      (loc, value: { width: number; height: number }) => {
        gl.uniform2i(loc, value.width, value.height);
      }
    );
    gfx.attachUniform("uPointSize", (l, v) => gl.uniform1f(l, v));
    gfx.attachUniform("uAlpha", gl.uniform1f.bind(gl));
    gfx.attachUniformBlock("uCameraMatrix", 0);

    this.textures.positions.forEach((p) =>
      gfx.attachTexture(p, "texPositions")
    );
    gfx.attachTexture(this.textures.colors, "texColors");
    gfx.attachTexture(this.textures.palette, "texPalette");

    const updateCamera = (mat: mat4) =>
      this.uCameraMatrix.update(new Float32Array(mat));

    this.particleVAO = new VertexArrayObject(
      null,
      0,
      particles,
      gl.POINTS,
      (gfx: Graphics) => {
        gfx.bindUniform("uStateSize", this.stateSize);
        gfx.bindUniform("uPointSize", this.params.size);
        gfx.bindUniform("uAlpha", this.params.particleDensity);
        if (this.mode === "3D") this.cameraController.update(updateCamera);
        gfx.bindUniformBuffer("uCameraMatrix", this.uCameraMatrix);
        gfx.bindTexture(this.textures.positions[this.swap], 0);
        gfx.bindTexture(this.textures.colors, 1);
        gfx.bindTexture(this.textures.palette, 2);
        return true;
      }
    );
    gfx.addVertexArrayObject(this.particleVAO);
  }

  private uColorThresholds!: UniformBuffer;

  private initUpdate() {
    const gl = this.gl;

    this.frameBuffers = Array.from(Array(2)).map(
      (_) => new FramebufferObject(gl, this.stateSize)
    );
    const tdata = new Float32Array(20);
    for (let i = 0; i < 16; i++) {
      tdata[i] = 1000 * (i + 1);
    }
    this.uColorThresholds = new UniformBuffer(gl, tdata);

    const gfx = new Graphics(
      gl,
      this.frameBuffers[0],
      [updateVertShader(gl), updateFragShader(gl, this.mode)],
      this.update.bind(this)
    );
    this.updateGfx = gfx;

    gfx.attachUniform(
      "uStateSize",
      (loc, value: { width: number; height: number }) =>
        gl.uniform2i(loc, value.width, value.height)
    );
    gfx.attachUniform("uGridSize", (l, v) => gl.uniform1i(l, v));
    gfx.attachUniform("uAlpha", (l, v) => gl.uniform2f(l, v[0], v[1]));
    gfx.attachUniform("uBeta", (l, v) => gl.uniform2f(l, v[0], v[1]));
    gfx.attachUniform("uRadius", (l, v) => gl.uniform1f(l, v));
    gfx.attachUniform("uVelocity", (l, v) => gl.uniform1f(l, v));
    gfx.attachUniform("uRadialDecay", (l, v) => gl.uniform1f(l, v));
    gfx.attachUniform("uColorScale", (l, v) => gl.uniform1f(l, v));
    gfx.attachUniform("uGroupWeight", (l, v) => gl.uniform1f(l, v));
    gfx.attachUniform("uGradientFieldSize", (l, v) =>
      gl.uniform2f(l, v[0], v[1])
    );
    gfx.attachUniformBlock("uColorThresholdBlock", 0);

    this.textures.positions.forEach((p) =>
      gfx.attachTexture(p, "texPositions")
    );
    this.textures.velocities.forEach((p) =>
      gfx.attachTexture(p, "texVelocities")
    );
    if (this.mode === "3D") {
      this.textures.orientations.forEach((p) =>
        gfx.attachTexture(p, "texOrientations")
      );
    }
    gfx.attachTexture(this.textures.sortedPositions, "texSortedPositions");
    gfx.attachTexture(this.textures.countedPositions, "texCountedPositions");
    gfx.attachTexture(this.gradientField.gradientField(), "texGradientField");

    this.frameBuffers.forEach((fb, i) => {
      fb.attach(this.textures.positions[i], 0);
      fb.attach(this.textures.velocities[i], 1);
      fb.attach(this.textures.orientations[i], 2);
      fb.attach(this.textures.colors, 3);
      fb.bind();
      fb.checkStatus();
    });

    const buf = gfx.newBufferObject(
      new BufferConfig(
        QUAD2,
        [{ name: "quad", size: 2, offset: 0 }],
        () => true
      )
    );
    gfx.addVertexArrayObject(
      new VertexArrayObject(
        buf,
        0,
        QUAD2.length / 2,
        gl.TRIANGLE_STRIP,
        (gfx) => {
          gfx.bindUniform("uStateSize", this.stateSize);
          gfx.bindUniform("uGridSize", this.gridSize);
          gfx.bindUniform("uAlpha", [this.params.alpha, this.params.alphaMix]);
          gfx.bindUniform("uBeta", [this.params.beta, this.params.betaMix]);
          gfx.bindUniform("uRadius", this.params.radius);
          gfx.bindUniform("uVelocity", this.params.velocity);
          gfx.bindUniform("uRadialDecay", this.params.radialDecay);
          gfx.bindUniform("uColorScale", this.params.colorScale);
          gfx.bindUniform("uGroupWeight", this.params.groupWeight);
          gfx.bindUniform(
            "uGradientFieldSize",
            this.gradientField.getVirtualSize()
          );
          gfx.bindUniformBuffer("uColorThresholdBlock", this.uColorThresholds);
          let s = 1 - this.swap;
          gfx.bindTexture(this.textures.positions[s], 0);
          gfx.bindTexture(this.textures.velocities[s], 1);
          if (this.mode === "3D")
            gfx.bindTexture(this.textures.orientations[s], 2);
          gfx.bindTexture(this.textures.sortedPositions, 3);
          gfx.bindTexture(this.textures.countedPositions, 4);
          gfx.bindTexture(this.gradientField.gradientField(), 5);
          return true;
        }
      )
    );
  }

  private initCompute() {
    if (!this.computeEnabled) return;

    this.computeShader = new CountingSortComputer(
      this.gl as WebGL2ComputeRenderingContext,
      {
        position: this.textures.positions[this.swap],
        sortedPosition: this.textures.sortedPositions,
        positionCount: this.textures.countedPositions,
      },
      {
        radius: this.params.radius,
        buffer: this.uColorThresholds.buffer,
      },
      this.stateSize,
      this.gridSize,
      this.mode
    );
  }

  private initState() {
    let palette = (this.params.palette as any) as number[];
    if (typeof palette === "string") {
      const p = getPalette(this.params.palette);
      if (!p) {
        throw new Error(
          `invalid palette in config: ${JSON.stringify(this.params)}`
        );
      }
      palette = p;
    }
    this.colors = {
      palette,
      thresholds: [10, 15, 30, 50],
    };

    this.textures.initState(this.stateSize, this.gridSize, palette, this.mode);
  }

  private render(g: Graphics) {
    const gl = g.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.DST_ALPHA);
  }

  private update(g: Graphics) {
    const gl = g.gl;
    gl.disable(gl.BLEND);

    const tgt = 1 - this.swap;
    this.swap = tgt;

    this.updateGfx.swapTarget(this.frameBuffers[tgt]);

    this.frameBuffers[tgt].attach(this.textures.positions[tgt], 0);
    this.frameBuffers[tgt].attach(this.textures.velocities[tgt], 1);
    this.frameBuffers[tgt].attach(this.textures.orientations[tgt], 2);
    this.frameBuffers[tgt].attach(this.textures.colors, 3);
  }

  private calculateSortedPositions(src: number) {
    if (this.computeEnabled) {
      const cs = this.computeShader!;
      cs.update(
        this.stateSize,
        {
          position: this.textures.positions[src],
          sortedPosition: this.textures.sortedPositions,
          positionCount: this.textures.countedPositions,
        },
        {
          radius: this.params.radius,
          buffer: this.uColorThresholds.buffer,
        }
      );

      cs.compute();
      const gl = this.gl as WebGL2ComputeRenderingContext;
      gl.memoryBarrier(
        gl.SHADER_STORAGE_BARRIER_BIT |
          gl.SHADER_IMAGE_ACCESS_BARRIER_BIT |
          gl.TEXTURE_UPDATE_BARRIER_BIT |
          gl.TEXTURE_FETCH_BARRIER_BIT
      );

      return;
    }

    const gl = this.gl;
    const particles = this.stateSize.width * this.stateSize.height;

    // attach the src position texture to the buffer so we can read it
    this.frameBuffers[src].attach(this.textures.positions[src], 0);
    this.frameBuffers[src].bind();

    const pbuf = new ArrayBuffer(particles * 4 * 4);
    const pdata = new Float32Array(pbuf);
    const idata = new Int32Array(pbuf);
    this.frameBuffers[src].readData(idata, 0, gl.RGBA_INTEGER, gl.INT);

    const sort = this.countingSort(pdata);
    const output = new Int32Array(sort.output.buffer);
    this.textures.writeSortedPositions(
      { ...sort, output },
      this.stateSize,
      this.gridSize
    );

    if (this.frameCount % 4 === 0) {
      this.updateColorThresholds(sort.count);
    }

    // if (this.frameCount % 640 === 0) {
    //   console.log(sort);
    // }
  }

  private lastTime: number = 0;

  private loop() {
    // if (this.frameCount++ < 60) {
    this.loopHandle = requestAnimationFrame(this.loop.bind(this));
    // }
    const now = performance.now();

    this.cameraController.increment(this.rotateIncrement(now - this.lastTime));

    this.onRender(this);

    this.gradientField.update(true);

    this.calculateSortedPositions(this.swap);

    this.updateGfx.render(false);
    this.renderGfx.render(false);

    // this.debug.render();

    this.frameCount = (this.frameCount + 1) & 0xffff;
    this.lastTime = now;
  }

  public stop() {
    cancelAnimationFrame(this.loopHandle);
  }

  private getStateSize = () => ({
    width: Math.min(this.params.particles, TEX_WIDTH),
    height: Math.ceil(this.params.particles / TEX_WIDTH),
  });

  public setParams(params: RenderParams) {
    if (params === this.params) return;

    this.gradientField.setParams(params);

    if (this.params.particles !== params.particles) {
      this.stop();
      this.params = params;

      this.stateSize = this.getStateSize();
      this.textures = new Textures(
        this.gl,
        this.gridSize,
        this.computeEnabled,
        this.mode
      );
      this.initState();
      this.initRender();
      this.initUpdate();
      this.initCompute();

      this.loop();
    } else {
      this.params = params;
    }
  }

  async updateColorThresholds(count: Int32Array) {
    const [mean, std] = getCountStatistics(count, this.gridSize);
    const cellsInRadius = Math.ceil(this.params.radius * this.gridSize);
    const thresholds = getColorThresholds(mean, std, cellsInRadius);
    this.uColorThresholds.update(new Float32Array(thresholds));
  }

  public getFrameRate(interval: number) {
    const fc = this.frameCount;
    this.frameCount = 0;
    return Math.trunc((fc / interval) * 1000);
  }

  private rotateIncrement(time: number) {
    const { x, y } = this.params.autoRotate;
    return { x: (x * time) / 32, y: (y * time) / 32 };
  }

  public setAudioDrivers(drivers: Drivers) {
    return;
  }
}

function getCountStatistics(countData: Int32Array, gridSize: number) {
  let sum = 0;
  for (let i = 0; i < countData.length; i += 4) {
    const c = countData[i];
    sum += c;
  }

  const mean = (sum / countData.length) * 4;

  sum = 0;
  for (let i = 0; i < countData.length; i += 4) {
    let dev = countData[i] - mean;
    sum += dev * dev;
  }

  const std = Math.sqrt((sum / countData.length) * 4);

  return [mean, std];
}

function getColorThresholds(mean: number, std: number, cellsInRadius: number) {
  const c3 = cellsInRadius * cellsInRadius * cellsInRadius;
  const particlesInRadius = mean * c3;
  const dev = std * c3;

  let thresholds = [];
  for (let i = 0; i < 5; i++) {
    const d = ((-1.0 + i) * dev) / 4;
    thresholds.push(d + particlesInRadius);
  }

  const t0 = thresholds[0];
  if (t0 < 0) {
    thresholds = thresholds.map((x) => x - t0);
  }

  return thresholds;
}
