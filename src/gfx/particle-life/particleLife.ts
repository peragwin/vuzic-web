import { Pane } from "tweakpane";

import { AudioProcessor } from "../../audio/audio";
import { CanvasObject } from "../graphics";
import { RenderParams, RenderPipeline } from "./render";

export class ParticleLifeController {
  private pane: Pane;
  public params: RenderParams = {
    numParticles: 1024,
    numTypes: 16,
    friction: 0.15,
    fade: 0.9,
    sharpness: 0.75,
    pointSize: 4.0,
    coefficients: {
      particleInit: {
        sigma: 0.05,
        mean: 0.0,
        minRadius: { min: 1.0, max: 6.0 },
        maxRadius: { min: 6.0, max: 24.0 },
      },
      audio: {
        colorEffect: { x: 0.35, y: 0.3 },
        motionEffect: 0.2,
      },
      color: {
        spread: 8.0,
        lightness: 0.5,
        cycleRate: 1,
      },
    },
    bloom: {
      bloom: 2.0,
      bloomSharpness: 1.65,
    },
  };
  public fps: number = 0.0;

  constructor() {
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

    const audio = pane.addFolder({ title: "Audio" });
    audio.addInput(this.params.coefficients.audio, "motionEffect", {
      min: 0,
      max: 1.0,
      step: 0.01,
    });
    audio.addInput(this.params.coefficients.audio, "colorEffect", {
      x: { min: 0, max: 1.0 },
      y: { min: 0, max: 1.0, inverted: true },
    });

    const color = pane.addFolder({ title: "Color" });
    color.addInput(this.params.coefficients.color, "lightness", {
      min: 0.0,
      max: 1.0,
      step: 0.01,
    });
    color.addInput(this.params.coefficients.color, "spread", {
      min: 0.0,
      max: 45,
      step: 1,
    });
    color.addInput(this.params.coefficients.color, "cycleRate", {
      min: 0,
      max: 100,
      step: 1,
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

    document.addEventListener("keyup", (ev) => {
      ev.preventDefault();
      if (ev.key.toLowerCase() === "s") {
        this.pane.hidden = !this.pane.hidden;
      }
    });
  }

  public show() {
    this.pane.hidden = false;
  }

  public hide() {
    this.pane.hidden = true;
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
    audio.start(() => {});

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
