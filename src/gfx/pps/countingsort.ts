import { PPSMode, PPS } from "./pps";
import { CountingSortComputer } from "./countingshader";

const fromSpace = (x: number) => (x + 1) / 2;

type SortFunc = (
  p: Float32Array
) => { count: Int32Array; output: Float32Array };

export class CountingSort {
  private computeShader: CountingSortComputer | null = null;
  private sort: SortFunc;
  private frameCount = 0;

  constructor(
    useShader: boolean,
    private pps: PPS,
    mode: PPSMode,
    private gridSize: number
  ) {
    this.sort = countingSort(gridSize, 4, mode);

    if (!useShader) return;

    this.computeShader = new CountingSortComputer(
      pps.gl as WebGL2ComputeRenderingContext,
      {
        position: pps.state.positions[0],
        sortedPosition: pps.state.sortedPositions,
        positionCount: pps.state.countedPositions,
      },
      {
        radius: pps.params.radius,
        buffer: pps.state.uColorThresholds.buffer,
      },
      pps.stateSize,
      gridSize,
      mode
    );
  }

  public init() {
    const { pps } = this;
    if (this.computeShader) {
      this.computeShader.update(
        pps.stateSize,
        {
          position: pps.state.positions[0],
          sortedPosition: pps.state.sortedPositions,
          positionCount: pps.state.countedPositions,
        },
        {
          radius: pps.params.radius,
          buffer: pps.state.uColorThresholds.buffer,
        }
      );
    }
  }

  public calculateSortedPositions() {
    const cs = this.computeShader;

    if (cs) {
      const { positions } = this.pps.state.getActive();
      cs.update(
        this.pps.stateSize,
        {
          position: positions,
          sortedPosition: this.pps.state.sortedPositions,
          positionCount: this.pps.state.countedPositions,
        },
        {
          radius: this.pps.params.radius,
          buffer: this.pps.state.uColorThresholds.buffer,
        }
      );

      cs.compute();
      const gl = this.pps.gl as WebGL2ComputeRenderingContext;
      gl.memoryBarrier(
        gl.SHADER_STORAGE_BARRIER_BIT |
          gl.SHADER_IMAGE_ACCESS_BARRIER_BIT |
          gl.TEXTURE_UPDATE_BARRIER_BIT |
          gl.TEXTURE_FETCH_BARRIER_BIT
      );

      return;
    }

    const gl = this.pps.gl;
    const { width, height } = this.pps.stateSize;
    const particles = width * height;
    const { frameBuffer, positions } = this.pps.state.getActive();

    // attach the src position texture to the buffer so we can read it
    frameBuffer.attach(positions, 0);
    frameBuffer.bind();

    const pbuf = new ArrayBuffer(particles * 4 * 4);
    const pdata = new Float32Array(pbuf);
    const idata = new Int32Array(pbuf);
    frameBuffer.readData(idata, 0, gl.RGBA_INTEGER, gl.INT);

    const sort = this.sort(pdata);
    const output = new Int32Array(sort.output.buffer);
    this.pps.state.writeSortedPositions(
      { ...sort, output },
      this.pps.stateSize,
      this.gridSize
    );

    if (++this.frameCount % 4 === 0) {
      this.updateColorThresholds(sort.count);
    }
    // if (this.frameCount % 640 === 0) {
    //   console.log(sort);
    // }
  }

  private updateColorThresholds(count: Int32Array) {
    const [mean, std] = getCountStatistics(count, this.gridSize);
    const cellsInRadius = Math.ceil(this.pps.params.radius * this.gridSize);
    const thresholds = getColorThresholds(mean, std, cellsInRadius);
    this.pps.state.uColorThresholds.update([new Float32Array(thresholds)]);
  }
}

// countingSort implemetns a counting sort algorithm for a given grid size.
// @input is Float32Array of vec2(x,y) pairs normalized in the range [-1, 1].
// @output is an Int32Array of ivec(count, startIndex+count) pairs and
// the sorted Float32Array of vec2(x,y) pairs.
const countingSort = (
  size: number,
  stride: number = 4,
  mode: PPSMode = "2D"
): SortFunc => {
  let index = (w: number, h: number, z: number) => {
    w = fromSpace(w);
    h = fromSpace(h);
    w = Math.floor(w * size);
    h = Math.floor(h * size);
    return w + size * h;
  };
  if (mode === "3D") {
    index = (w: number, h: number, z: number) => {
      w = fromSpace(w);
      h = fromSpace(h);
      z = fromSpace(z);
      w = Math.floor(w * size);
      h = Math.floor(h * size);
      z = Math.floor(z * size);
      return w + size * h + size * size * z;
    };
  }
  const k = size * size * (mode === "2D" ? 1 : size);

  return (positions: Float32Array) => {
    const count = new Int32Array(stride * k);

    for (let i = 0; i < positions.length; i += stride) {
      const p = positions.slice(i, i + 3);
      count[stride * index(p[0], p[1], p[2])] += 1;
    }

    let total = 0;
    for (let i = 0; i < k; i++) {
      const c = count[stride * i];
      count[stride * i + 1] = total;
      total += c;
    }

    const output = new Float32Array(positions.length);

    for (let i = 0; i < positions.length; i += stride) {
      const p = positions.slice(i, i + 3);
      const j = stride * index(p[0], p[1], p[2]) + 1;
      const x = count[j];
      output.set(p, stride * x);
      count[j] = x + 1;
    }

    return { count, output };
  };
};

// const test = () => {
//   const test = new Float32Array(256);
//   test.forEach((_, i, test) => (test[i] = 2 * Math.random() - 1));
//   const sorted = countingSort(4, 4, true)(test);
//   console.log(sorted);
// };

// test();

function getCountStatistics(countData: Int32Array, gridSize: number) {
  let sum = 0;
  for (let i = 0; i < countData.length; i += 4) {
    const c = countData[i];
    sum += c;
  }

  const mean = (sum / countData.length) * 4;

  sum = 0;
  for (let i = 0; i < countData.length; i += 4) {
    let dev = countData[i] - mean;
    sum += dev * dev;
  }

  const std = Math.sqrt((sum / countData.length) * 4);

  return [mean, std];
}

function getColorThresholds(mean: number, std: number, cellsInRadius: number) {
  const c3 = cellsInRadius * cellsInRadius * cellsInRadius;
  const particlesInRadius = mean * c3;
  const dev = std * c3;

  let thresholds = [];
  for (let i = 0; i < 5; i++) {
    const d = ((-1.0 + i) * dev) / 4;
    thresholds.push(d + particlesInRadius);
  }

  const t0 = thresholds[0];
  if (t0 < 0) {
    thresholds = thresholds.map((x) => x - t0);
  }

  return thresholds;
}
