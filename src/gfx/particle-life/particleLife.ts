import { Pane } from "tweakpane";

import { AudioProcessor } from "../../audio/audio";
import { CanvasObject } from "../graphics";
import { RenderParams, RenderPipeline } from "./render";

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
      minRadius: { x: 1.0, y: 10.0 },
      maxRadius: { x: 10.0, y: 25.0 },
    },
    bloom: {
      bloom: 1.8,
      bloomSharpness: 1.0,
    },
  };
  public fps: number = 0.0;

  public show() {
    if (!this.pane) {
      const pane = new Pane({
        container: document.getElementById("tweakpane-container") || undefined,
      });
      this.pane = pane;

      pane.addInput(this.params, "numParticles");
      pane.addInput(this.params, "numTypes");
      pane.addInput(this.params, "friction", {
        min: 0.0,
        max: 1.0,
        step: 0.001,
      });

      const particleShape = pane.addFolder({ title: "Particle Shape" });
      particleShape.addInput(this.params, "pointSize", {
        label: "size",
        min: 0.0,
        max: 10.0,
        step: 0.1,
      });
      particleShape.addInput(this.params, "sharpness", {
        min: 0.0,
        max: 1.0,
        step: 0.01,
      });
      particleShape.addInput(this.params, "fade", {
        min: 0.0,
        max: 1.0,
        step: 0.01,
      });

      const bloom = pane.addFolder({ title: "Bloom" });
      bloom.addInput(this.params.bloom, "bloom", {
        min: 0.0,
        max: 10.0,
        step: 0.1,
      });
      bloom.addInput(this.params.bloom, "bloomSharpness", {
        label: "sharpness",
        min: 0.0,
        max: 2.0,
        step: 0.01,
      });

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
      controller.params
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
