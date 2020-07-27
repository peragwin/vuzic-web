import { RenderTarget } from "../graphics";
import { mat4 } from "gl-matrix";

export interface RenderView {
  eye: XREye;
  viewport: XRViewport;
  projection: mat4;
  transform: XRRigidTransform;
}

export class XRRenderTarget extends RenderTarget {
  private views: RenderView[] = [];
  private framebuffer?: WebGLFramebuffer;

  constructor(
    private gl: WebGL2RenderingContext,
    private referenceSpace: XRReferenceSpace,
    private onSetView: (view: RenderView) => void,
    private clearing = true
  ) {
    super();
  }

  public updateReferenceSpace(rs: XRReferenceSpace) {
    this.referenceSpace = rs;
  }

  public onXRFrame(t: number, frame: XRFrame) {
    const session = frame.session;
    const pose = frame.getViewerPose(this.referenceSpace);
    if (!pose) return;

    const layer = session.renderState.baseLayer;
    this.framebuffer = layer.framebuffer;
    this.views = pose.views.map((view) => ({
      eye: view.eye,
      viewport: layer.getViewport(view),
      projection: mat4.clone(view.projectionMatrix),
      transform: view.transform.inverse,
    }));
  }

  public use() {
    if (!this.framebuffer) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    if (this.clearing) {
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }
  }

  public get layers() {
    return this.views.length;
  }

  public setView(l: number) {
    const gl = this.gl;
    const v = this.views[l];
    if (!v) return;
    const vp = v.viewport;
    gl.viewport(vp.x, vp.y, vp.width, vp.height);
    this.onSetView(v);
  }
}
