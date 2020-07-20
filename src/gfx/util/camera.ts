import { mat4, vec3 } from "gl-matrix";

export class Camera {
  public projectionMatrix = mat4.identity(mat4.create());
  private cameraMatrix = mat4.identity(mat4.create());

  private _target = vec3.fromValues(0, 0, -1);
  private _location = vec3.fromValues(0, 0, 0);
  private _orientation = vec3.fromValues(0, 1, 0);
  private _scale = 1;

  private needsUpdate = true;

  constructor(
    private fov: number,
    aspect: number,
    private zNear: number,
    private zFar: number
  ) {
    mat4.perspective(this.projectionMatrix, fov, aspect, zNear, zFar);
  }

  public get matrix() {
    if (this.needsUpdate) this.update();
    return this.cameraMatrix;
  }

  public get target() {
    return this._target;
  }

  public set target(point: vec3) {
    this._target = point;
    this.needsUpdate = true;
  }

  public set location(point: vec3) {
    this._location = point;
    this.needsUpdate = true;
  }

  public get location() {
    return this._location;
  }

  public set orientation(point: vec3) {
    this._orientation = point;
    this.needsUpdate = true;
  }

  public get orientation() {
    return this._orientation;
  }

  public set aspect(ratio: number) {
    mat4.perspective(
      this.projectionMatrix,
      this.fov,
      ratio,
      this.zNear,
      this.zFar
    );
    this.needsUpdate = true;
  }

  public get scale() {
    return this._scale;
  }

  public set scale(s: number) {
    this._scale = s;
    this.needsUpdate = true;
  }

  private update() {
    this.needsUpdate = false;
    mat4.lookAt(
      this.cameraMatrix,
      this._location,
      this._target,
      this._orientation
    );
    const s = this._scale;
    mat4.scale(this.cameraMatrix, this.cameraMatrix, vec3.fromValues(s, s, s));
  }
}
