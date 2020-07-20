import {
  ShaderConfig,
  Graphics,
  RenderTarget,
  TextureObject,
  Texture3DObject,
  ShaderStorageBuffer,
} from "../graphics";
import { PPSMode } from "./pps";
import { TEX_WIDTH } from "./state";

const thresholdShader = (
  gl: WebGL2ComputeRenderingContext,
  gridSize: number,
  mode: PPSMode
) => {
  const passes = Math.log2(gridSize);
  if (Math.floor(passes) !== passes)
    throw new Error("gridSize must be a power of 2");

  let gridCount = gridSize * gridSize;
  let zIterations = 1;
  let localSizeY = 1;

  if (mode === "3D") {
    gridCount *= gridSize;
    localSizeY = gridSize;

    if (gridSize * gridSize > 1024) {
      zIterations = (gridSize * gridSize) / 1024;
      // don't actually think this is needed since gridsize here is >= 2^6
      if (Math.floor(zIterations) !== zIterations)
        throw new Error("gridSize*gridSize must be multiple of 1024");
    }
  }

  const source = `#version 310 es
precision highp float;

#define GRID_SIZE ${gridSize}
#define GRID_COUNT ${gridCount}
#define LOCAL_SIZE_Y ${localSizeY / zIterations}
#define Z_ITERATIONS ${zIterations}
#define PASSES ${passes}
#define PPS_MODE_${mode}

layout (local_size_x = GRID_SIZE, local_size_y = LOCAL_SIZE_Y, local_size_z = 1) in;

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
  int offset = (1 << level) - 1;
  return index + offset;
}

void main() {
  ivec2 threadID = ivec2(gl_LocalInvocationID.xy);
  int threadIndex = int(gl_LocalInvocationIndex);

  float nParticles = float(uStateSize.x * uStateSize.y);
  float gridSize = float(GRID_COUNT);
  float mean = nParticles / gridSize;

  float s = 0.;
  for (int j = 0; j < Z_ITERATIONS; j++) {
    int z = int(LOCAL_SIZE_Y) * j; 
    for (int i = 0; i < GRID_SIZE; i++) {
      float dev = getCount(i, threadID.x, threadID.y + z) - mean;
      s += dev * dev;
    }
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
    
    float cellsInRadius = uRadius * float(GRID_SIZE);
    float c3 = cellsInRadius * cellsInRadius;
#ifdef PPS_MODE_3D
    c3 = c3 * cellsInRadius;
#endif
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
  workGroupSize: number,
  pass: "FIRST" | "SECOND",
  mode: PPSMode,
  parentGridSize?: number
) => {
  let gfull = gridSize * gridSize;
  if (mode === "3D") gfull *= gridSize;

  if (gfull / workGroupSize < 1) {
    console.warn(
      `workGroupSize ${workGroupSize} is larger than grid count ${gfull}! ` +
        `adjusting workGroupSize to ${gfull}..`
    );
    workGroupSize = gfull;
  }

  if (gfull * 2 + workGroupSize > 32768) {
    console.error(
      "cannot allocate more than 32kib in compute shader",
      gfull,
      workGroupSize
    );
    throw new Error("cannot allocate more than 32kib in compute shader");
  }

  const countingShaderSrc = `#version 310 es

#define PPS_MODE_${mode}

precision highp float;
precision highp int;
precision highp iimage2D;
precision highp iimage3D;

// there are likely to be problems if workGroupSize does not divide gridSize*gridSize,
// or if workGroupSize does not divide uStateSize.x*uStateSize.y
#define GROUP_SIZE ${workGroupSize}
#define GRID_SIZE ${gridSize}
#define GRID_COUNT ${gfull}
#define ${pass}_PASS

#ifdef SECOND_PASS
#define PARENT_GRID_SIZE ${parentGridSize}
#endif

layout (local_size_x = GROUP_SIZE, local_size_y = 1, local_size_z = 1) in;

uniform ivec2 uStateSize;

// on the first pass, load the positions from the state image,
// and write sorted positions and counts to ssbo's
#ifdef FIRST_PASS

layout (rgba32i, binding = 0) uniform readonly iimage2D imgPosition;
layout (std430, binding = 1) writeonly buffer ssboSortedPosition {
  ivec4[] sortedPosition;
};
layout (std430, binding = 2) writeonly buffer ssboPositionCount {
  ivec4[] positionCount;
};

// on the second pass, read sorted positions and counts from the ssbo's
// and write the final sorted positions and counts to the state images
#elif defined(SECOND_PASS)

layout (std430, binding = 0) readonly buffer ssboSortedPosition {
  ivec4[] sortedPosition;
};
layout (std430, binding = 1) readonly buffer ssboPositionCount {
  ivec4[] positionCount;
};

layout (rgba32i, binding = 2) uniform writeonly iimage2D imgSortedPosition;
layout (rgba32i, binding = 3) uniform writeonly iimage3D imgPositionCount;

#endif

shared int counts[GRID_COUNT];
shared int totals[GRID_COUNT];
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

#ifdef FIRST_PASS

// returns the index of the cell where the i'th particle is positioned 
int positionToIndex(in int index) {
  ivec2 imgCoord = posImgCoord(index);
  ivec3 pi = imageLoad(imgPosition, imgCoord).xyz;
  vec3 p = vec3(intBitsToFloat(pi.x), intBitsToFloat(pi.y), intBitsToFloat(pi.z));
  p = (p + 1.) / 2.;
  ivec3 gi = ivec3(floor(p * float(GRID_SIZE)));
  int rv = gi.x + int(GRID_SIZE) * gi.y;
#ifdef PPS_MODE_3D
  return rv + int(GRID_SIZE) * int(GRID_SIZE) * gi.z;
#else
  return rv;
#endif
}

void countPositions(in ivec2 seg) {
  for (int i = seg.s; i < seg.t; i++) {
    atomicAdd(counts[positionToIndex(i)], 1);
  }
}

// in the first pass, get totals and write to sorted position buffer
void sortPositions(in ivec2 seg) {  
  for (int i = seg.s; i < seg.t; i++) {
    int idx = positionToIndex(i);
    int total = atomicAdd(totals[idx], 1);

    ivec4 pos = imageLoad(imgPosition, posImgCoord(i));
    sortedPosition[total] = pos;
  }
}

// in the first pass, write counts to the shared buffer
void writeCounts(in ivec2 seg) {
  for (int i = seg.s; i < seg.t; i++) {
    positionCount[i] = ivec4(counts[i], totals[i], 420, 69);
  }
}

// in the first pass, get the segment that this thread will count
ivec2 positionSegment(in int threadIndex) {
  int bufSize = uStateSize.x * uStateSize.y;
  int workSize = bufSize / int(GROUP_SIZE);
  int startIndex = workSize * threadIndex;
  int endIndex = startIndex + workSize;
  return ivec2(startIndex, endIndex);
}

#elif defined(SECOND_PASS)

// returns the index of the subcell where the i'th particle is positioned
int positionToIndex(in ivec3 pi, in vec3 cellStart, in ivec3 offset) {
  vec3 p = vec3(intBitsToFloat(pi.x), intBitsToFloat(pi.y), intBitsToFloat(pi.z));

  float cellSize = (2. / float(PARENT_GRID_SIZE));
  p = (p - cellStart) / cellSize;

  ivec3 gi = ivec3(floor(p * float(GRID_SIZE)));
  int rv = gi.x + int(GRID_SIZE) * gi.y;
#ifdef PPS_MODE_3D
  return rv + int(GRID_SIZE) * int(GRID_SIZE) * gi.z;
#else
  return rv;
#endif
}

void countPositions(in ivec2 seg, in vec3 cellStart, in ivec3 offset) {
  for (int i = seg.s; i < seg.t; i++) {
    ivec3 pos = sortedPosition[i].xyz;
    int idx = positionToIndex(pos, cellStart, offset); 
    atomicAdd(counts[idx], 1);
  }
}

// in the second pass, get totals and write to the sorted position image
void sortPositions(in ivec2 seg, in vec3 cellStart, in ivec3 offset, in int imgOffset) {
  for (int i = seg.s; i < seg.t; i++) {
    ivec4 pos = sortedPosition[i];

    int idx = positionToIndex(pos.xyz, cellStart, offset);
    int total = atomicAdd(totals[idx], 1);

    imageStore(imgSortedPosition, posImgCoord(total + imgOffset), pos);
  }
}

ivec3 gridIndex(in int i, in ivec3 gridOffset) {
  int gridSize = int(GRID_SIZE);
  int zindex = 0;
#ifdef PPS_MODE_3D
  zindex = i / (gridSize * gridSize);
#endif
  ivec3 localGridID = ivec3(i % gridSize, (i / gridSize) % gridSize, zindex);
  return (gridSize * gridOffset) + localGridID;
}

// in the second pass, write counts to the state image
void writeCounts(in ivec2 seg, in int offset, in ivec3 gridOffset) {
  for (int i = seg.s; i < seg.t; i++) {
    ivec4 cval = ivec4(counts[i], totals[i] + offset, gridOffset.x, gridOffset.y);
    imageStore(imgPositionCount, gridIndex(i, gridOffset), cval);
  }
}

// in the second pass, get the segment that this thread will count
ivec2 positionSegment(in int threadIndex, in int offset, in int count) {
  int workSize = count / int(GROUP_SIZE);
  int rem = count % int(GROUP_SIZE);
  int startIndex = workSize * threadIndex;
  if (threadIndex < rem) {
    workSize += 1;
    startIndex += threadIndex;
  } else {
    startIndex += rem;
  }
  int endIndex = startIndex + workSize;
  return ivec2(startIndex + offset, endIndex + offset);
}

#endif

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

ivec2 gridSegment(in int threadIndex) {
  int countSize = int(GRID_COUNT);
  int workSize = countSize / int(GROUP_SIZE);
  int startIndex = threadIndex * workSize;
  int endIndex = startIndex + workSize;
  return ivec2(startIndex, endIndex);
}

void main () {
  int threadIndex = int(gl_LocalInvocationID.x);

#ifdef FIRST_PASS

  ivec2 posSeg = positionSegment(threadIndex);

#elif defined(SECOND_PASS)

  ivec3 wgid = ivec3(gl_WorkGroupID);
  ivec3 nwg = ivec3(gl_NumWorkGroups);
  int workIndex = wgid.x + nwg.x * wgid.y + nwg.x * nwg.y * wgid.z;
  ivec2 cellCount = positionCount[workIndex].xy;
  int offset = cellCount.y - cellCount.x;
  
  float cellSize = 2. / float(PARENT_GRID_SIZE);
  vec3 cellStart = cellSize * vec3(wgid) - 1.;

  ivec2 posSeg = positionSegment(threadIndex, offset, cellCount.x);

#endif

  ivec2 gridSeg = gridSegment(threadIndex);

  initSharedMemory(gridSeg, threadIndex);
  memoryBarrierShared();
  barrier();
  
#ifdef FIRST_PASS
  countPositions(posSeg);
#elif defined(SECOND_PASS)
  countPositions(posSeg, cellStart, wgid);
#endif
  memoryBarrierShared();
  barrier();

  totalCounts(gridSeg, threadIndex);
  memoryBarrierShared();
  barrier();

  int totalOffset = subtotalOffset(threadIndex);
  memoryBarrierShared();
  barrier();

  applySubtotalOffset(gridSeg, totalOffset);
  memoryBarrierShared();
  barrier();

#ifdef FIRST_PASS
  sortPositions(posSeg);
#elif defined(SECOND_PASS)
  sortPositions(posSeg, cellStart, wgid, offset);
#endif
  memoryBarrierShared();
  barrier();

#ifdef FIRST_PASS
  writeCounts(gridSeg);
#elif defined(SECOND_PASS)
  writeCounts(gridSeg, offset, wgid);
#endif
  memoryBarrierShared();
  barrier();
}
`;
  return new ShaderConfig(countingShaderSrc, gl.COMPUTE_SHADER);
};

class ComputeTarget extends RenderTarget {
  public use() {}
  public setView() {}
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
  private firstCountPass: Graphics;
  private secondCountPass: Graphics;
  private thresholdGfx: Graphics;

  private ssboSortedPositions: ShaderStorageBuffer;
  private ssboPositionCounts: ShaderStorageBuffer;

  private workGroupSize = 256;
  private fpGridSize: number;

  constructor(
    private gl: WebGL2ComputeRenderingContext,
    private textures: Textures,
    private threshold: Threshold,
    private stateSize: StateSize,
    gridSize: number,
    private mode: PPSMode
  ) {
    this.workGroupSize = 16 * gridSize;
    const workGroupSize = this.workGroupSize;
    const ss = stateSize.width * stateSize.height;
    if (ss % workGroupSize !== 0) {
      throw new Error(
        `stateSize x*y ${ss} must be divisible by ${workGroupSize}`
      );
    }
    let gg = Math.pow(gridSize, mode === "2D" ? 2 : 3);
    if (gg % workGroupSize !== 0) {
      throw new Error(
        `gridSize**2 ${gg} must be divisible by ${workGroupSize}`
      );
    }

    const fpGridSize = Math.pow(2, Math.floor(Math.log2(gridSize) / 2));
    const spGridSize = Math.pow(2, Math.ceil(Math.log2(gridSize) / 2));
    this.fpGridSize = fpGridSize;

    // the gl.STATIC_COPY hint means write once, then its gpu internal
    let data = new Int32Array(4 * TEX_WIDTH * TEX_WIDTH);
    this.ssboSortedPositions = new ShaderStorageBuffer(
      gl,
      data,
      gl.STATIC_COPY
    );
    data = new Int32Array(4 * gg);
    this.ssboPositionCounts = new ShaderStorageBuffer(gl, data, gl.STATIC_COPY);

    const tgt = new ComputeTarget();
    let shaders = [
      countingShader(gl, fpGridSize, workGroupSize, "FIRST", mode),
    ];
    let gfx = new Graphics(
      gl,
      tgt,
      shaders,
      this.onComputeFirstPass.bind(this)
    );
    this.firstCountPass = gfx;

    gfx.attachUniform("uStateSize", (l, v: StateSize) =>
      gl.uniform2i(l, v.width, v.height)
    );

    const swgSize = workGroupSize / Math.pow(fpGridSize, mode === "2D" ? 2 : 3);
    shaders = [
      countingShader(gl, spGridSize, swgSize, "SECOND", mode, fpGridSize),
    ];
    gfx = new Graphics(gl, tgt, shaders, this.onComputeSecondPass.bind(this));
    this.secondCountPass = gfx;

    gfx.attachUniform("uStateSize", (l, v: StateSize) =>
      gl.uniform2i(l, v.width, v.height)
    );

    shaders = [thresholdShader(gl, gridSize, mode)];
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

  private onComputeFirstPass() {
    const gl = this.gl;

    // 1. Bind textures to image buffers
    this.textures.position.bindImage(0, gl.READ_ONLY);
    this.ssboSortedPositions.bind(1);
    this.ssboPositionCounts.bind(2);

    // 2. Bind buffers and uniform
    this.firstCountPass.bindUniform("uStateSize", this.stateSize);

    // 3. Execute compute shader
    gl.dispatchCompute(1, 1, 1);
  }

  private onComputeSecondPass() {
    const { gl, fpGridSize } = this;

    this.ssboSortedPositions.bind(0);
    this.ssboPositionCounts.bind(1);
    this.textures.sortedPosition.bindImage(2, gl.WRITE_ONLY);
    this.textures.positionCount.bindImage(3, gl.WRITE_ONLY);

    this.secondCountPass.bindUniform("uStateSize", this.stateSize);

    gl.dispatchCompute(
      fpGridSize,
      fpGridSize,
      this.mode === "2D" ? 1 : fpGridSize
    );
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

    this.firstCountPass.render(false);

    gl.memoryBarrier(gl.SHADER_STORAGE_BARRIER_BIT);

    this.secondCountPass.render(false);

    gl.memoryBarrier(
      gl.SHADER_STORAGE_BARRIER_BIT |
        gl.SHADER_IMAGE_ACCESS_BARRIER_BIT |
        gl.TEXTURE_UPDATE_BARRIER_BIT |
        gl.TEXTURE_FETCH_BARRIER_BIT
    );

    this.thresholdGfx.render(false);
  }
}
