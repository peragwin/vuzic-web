
export class RGBA {
  constructor(
    public r: number,
    public g: number,
    public b: number,
    public a: number,
  ) { }
}

class PixelMap {
  constructor(readonly imageData: ImageData) { }

  public at(x: number, y: number) {
    if (y < 0 || y >= this.imageData.height ||
      x < 0 || x >= this.imageData.width) {
      throw new RangeError('Pixel index out of bounds');
    }

    return this.atIndex(y * this.imageData.width + x);
  }

  public atIndex(pixelIndex: number): RGBA {
    if (pixelIndex < 0 || pixelIndex >= this.imageData.width * this.imageData.height) {
      throw new RangeError('Pixel index out of bounds');
    }

    const data = this.imageData.data;
    const dataIndex = pixelIndex * 4;

    return {
      // Red
      get r() {
        return data[dataIndex + 0];
      },
      set r(val) {
        data[dataIndex + 0] = val;
      },

      // Green
      get g() {
        return data[dataIndex + 1];
      },
      set g(val) {
        data[dataIndex + 1] = val;
      },

      // Blue
      get b() {
        return data[dataIndex + 2];
      },
      set b(val) {
        data[dataIndex + 2] = val;
      },

      // Alpha
      get a() {
        return data[dataIndex + 3];
      },
      set a(val) {
        data[dataIndex + 3] = val;
      },
    }
  }
}

export default PixelMap;