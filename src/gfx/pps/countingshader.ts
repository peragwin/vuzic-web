import { ShaderConfig } from "../graphics";

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

layout (std140, binding = 0) buffer ivec2 bufPositions[];
layout (std140, binding = 1) buffer ivec2 bufSortedPositions[];
layout (std140, binding = 2) buffer ivec2 bufPositionCounts[];

shared int counts[${gridSize * gridSize}];
shared int totals[${gridSize * gridSize}];
shared int subTotals[GROUP_SIZE];

int positionToIndex(in int index) {
  ivec2 pi = bufPositions[index];
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
    bufSortedPositions[total] = bufPositions[i];
  }
}

void writeCounts(in ivec2 seg, in int threadIndex) {
  for (int i = seg.s; i < seg.t; i++) {
    bufPositionCounts[i] = ivec2(counts[i], totals[i]);
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

interface StateSize {
  width: number;
  height: number;
}

export class CountingSortComputer {
  constructor(
    private gl: WebGL2ComputeRenderingContext,
    private stateSize: StateSize
  ) {}
}
