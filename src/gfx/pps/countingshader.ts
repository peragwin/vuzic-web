import {
  ShaderConfig,
  Graphics,
  RenderTarget,
  TextureObject,
  Texture3DObject,
} from "../graphics";

const thresholdShader = (
  gl: WebGL2ComputeRenderingContext,
  gridSize: number
) => {
  const passes = Math.log2(gridSize);
  if (Math.floor(passes) !== passes)
    throw new Error("gridSize must be a power of 2");
  const source = `#version 310 es
precision highp float;

#define GRID_SIZE ${gridSize}
#define PASSES ${passes}

layout (local_size_x = GRID_SIZE, local_size_y = GRID_SIZE, local_size_z = 1) in;

uniform ivec2 uStateSize;
uniform float uRadius;

layout (rgba32i, binding = 0) uniform readonly highp iimage3D imgPositionCount;
layout (std140, binding = 1) buffer TData {
  float data[4];
} ssboThresholds;

shared float variance[${2 * gridSize}];

float getCount(in int x, in int y, in int z) {
  ivec3 imgCoord = ivec3(x, y, z);
  int cval = imageLoad(imgPositionCount, imgCoord).x;
  return float(cval);
}

int varianceIndex(in int index, in int level) {
  int offset = 0;
  for (int i = 0; i < level; i++) {
    offset += 1 << (PASSES-i);
  }
  return index + offset;
}

void main() {
  ivec2 threadID = ivec2(gl_LocalInvocationID.xy);
  int threadIndex = int(gl_LocalInvocationIndex);

  float nParticles = float(uStateSize.x * uStateSize.y);
  float gridSize = float(GRID_SIZE * GRID_SIZE * GRID_SIZE);
  float mean = nParticles / gridSize;

  float s = 0.;
  for (int i = 0; i < GRID_SIZE; i++) {
    float dev = getCount(i, threadID.x, threadID.y) - mean;
    s += dev * dev;
  }
  variance[varianceIndex(threadIndex, 0)] = s;

  memoryBarrierShared();
  barrier();

  for (int pass = 1; pass <= PASSES; pass++) {
    if (threadIndex < (GRID_SIZE >> pass)) {
      float v = variance[varianceIndex(2*threadIndex, pass-1)] +
                variance[varianceIndex(2*threadIndex+1, pass-1)];
      variance[varianceIndex(threadIndex, pass)] = v;
    }

    memoryBarrierShared();
    barrier();
  }

  if (threadIndex == 0) {
    float std = sqrt(variance[varianceIndex(0, PASSES)]) / float(GRID_SIZE);
    
    float cellsInRadius = ceil(uRadius * float(GRID_SIZE));
    float c3 = cellsInRadius * cellsInRadius * cellsInRadius;
    float particlesInRadius = c3 * mean;
    float dev = c3 * std;

    for (int i = 0; i < 5; i++) {
      float th = (-1.0 + float(i)) * dev / 4.;
      ssboThresholds.data[i] = th + particlesInRadius;
    }
  }
}
`;
  return new ShaderConfig(source, gl.COMPUTE_SHADER);
};

