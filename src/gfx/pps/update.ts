import { Graphics, VertexArrayObject, BufferConfig } from "../graphics";
import { updateVertShader, updateFragShader } from "./shaders";
import { GradientField } from "./gradientField";
import { WebGL2Context, PPS, PPSMode } from "./pps";

export const QUAD2 = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

export class Update {
  private gfx: Graphics;

  constructor(
    gl: WebGL2Context,
    private pps: PPS,
    gradientField: GradientField,
    gridSize: number,
    mode: PPSMode
  ) {
    const gfx = new Graphics(
      gl,
      pps.state.frameBuffers[0],
      [updateVertShader(gl), updateFragShader(gl, pps.mode)],
      () => {
        gl.disable(gl.BLEND);

        const {
          frameBuffer,
          positions,
          velocities,
          orientations,
        } = pps.state.getTarget();

        frameBuffer.attach(positions, 0);
        frameBuffer.attach(velocities, 1);
        frameBuffer.attach(orientations, 2);
        frameBuffer.attach(pps.state.colors, 3);
      }
    );
    this.gfx = gfx;

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

    gfx.attachTexture(gradientField.gradientField(), "texGradientField");

    this.init();

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
          gfx.bindUniform("uStateSize", pps.stateSize);
          gfx.bindUniform("uGridSize", gridSize);
          gfx.bindUniform("uAlpha", [pps.params.alpha, pps.params.alphaMix]);
          gfx.bindUniform("uBeta", [pps.params.beta, pps.params.betaMix]);
          gfx.bindUniform("uRadius", pps.params.radius);
          gfx.bindUniform("uVelocity", pps.params.velocity);
          gfx.bindUniform("uRadialDecay", pps.params.radialDecay);
          gfx.bindUniform("uColorScale", pps.params.colorScale);
          gfx.bindUniform("uGroupWeight", pps.params.groupWeight);
          gfx.bindUniform("uGradientFieldSize", gradientField.getVirtualSize());
          gfx.bindUniformBuffer(
            "uColorThresholdBlock",
            pps.state.uColorThresholds
          );
          const { positions, velocities, orientations } = pps.state.getActive();
          gfx.bindTexture(positions, 0);
          gfx.bindTexture(velocities, 1);
          if (mode === "3D") gfx.bindTexture(orientations, 2);
          gfx.bindTexture(pps.state.sortedPositions, 3);
          gfx.bindTexture(pps.state.countedPositions, 4);
          gfx.bindTexture(gradientField.gradientField(), 5);
          return true;
        }
      )
    );
  }

  public render() {
    const { frameBuffer } = this.pps.state.getTarget();
    this.gfx.render(false, frameBuffer);
    this.pps.state.swapBuffers();
  }

  public init() {
    const { pps, gfx } = this;
    pps.state.positions.forEach((p) => gfx.attachTexture(p, "texPositions"));
    pps.state.velocities.forEach((p) => gfx.attachTexture(p, "texVelocities"));
    if (pps.mode === "3D") {
      pps.state.orientations.forEach((p) =>
        gfx.attachTexture(p, "texOrientations")
      );
    }
    gfx.attachTexture(pps.state.sortedPositions, "texSortedPositions");
    gfx.attachTexture(pps.state.countedPositions, "texCountedPositions");
  }
}
