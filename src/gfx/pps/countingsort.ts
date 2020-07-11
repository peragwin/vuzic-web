const fromSpace = (x: number) => (x + 1) / 2;

// const fixNaN = (x: number) => (Number.isNaN(x) ? 0 : x);

export type CountingSorter = (
  p: Float32Array
) => { count: Int32Array; output: Float32Array };

// countingSort implemetns a counting sort algorithm for a given grid size.
// @input is Float32Array of vec2(x,y) pairs normalized in the range [-1, 1].
// @output is an Int32Array of ivec(count, startIndex+count) pairs and
// the sorted Float32Array of vec2(x,y) pairs.
export const countingSort = (size: number, stride: number = 4) => {
  const index = (w: number, h: number, z: number) => {
    w = fromSpace(w);
    h = fromSpace(h);
    z = fromSpace(z);
    w = Math.floor(w * size);
    h = Math.floor(h * size);
    z = Math.floor(z * size);
    return w + size * h + size * size * z;
  };
  const k = size * size * size;

  return (positions: Float32Array) => {
    const count = new Int32Array(stride * k);

    for (let i = 0; i < positions.length; i += stride) {
      const p = positions.slice(i, i + 3); //.map(fixNaN);
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
      const p = positions.slice(i, i + 3); //.map(fixNaN);
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
