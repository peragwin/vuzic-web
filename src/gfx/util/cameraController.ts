import { vec3, quat } from "gl-matrix";
import { Camera } from "./camera";

const MOUSE_SCALE = 0.005;

export class CameraController {
  private phi = 0;
  private theta = 0;
  private radius = 2;
  private scale = 1;
  private origin = vec3.fromValues(0, 0, 0);

  private needsUpdate = false;

  private refSpace?: XRReferenceSpace;
  private baseRefSpace?: XRReferenceSpace;

  constructor(
    readonly camera: Camera,
    private canvas: HTMLCanvasElement,
    enabled = true,
    radius?: number
  ) {
    if (radius !== undefined) this.radius = radius;
    if (!enabled) return;

    // canvas.style.cursor = "grab";

    this.addEventListeners();
  }

  public initReferenceSpace(r: XRReferenceSpace) {
    this.refSpace = r;
    this.baseRefSpace = r;
  }

  public rotateView(dx: number, dy: number) {
    this.theta += dx * MOUSE_SCALE;
    this.phi += dy * MOUSE_SCALE;
    this.needsUpdate = true;
  }

  public reset() {
    this.phi = 0;
    this.theta = 0;
    this.refSpace = this.baseRefSpace;
    this.needsUpdate = false;
  }

  public update() {
    if (!this.needsUpdate) return false;
    this.needsUpdate = false;

    const rot = quat.create();
    quat.rotateX(rot, rot, -this.phi);
    quat.rotateY(rot, rot, -this.theta);

    this.updateReferenceSpace(rot);

    const loc = vec3.fromValues(0, 0, this.radius);
    const orient = vec3.fromValues(0, 1, 0);

    vec3.transformQuat(loc, loc, rot);
    vec3.transformQuat(orient, orient, rot);
    vec3.add(loc, loc, this.origin);

    this.camera.location = loc;
    this.camera.orientation = orient;

    return true;
  }

  public get referenceSpace() {
    if (!this.refSpace || !this.baseRefSpace)
      throw new Error("camera controller has no referenceSpace");
    return this.refSpace;
  }

  private updateReferenceSpace(rot: quat) {
    if (this.refSpace && this.baseRefSpace) {
      let xform = new XRRigidTransform(
        {},
        { x: rot[0], y: rot[1], z: rot[2], w: rot[3] }
      );
      const rs = this.baseRefSpace.getOffsetReferenceSpace(xform);

      const or = this.origin;
      xform = new XRRigidTransform({ x: -or[0], y: -or[1], z: -or[2] });
      this.refSpace = rs.getOffsetReferenceSpace(xform);
    }
  }

  private addEventListeners() {
    this.canvas.addEventListener("mousemove", (e) => {
      if (e.buttons & 1) {
        this.rotateView(e.movementX, e.movementY);
      }
    });

    let prevTouch: Touch | undefined = undefined;

    this.canvas.addEventListener("touchstart", (e) => {
      if (prevTouch === undefined) {
        prevTouch = e.changedTouches[0];
      }
    });

    this.canvas.addEventListener("touchend", (e) => {
      for (let touch of Array.from(e.changedTouches)) {
        if (prevTouch && prevTouch.identifier === touch.identifier) {
          this.rotateView(
            touch.pageX - prevTouch.pageX,
            touch.pageY - prevTouch.pageY
          );
          prevTouch = undefined;
        }
      }
    });

    this.canvas.addEventListener("touchcancel", (e) => {
      for (let touch of Array.from(e.changedTouches)) {
        if (prevTouch && prevTouch.identifier === touch.identifier) {
          prevTouch = undefined;
        }
      }
    });

    this.canvas.addEventListener("touchmove", (e) => {
      for (let touch of Array.from(e.changedTouches)) {
        if (prevTouch && prevTouch.identifier === touch.identifier) {
          this.rotateView(
            touch.pageX - prevTouch.pageX,
            touch.pageY - prevTouch.pageY
          );
          prevTouch = touch;
        }
      }
    });

    // @ts-ignore
    this.canvas.addEventListener("mousewheel", (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY > 0) {
        this.scale *= 1.1;
      } else {
        this.scale *= 0.9;
      }
      this.camera.scale = this.scale;
    });
  }
}
