import {
  ShaderConfig,
  Graphics,
  RenderTarget,
  TextureObject,
} from "../graphics";

const countingShader = (
  gl: WebGL2ComputeRenderingContext,
  gridSize: number,
  workGroupSize: number
) => {
  const countingShaderSrc = `#version 310 es
precision highp float;
precicion highp int;

// there are likely to be problems if workGroupSize does not divide gridSize*gridSize,
// or if workGroupSize does not divide uStateSize.x*uStateSize.y
#define GROUP_SIZE ${workGroupSize}
#define GRID_SIZE ${gridSize}

layout (local_size_x = GROUP_SIZE, local_size_y = 1, local_size_z = 1) in;

uniform ivec2 uStateSize;
// uniform int uGridSize;

// struct Position {
//   int x;
//   int y;
// };

// layout (std140, binding = 0) buffer PositionBuffer {
//   ivec2 data[];
// } ssboPosition;

// layout (std140, binding = 1) buffer SortedPositions {
//   ivec2 data[];
// } ssboSortedPosition;

// layout (std140, binding = 2) buffer PositionCounts {
//   ivec2 data[];
// } ssboPositionCount;

layout (rg32i, binding = 0) uniform coherent readonly restrict image2D imgPosition;
layout (rg32i, binding = 1) uniform coherent writeonly restrict image2D imgSortedPosition;
layout (rg32i, binding = 2) uniform coherent writeonly restrict image2D imgPositionCount;

shared int counts[${gridSize * gridSize}];
shared int totals[${gridSize * gridSize}];
shared int subTotals[GROUP_SIZE];

int positionToIndex(in int index) {
  // ivec2 pi = ssboPosition.data[index];
  ivec2 pi = imageLoad()
  vec2 p = vec2(intBitsToFloat(p.x), intBitsToFloat(p.y));
  p = (p + 1.) / 2.;
  ivec2 gi = ivec2(floor(p * float(GRID_SIZE)));
  return gi.x + int(GRID_SIZE) * gi.y;
}

void countPositions(in ivec2 seg) {
  for (int i = seg.s; i < seg.t; i++) {
    atomicAdd(counts[positionToIndex(i)], 1);
  }
}

void totalCounts(in ivec2 seg) {
  int total = 0;
  for (int i = seg.s; i < seg.t; i++) {
    int c = counts[i];
    totals[i] = total;
    total += c;
  }
  subTotals[threadIndex] = total;
}

int subtotalOffset(in int threadIndex) {
  int s = 0;
  for (int i = 0; i < threadIndex; i++) {
    s += subTotals[i];
  }
  return s;
}

void applySubtotalOffset(in ivec2 seg, in int offset) {
  for (int i = seg.s; i < seg.t; i++) {
    totals[i] += offset;
  }
}

void sortPositions(in ivec2 seg) {  
  for (int i = seg.s; i < seg.t; i++) {
    const idx = positionToIndex(i);
    const total = atomicAdd(totals[idx], 1);
    ssboSortedPosition.data[total] = ssboPosition.data[i];
  }
}

void writeCounts(in ivec2 seg, in int threadIndex) {
  for (int i = seg.s; i < seg.t; i++) {
    ssboPositionCount.data[i] = ivec2(counts[i], totals[i]);
  }
}

ivec2 positionSegment(in int threadIndex) {
  int bufSize = uStateSize.x * uStateSize.y;
  int workSize = bufSize / int(GROUP_SIZE);
  int startIndex = workSize * threadIndex;
  int endIndex = startIndex + workSize;
  return ivec2(startIndex, endIndex);
}

ivec2 gridSegment(in int threadIndex) {
  int countSize = int(GRID_SIZE * GRID_SIZE);
  int workSize = countSize / int(GROUP_SIZE);
  int startIndex = threadIndex * workSize;
  int endIndex = startIndex + workSize;
  return ivec2(startIndex, endIndex);
}

void main () {
  uint threadIndex = gl_GlobalInvocationID.x;
  ivec2 posSeg = positionSegment(threadIndex);
  ivec2 gridSeg = gridSegment(threadIndex);
  
  countPositions(posSeg);
  memoryBarrierShared();
  barrier();

  totalCounts(gridSeg);
  memoryBarrierShared();
  barrier();

  int offset = subtotalOffset(threadIndex);
  memoryBarrierShared();
  barrier();

  applySubtotalOffset(gridSeg, offset);
  memoryBarrierShared();
  barrier();

  sortPositions(posSeg);
  memoryBarrierShared();
  barrier();

  writeCounts(gridSeg);
}
`;
  return new ShaderConfig(countingShaderSrc, gl.COMPUTE_SHADER, [], []);
};

class ComputeTarget extends RenderTarget {
  constructor() {
    super();
  }

  public use() {}
}

class ShaderBufferObject {
  private buffer: WebGLBuffer;
  constructor(private gl: WebGL2ComputeRenderingContext) {
    const buffer = gl.createBuffer();
    if (!buffer) {
      throw new Error("failed to create buffer");
    }
    this.buffer = buffer;
  }

  public bind(id: number) {
    this.gl.bindBufferBase(this.gl.SHADER_STORAGE_BUFFER, id, this.buffer);
  }
}

interface StateSize {
  width: number;
  height: number;
}

interface Textures {
  position: TextureObject;
  sortedPosition: TextureObject;
  positionCount: TextureObject;
}

export class CountingSortComputer {
  private gfx: Graphics;
  private ssboPosition: ShaderBufferObject;
  private ssboSortedPosition: ShaderBufferObject;
  private ssboPositionCount: ShaderBufferObject;

  private readonly workGroupSize = 1024;

  constructor(
    private gl: WebGL2ComputeRenderingContext,
    private stateSize: StateSize,
    private gridSize: number,
    private textures: Textures
  ) {
    const workGroupSize = this.workGroupSize;
    const ss = stateSize.width * stateSize.height;
    if (ss % workGroupSize !== 0) {
      throw new Error(
        `stateSize x*y ${ss} must be divisible by ${workGroupSize}`
      );
    }
    const gg = gridSize * gridSize;
    if (gg % workGroupSize !== 0) {
      throw new Error(
        `gridSize**2 ${gg} must be divisible by ${workGroupSize}`
      );
    }

    const tgt = new ComputeTarget();
    const shaders = [countingShader(gl, gridSize, workGroupSize)];
    const gfx = new Graphics(gl, tgt, shaders, this.onCompute.bind(this));
    this.gfx = gfx;

    gfx.attachUniform("uStateSize", (l, v: StateSize) =>
      gl.uniform2f(l, v.width, v.height)
    );

    this.ssboPosition = new ShaderBufferObject(gl);
    this.ssboSortedPosition = new ShaderBufferObject(gl);
    this.ssboPositionCount = new ShaderBufferObject(gl);
  }

  private onCompute() {
    // 1. Copy position texture to ssboPosition
    this.gl.copyBufferSubData;

    // 2. Bind buffers and uniform
    this.ssboPosition.bind(0);
    this.ssboSortedPosition.bind(1);
    this.ssboPositionCount.bind(2);
    this.gfx.bindUniform("uStateSize", this.stateSize);

    // 3. Execute compute shader
    this.gl.dispatchCompute(1, 1, 1);
    this.gl.memoryBarrier(this.gl.SHADER_STORAGE_BARRIER_BIT);

    // 4. Copy output buffers to textures
  }
}
