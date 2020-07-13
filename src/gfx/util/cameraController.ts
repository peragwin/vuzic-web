import { vec3, mat4, mat3 } from "gl-matrix";
import { Camera } from "./camera";

interface XY {
  x: number;
  y: number;
}

function mousePosition(e: MouseEvent) {
  return { x: e.clientX, y: e.clientY };
}

const MOUSE_SCALE = 0.005;

export class CameraController {
  private isMouseDown = false;
  private needsUpdate = false;

  private lastEventPosition = { x: 0, y: 0 };
  private moveEventAccumulator = { x: 0, y: 0 };

  private theta = 0;
  private phi = 0;
  private radius = 2;

  constructor(
    readonly camera: Camera,
    private canvas: HTMLCanvasElement,
    enabled = true,
    radius?: number
  ) {
    if (radius !== undefined) this.radius = radius;
    if (!enabled) return;
    this.addEventListeners();
  }

  private addEventListeners() {
    document.addEventListener("mouseup", this.mouseUpHandler.bind(this));
    this.canvas.addEventListener("mousedown", this.mouseDownHandler.bind(this));
    this.canvas.addEventListener("mousemove", this.mouseMoveHandler.bind(this));
    // @ts-ignore
    this.canvas.addEventListener("mousewheel", this.wheelHandler.bind(this));
  }

  private mouseUpHandler() {
    this.isMouseDown = false;
  }

  private mouseDownHandler(e: MouseEvent) {
    this.isMouseDown = true;
    this.lastEventPosition = mousePosition(e);
  }

  private mouseMoveHandler(e: MouseEvent) {
    if (!this.isMouseDown) return;
    this.handleMovement(mousePosition(e));
  }

  private handleMovement(p: XY) {
    this.needsUpdate = true;
    const old = this.lastEventPosition;
    this.theta -= (p.x - old.x) * MOUSE_SCALE;
    this.phi -= (p.y - old.y) * MOUSE_SCALE;
    // this.moveEventAccumulator.x += (p.x - old.x) * MOUSE_SCALE;
    // this.moveEventAccumulator.y += (p.y - old.y) * MOUSE_SCALE;
    this.lastEventPosition = p;
  }

  private wheelHandler(e: WheelEvent) {
    e.preventDefault();
    if (e.deltaY > 0) {
      this.radius *= 1.1;
    } else {
      this.radius *= 0.9;
    }
    this.needsUpdate = true;
  }

  public increment(inc: { x: number; y: number }) {
    this.theta -= inc.x;
    this.phi -= inc.y;
    // this.moveEventAccumulator.x += inc.x;
    // this.moveEventAccumulator.y += inc.y;
    this.needsUpdate = true;
  }

  // TODO: update by rotating on the axis orthogonal to the accumulated {x,y}
  // vector in the x,y plane.

  public update(cb: (mat: mat4) => void) {
    if (!this.needsUpdate) return;
    this.needsUpdate = false;

    let s, c, r, o;
    const U = mat3.create();
    const V = mat3.create();

    s = Math.sin(this.phi);
    c = Math.cos(this.phi);
    mat3.set(V, 1, 0, 0, 0, c, -s, 0, s, c);

    s = Math.sin(this.theta);
    c = Math.cos(this.theta);
    mat3.set(U, c, 0, -s, 0, 1, 0, s, 0, c);

    r = vec3.fromValues(0, 0, this.radius);
    o = vec3.fromValues(0, 1, 0);

    vec3.transformMat3(r, r, U);
    vec3.transformMat3(o, o, U);
    vec3.transformMat3(r, r, V);
    vec3.transformMat3(o, o, V);

    this.camera.location = r;
    this.camera.orientation = o;

    cb(this.camera.matrix);
  }

  public setAspect(aspect: number) {
    this.camera.aspect = aspect;
    this.needsUpdate = true;
  }
}

/*
Failed attempts at getting better camera control. The goal is so that
no matter what the current camera orientation is, rotation is on the X
and Y axes in clip space.

function normalize(out: vec3, x: vec3) {
  const n = Math.sqrt(x[0] * x[0] + x[1] * x[1] + x[2] * x[2]);
  console.log(x[0] * x[0], x[1] * x[1], x[2] * x[2]);
  out[0] = x[0] / n;
  out[1] = x[1] / n;
  out[2] = x[2] / n;
  console.log({ out, x, n });
}

let { x, y } = this.moveEventAccumulator;
this.moveEventAccumulator = { x: 0, y: 0 };
const n = Math.sqrt(x * x + y * y);

if (n > 0) {
  r = this.camera.location;
  o = this.camera.orientation;

  // const u = vec3.fromValues(0, 0, 0);
  // const v = vec3.fromValues(0, 0, 0);
  // const w = vec3.fromValues(0, 0, 0);

  // normalize(v, o);
  // normalize(w, r);
  // vec3.cross(u, r, o);
  // normalize(u, u);
  // console.log("dot", vec3.dot(r, o));
  // console.log({ u, v, w });

  // // prettier-ignore
  // const P = mat3.fromValues(u[0], u[1], u[2], v[0], v[1], v[2], w[0], w[1], w[2]);
  // const Q = mat3.create();
  // mat3.transpose(Q, P);

  s = Math.sin(n);
  c = Math.cos(n);
  const W = mat3.fromValues(1, 0, 0, 0, c, -s, 0, s, c);

  s = -x / n;
  c = y / n;
  mat3.set(V, c, s, 0, -s, c, 0, 0, 0, 1);
  mat3.transpose(U, V);

  mat3.multiply(W, W, V);
  mat3.multiply(W, U, W);
  // mat3.multiply(W, W, Q);
  // mat3.multiply(W, P, W);

  vec3.transformMat3(r, r, W);
  vec3.transformMat3(o, o, W);

  // console.log({ U, V, W, P, Q, u, v, w });

  // vec3.sub(o, o, vec3.scale(vec3.create(), r, vec3.dot(r, o)));
  // normalize(o, o);
  this.camera.location = r;
  this.camera.orientation = o;
}
*/
