import { Pane } from "tweakpane";
import * as TweakpaneEssentialsPlugin from "@tweakpane/plugin-essentials";

import { AudioProcessor } from "../../audio/audio";
import { CanvasObject } from "../graphics";
import { RenderParams, RenderPipeline } from "./render";
import { setUrlParam } from "../../hooks/routeSettings";

export class ParticleLifeController {
  private pane: Pane;
  public params: RenderParams = {
    numParticles: 1024,
    numTypes: 16,
    friction: 0.13,
    fade: 0.99,
    sharpness: 0.25,
    pointSize: 10.0,
    coefficients: {
      particleInit: {
        sigma: 0.05,
        mean: 0.0,
        minRadius: { min: 1.0, max: 6.0 },
        maxRadius: { min: 6.0, max: 24.0 },
      },
      audio: {
        colorEffect: { x: 0.38, y: 0.09 },
        motionEffect: 0.1,
      },
      color: {
        spread: 16.0,
        lightness: 0.5,
        cycleRate: 10,
        baseHue: 0,
      },
    },
    bloom: {
      bloom: 0.8,
      bloomSharpness: 0.98,
    },
  };
  public fps: number = 0.0;
  public reseed = false;

  constructor() {
    const container = document.getElementById("tweakpane-container");
    if (!container) throw new Error("no settings container");

    const pane = new Pane({
      container,
      title: "Visualizer Settings",
    });
    pane.registerPlugin(TweakpaneEssentialsPlugin);
    this.pane = pane;
    pane.hidden = true;

    const sim = pane.addFolder({ title: "Simulation" });

    sim.addInput(this.params, "numParticles", { format: (v) => v.toFixed(0) });
    sim.addInput(this.params, "numTypes", { format: (v) => v.toFixed(0) });
    sim.addInput(this.params, "friction", {
      min: 0.0,
      max: 1.0,
      step: 0.001,
    });
    sim.addInput(this.params.coefficients.particleInit, "sigma", {
      min: 0.0,
      max: 0.1,
      step: 0.001,
    });
    sim.addInput(this.params.coefficients.particleInit, "mean", {
      min: -0.1,
      max: 0.1,
      step: 0.001,
    });
    sim.addInput(this.params.coefficients.particleInit, "minRadius", {
      min: 0,
      max: 20,
      step: 0.01,
    });
    sim.addInput(this.params.coefficients.particleInit, "maxRadius", {
      min: 0,
      max: 50,
      step: 0.01,
    });
    sim.addButton({ title: "reseed", label: "reseed" }).on("click", (ev) => {
      this.reseed = true;
    });

    const audio = pane.addFolder({ title: "Audio" });
    audio.addInput(this.params.coefficients.audio, "motionEffect", {
      min: 0,
      max: 0.2,
      step: 0.001,
    });
    audio.addInput(this.params.coefficients.audio, "colorEffect", {
      x: { min: 0, max: 0.5 },
      y: { min: 0, max: 0.5, inverted: true },
    });

    const color = pane.addFolder({ title: "Color" });
    color.addInput(this.params.coefficients.color, "lightness", {
      min: 0.0,
      max: 1.0,
      step: 0.01,
    });
    color.addInput(this.params.coefficients.color, "spread", {
      min: 0.0,
      max: 120,
      step: 1,
    });
    color.addInput(this.params.coefficients.color, "baseHue", {
      min: 0,
      max: 360,
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
      step: 0.001,
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
      max: 3.0,
      step: 0.01,
    });

    pane.addMonitor(this, "fps");

    pane.addButton({ title: "close" }).on("click", (_) => {
      pane.hidden = true;
    });

    pane.on("change", (ev) => setUrlParam("params", pane.exportPreset()));

    // giving up for now.. this should be on the canvas actually..
    // const clickAwayArea = document.getElementById("tweakpane-click-away");
    // if (clickAwayArea) {
    //   console.log(clickAwayArea);
    //   clickAwayArea.addEventListener("click", (ev) => {
    //     if (
    //       !this.pane.hidden &&
    //       ev.target &&
    //       !container.contains(ev.target as Node)
    //     ) {
    //       this.pane.hidden = true;
    //     }
    //   });
    // }
    document.addEventListener("keyup", (ev) => {
      ev.preventDefault();
      if (ev.key.toLowerCase() === "s") {
        this.pane.hidden = !this.pane.hidden;
      }
      if (ev.key === "Enter" && ev.shiftKey) {
        this.reseed = true;
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
    return [this.pane.exportPreset()];
  }
  public update(action: { type: "all" | "load"; value: any }) {
    if (action.value) {
      const { numParticles, numTypes } = this.params;
      this.pane.importPreset(action.value);
      if (
        this.params.numParticles !== numParticles ||
        this.params.numTypes !== numTypes
      ) {
        this.reseed = true;
      }
      setUrlParam("params", action.value);
    }
  }

  public export() {
    return [this.pane.exportPreset()];
  }
  public exportPreset() {
    return this.pane.exportPreset();
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
    const numParticles = controller.params.numParticles;
    const numTypes = controller.params.numTypes;
    const canvasSize = { width: canvas.width, height: canvas.height };
    // do this before initializing the pipeline which calculates matricies
    // based on audio size
    audio.resize(numTypes);

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
    audio.start(() => {});
  }

  public loop(repeat = true) {
    if (repeat) {
      this.loopHandle = requestAnimationFrame(this.loop.bind(this, true));
    }

    if (this.controller.reseed) {
      this.controller.reseed = false;
      this.pipeline.reseed(this.controller.params);
    }

    this.pipeline.render({ ...this.controller.params }, this.canvasTarget);

    this.frameCount++;
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