const countingShader = (
  gl: WebGL2ComputeRenderingContext,
  gridSize: number,
  workGroupSize: number
) => {
  const gfull = gridSize * gridSize * gridSize;
  const countingShaderSrc = `#version 310 es
precision highp float;
precision highp int;
precision highp iimage2D;
precision highp iimage3D;

// there are likely to be problems if workGroupSize does not divide gridSize*gridSize,
// or if workGroupSize does not divide uStateSize.x*uStateSize.y
#define GROUP_SIZE ${workGroupSize}
#define GRID_SIZE ${gridSize}

layout (local_size_x = GROUP_SIZE, local_size_y = 1, local_size_z = 1) in;

uniform ivec2 uStateSize;

layout (rgba32i, binding = 0) uniform readonly iimage2D imgPosition;
layout (rgba32i, binding = 1) uniform writeonly iimage2D imgSortedPosition;
layout (rgba32i, binding = 2) uniform writeonly iimage3D imgPositionCount;

shared int counts[${gfull}];
shared int totals[${gfull}];
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
  ivec2 imgCoord = posImgCoord(index);
  ivec3 pi = imageLoad(imgPosition, imgCoord).xyz;
  vec3 p = vec3(intBitsToFloat(pi.x), intBitsToFloat(pi.y), intBitsToFloat(pi.z));
  p = (p + 1.) / 2.;
  ivec3 gi = ivec3(floor(p * float(GRID_SIZE)));
  return gi.x + int(GRID_SIZE) * gi.y + int(GRID_SIZE) * int(GRID_SIZE) * gi.z;
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

    ivec4 pos = imageLoad(imgPosition, posImgCoord(i));
    imageStore(imgSortedPosition, posImgCoord(total), pos);
  }
}

void writeCounts(in ivec2 seg, in int threadIndex) {
  int gridSize = int(GRID_SIZE);
  for (int i = seg.s; i < seg.t; i++) {
    ivec3 gridIndex = ivec3(i % gridSize, (i / gridSize) % gridSize, i / (gridSize * gridSize));
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
  int countSize = int(GRID_SIZE * GRID_SIZE * GRID_SIZE);
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
  return new ShaderConfig(countingShaderSrc, gl.COMPUTE_SHADER);
};

class ComputeTarget extends RenderTarget {
  public use() {}
}

interface StateSize {
  width: number;
  height: number;
}

interface Textures {
  position: TextureObject;
  sortedPosition: TextureObject;
  positionCount: Texture3DObject;
}

interface Threshold {
  buffer: WebGLBuffer;
  radius: number;
}

export class CountingSortComputer {
  private gfx: Graphics;
  private thresholdGfx: Graphics;

  private readonly workGroupSize = 256;

  constructor(
    private gl: WebGL2ComputeRenderingContext,
    private textures: Textures,
    private threshold: Threshold,
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
    const gg = gridSize * gridSize * gridSize;
    if (gg % workGroupSize !== 0) {
      throw new Error(
        `gridSize**2 ${gg} must be divisible by ${workGroupSize}`
      );
    }

    const tgt = new ComputeTarget();
    let shaders = [countingShader(gl, gridSize, workGroupSize)];
    let gfx = new Graphics(gl, tgt, shaders, this.onCompute.bind(this));
    this.gfx = gfx;

    gfx.attachUniform("uStateSize", (l, v: StateSize) =>
      gl.uniform2i(l, v.width, v.height)
    );

    shaders = [thresholdShader(gl, gridSize)];
    gfx = new Graphics(gl, tgt, shaders, this.onThresholds.bind(this));
    this.thresholdGfx = gfx;

    gfx.attachUniform("uStateSize", (l, v: StateSize) =>
      gl.uniform2i(l, v.width, v.height)
    );
    gfx.attachUniform("uRadius", (l, v) => gl.uniform1f(l, v));
  }

  public update(
    stateSize: StateSize,
    textures: Textures,
    threshold: Threshold
  ) {
    const ss = stateSize.width * stateSize.height;
    if (ss % this.workGroupSize !== 0) {
      throw new Error(
        `stateSize x*y ${ss} must be divisible by ${this.workGroupSize}`
      );
    }
    this.stateSize = stateSize;
    this.textures = textures;
    this.threshold = threshold;
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
    gl.dispatchCompute(1, 1, 1);

    // 4. Copy output buffers to textures (???)
  }

  private onThresholds() {
    const gl = this.gl;

    this.textures.positionCount.bindImage(0, gl.READ_ONLY);
    gl.bindBufferBase(gl.SHADER_STORAGE_BUFFER, 1, this.threshold.buffer);

    this.thresholdGfx.bindUniform("uStateSize", this.stateSize);
    this.thresholdGfx.bindUniform("uRadius", this.threshold.radius);

    gl.dispatchCompute(1, 1, 1);
  }

  public compute() {
    const gl = this.gl;

    this.gfx.render(false);

    gl.memoryBarrier(
      gl.SHADER_STORAGE_BARRIER_BIT |
        gl.SHADER_IMAGE_ACCESS_BARRIER_BIT |
        gl.TEXTURE_UPDATE_BARRIER_BIT |
        gl.TEXTURE_FETCH_BARRIER_BIT
    );

    this.thresholdGfx.render(false);
  }
}
