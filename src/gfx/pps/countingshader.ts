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
precision highp int;
precision highp iimage2D;

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

layout (rgba32i, binding = 0) uniform readonly iimage2D imgPosition;
layout (rgba32i, binding = 1) uniform writeonly iimage2D imgSortedPosition;
layout (rgba32i, binding = 2) uniform writeonly iimage2D imgPositionCount;

shared int counts[${gridSize * gridSize}];
shared int totals[${gridSize * gridSize}];
shared int subTotals[GROUP_SIZE];

void initSharedMemory(in ivec2 seg, in int threadIndex) {
  subTotals[threadIndex] = 0;
  for (int i = seg.s; i < seg.t; i++) {
    counts[i] = 0;
    totals[i] = 0;
  }
}

// returns the image coordinate for the particle at index i
ivec2 posImgCoord(in int i) {
  return ivec2(i % uStateSize.x, i / uStateSize.x);
}

// returns the index of the cell where the i'th particle is positioned 
int positionToIndex(in int index) {
  // ivec2 pi = ssboPosition.data[index];
  ivec2 imgCoord = posImgCoord(index);
  ivec2 pi = imageLoad(imgPosition, imgCoord).xy;
  vec2 p = vec2(intBitsToFloat(pi.x), intBitsToFloat(pi.y));
  p = (p + 1.) / 2.;
  ivec2 gi = ivec2(floor(p * float(GRID_SIZE)));
  return gi.x + int(GRID_SIZE) * gi.y;
}

void countPositions(in ivec2 seg) {
  for (int i = seg.s; i < seg.t; i++) {
    atomicAdd(counts[positionToIndex(i)], 1);
  }
}

void totalCounts(in ivec2 seg, in int threadIndex) {
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
    int idx = positionToIndex(i);
    int total = atomicAdd(totals[idx], 1);

    // ivec4 pos = ivec4(floatBitsToInt(0.5), floatBitsToInt(0.5), 0, 0);
    ivec4 pos = imageLoad(imgPosition, posImgCoord(i));
    imageStore(imgSortedPosition, posImgCoord(total), pos);
    // ssboSortedPosition.data[total] = ssboPosition.data[i];
  }
}

void writeCounts(in ivec2 seg, in int threadIndex) {
  int gridSize = int(GRID_SIZE);
  for (int i = seg.s; i < seg.t; i++) {
    // ssboPositionCount.data[i] = ivec2(counts[i], totals[i]);
    ivec2 gridIndex = ivec2(i % gridSize, i / gridSize);
    ivec4 cval = ivec4(counts[i], totals[i], 69, 420);
    imageStore(imgPositionCount, gridIndex, cval);
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
  int threadIndex = int(gl_LocalInvocationID.x);
  ivec2 posSeg = positionSegment(threadIndex);
  ivec2 gridSeg = gridSegment(threadIndex);

  initSharedMemory(gridSeg, threadIndex);
  memoryBarrierShared();
  barrier();
  
  countPositions(posSeg);
  memoryBarrierShared();
  barrier();

  totalCounts(gridSeg, threadIndex);
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

  writeCounts(gridSeg, threadIndex);
  memoryBarrierShared();
  barrier();
}
`;
  return new ShaderConfig(countingShaderSrc, gl.COMPUTE_SHADER, [], []);
};

class ComputeTarget extends RenderTarget {
  public use() {}
}

// class ShaderBufferObject {
//   private buffer: WebGLBuffer;
//   constructor(private gl: WebGL2ComputeRenderingContext) {
//     const buffer = gl.createBuffer();
//     if (!buffer) {
//       throw new Error("failed to create buffer");
//     }
//     this.buffer = buffer;
//   }

//   public bind(id: number) {
//     this.gl.bindBufferBase(this.gl.SHADER_STORAGE_BUFFER, id, this.buffer);
//   }
// }

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
  // private ssboPosition: ShaderBufferObject;
  // private ssboSortedPosition: ShaderBufferObject;
  // private ssboPositionCount: ShaderBufferObject;

  private readonly workGroupSize = 256;

  constructor(
    private gl: WebGL2ComputeRenderingContext,
    private textures: Textures,
    private stateSize: StateSize,
    gridSize: number
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
      gl.uniform2i(l, v.width, v.height)
    );

    // this.ssboPosition = new ShaderBufferObject(gl);
    // this.ssboSortedPosition = new ShaderBufferObject(gl);
    // this.ssboPositionCount = new ShaderBufferObject(gl);
  }

  public update(stateSize: StateSize, textures: Textures) {
    const ss = stateSize.width * stateSize.height;
    if (ss % this.workGroupSize !== 0) {
      throw new Error(
        `stateSize x*y ${ss} must be divisible by ${this.workGroupSize}`
      );
    }
    this.stateSize = stateSize;
    this.textures = textures;
  }

  private onCompute() {
    const gl = this.gl;

    // 1. Bind textures to image buffers
    this.textures.position.bindImage(0, gl.READ_ONLY);
    this.textures.sortedPosition.bindImage(1, gl.WRITE_ONLY);
    this.textures.positionCount.bindImage(2, gl.WRITE_ONLY);

    // 2. Bind buffers and uniform
    this.gfx.bindUniform("uStateSize", this.stateSize);

    // 3. Execute compute shader
    this.gl.dispatchCompute(1, 1, 1);

    // 4. Copy output buffers to textures (???)
  }

  public compute() {
    this.gfx.render(false);
  }
}
