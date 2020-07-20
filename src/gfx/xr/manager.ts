interface Graphics {
  gl: WebGL2RenderingContext | WebGL2ComputeRenderingContext;
  onEnterXR(refSpace: XRReferenceSpace): void;
  drawXRFrame(time: number, frame: XRFrame): void;
}

interface Options {
  inline?: boolean;
  sessionMode?: XRSessionMode;
  referenceSpace?: XRReferenceSpaceType;
  defaultInputHandling?: boolean;
}

interface SetOptions {
  inline: boolean;
  sessionMode: XRSessionMode;
  referenceSpace: XRReferenceSpaceType;
  defaultInputHandling: boolean;
}

export class XRManager {
  private supported = false;
  private options: SetOptions;
  private session: XRSession | null = null;

  constructor(
    private graphics: Graphics,
    options: Options,
    private sessionStartHandler?: () => void,
    private sessionEndHandler?: () => void
  ) {
    this.options = {
      inline: "inline" in options ? options.inline || false : true,
      sessionMode: options.sessionMode || "immersive-vr",
      referenceSpace: options.referenceSpace || "local",
      defaultInputHandling:
        "defaultInputHandling" in options
          ? options.defaultInputHandling || false
          : true,
    };
  }

  public async queryForXR() {
    if (this.supported) return true;
    this.supported = await navigator.xr.isSessionSupported("immersive-vr");
    return this.supported;
  }

  public async requestSession() {
    const session = await navigator.xr.requestSession(
      this.options.sessionMode,
      {
        requiredFeatures: [this.options.referenceSpace],
      }
    );
    if (!session) return false;
    this.session = session;

    await this.onSessionStarted(session);

    const refSpace = await session.requestReferenceSpace("local");
    this.graphics.onEnterXR(refSpace);

    session.requestAnimationFrame(this.onXRFrame.bind(this));

    return true;
  }

  public async cancelSession() {
    if (!this.session) return;
    this.session.end();
    if (this.sessionEndHandler) this.sessionEndHandler();
  }

  private async onSessionStarted(session: XRSession) {
    session.addEventListener("end", (e) =>
      this.onSessionEnded((e as XRSessionEvent).session)
    );

    const gl = this.graphics.gl;
    await gl.makeXRCompatible();

    session.updateRenderState({
      baseLayer: new XRWebGLLayer(session, gl),
    });

    if (this.sessionStartHandler) this.sessionStartHandler();
  }

  private onSessionEnded(session: XRSession) {
    if (this.sessionEndHandler) this.sessionEndHandler();
  }

  private onXRFrame(time: number, frame: XRFrame) {
    frame.session.requestAnimationFrame(this.onXRFrame.bind(this));
    this.graphics.drawXRFrame(time, frame);
  }
}
