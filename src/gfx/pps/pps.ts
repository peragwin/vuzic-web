import { getPalette, ParamsVersion } from "./params";
import { CountingSort } from "./countingsort";
import { GradientField, BorderSize } from "./gradientField";
import { Debug } from "../debug";
import { Camera } from "../util/camera";
import { CameraController } from "../util/cameraController";
import { Drivers } from "../../audio/audio";
import { XRRenderTarget, RenderView } from "../xr/renderer";
import { Draw } from "./draw";
import { State, StateSize } from "./state";
import { Update } from "./update";

export type PPSMode = "2D" | "3D";

export type WebGL2Context =
  | WebGL2RenderingContext
  | WebGL2ComputeRenderingContext;

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
  borderSize: { radius: 0.1, sharpness: 2, intensity: 0 },
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

export class PPS {
  public readonly gl: WebGL2Context;

  public params: RenderParams;
  public state: State;

  public paused = false;

  private draw: Draw;
  private update: Update;
  private gradientField: GradientField;
  private countingSort: CountingSort;
  private debug: Debug;

  private stateSize_: StateSize;
  private gridSize: number;
  private colors: ColorParams;

  private loopHandle: number;
  private computeEnabled = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private onRender: (pps: PPS) => void,
    public readonly mode: PPSMode = "2D"
  ) {
    this.gridSize = mode === "2D" ? 64 : 16;

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
    this.stateSize_ = this.getStateSize();

    const palette = resolvePaletteParam(this.params.palette);
    this.colors = {
      palette,
      thresholds: [10, 15, 30, 50],
    };

    this.state = new State(
      this.gl,
      this.stateSize_,
      this.gridSize,
      this.computeEnabled,
      this.mode
    );
    this.state.initState(this.stateSize, this.gridSize, palette, this.mode);

    this.countingSort = new CountingSort(
      this.computeEnabled,
      this,
      mode,
      this.gridSize
    );
    this.gradientField = new GradientField(this.gl, this.mode);
    this.draw = new Draw(this.gl, this, canvas);
    this.update = new Update(
      this.gl,
      this,
      this.gradientField,
      this.gridSize,
      this.mode
    );

    this.initXR();

    this.debug = new Debug(
      canvas,
      this.gradientField.fieldValue(),
      this.gradientField.gradientField(),
      this.gradientField.getVirtualSize(),
      this.mode
    );

    this.loopHandle = requestAnimationFrame(this.loop.bind(this, true));
  }

  public get stateSize() {
    return this.stateSize_;
  }

  private xrCamera!: Camera;
  private xrCameraController!: CameraController;

  private initXR() {
    this.xrCamera = new Camera(Math.PI, 1, -1, 1);
    this.xrCameraController = new CameraController(
      this.xrCamera,
      this.canvas,
      true,
      0
    );
  }

  private frameCount = 0;
  private lastTime: number = 0;

  public loop(repeat = true) {
    // if (this.frameCount++ < 60) {
    if (repeat) {
      this.loopHandle = requestAnimationFrame(this.loop.bind(this, true));
    }

    this.onRender(this);

    const now = performance.now();

    this.gradientField.update(true);

    this.countingSort.calculateSortedPositions();

    this.update.render();

    const rot = this.rotateIncrement(now - this.lastTime);
    this.draw.cameraController.rotateView(rot.x, rot.y);
    this.draw.render();
    if (this.xrRenderTarget) {
      this.draw.render(this.xrRenderTarget);
    }

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

      this.stateSize_ = this.getStateSize();
      this.state = new State(
        this.gl,
        this.stateSize_,
        this.gridSize,
        this.computeEnabled,
        this.mode
      );
      this.state.initState(
        this.stateSize,
        this.gridSize,
        this.colors.palette,
        this.mode
      );

      this.draw.init();
      this.update.init();
      this.countingSort.init();

      this.loop();
    } else {
      this.params = params;
    }
  }

  public updateAudioDrivers(drivers: Drivers) {}

  public getFrameRate(interval: number) {
    const fc = this.frameCount;
    this.frameCount = 0;
    return Math.trunc((fc / interval) * 1000);
  }

  private rotateIncrement(time: number) {
    const { x, y } = this.params.autoRotate;
    time *= 16;
    return { x: x * time, y: y * time };
  }

  public setAudioDrivers(drivers: Drivers) {
    return;
  }

  private xrRenderTarget?: XRRenderTarget;

  public onEnterXR(refSpace: XRReferenceSpace) {
    this.stop();
    const updateView = (view: RenderView) => {
      this.xrCameraController.update();
      this.state.uCameraMatrix.update([
        this.xrCamera.matrix as Float32Array,
        view.transform.matrix,
        view.projection as Float32Array,
      ]);
    };
    this.xrCameraController.initReferenceSpace(refSpace);
    this.xrRenderTarget = new XRRenderTarget(this.gl, refSpace, updateView);
  }

  public drawXRFrame(t: number, frame: XRFrame) {
    if (!this.xrRenderTarget) return;
    this.xrRenderTarget.updateReferenceSpace(
      this.xrCameraController.referenceSpace
    );
    this.xrRenderTarget.onXRFrame(t, frame);
    // this.draw.render(this.xrRenderTarget);
    this.loop(false);
  }
}

function resolvePaletteParam(palette: any) {
  if (typeof palette === "string") {
    const p = getPalette(palette);
    if (!p) {
      throw new Error(`invalid palette in config: ${palette}`);
    }
    palette = p;
  }
  return palette as number[];
}
