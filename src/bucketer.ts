
export class Bucketer {
    private indices: Array<number>
  
    constructor(
      readonly inputSize: number,
      readonly buckets: number,
      readonly fMin: number,
      readonly fMax: number,
    ) {
      const sMin = this.toLogScale(fMin)
      const sMax = this.toLogScale(fMax)
      const space = (sMax - sMin) / buckets
      const indices = new Array<number>(buckets - 1)
  
      let lastIdx = 0
      let offset = 1
      const offsetDelta = (sMax - sMin) / inputSize
  
      for (let i = 0; i < indices.length; i++) {
        const adjSpace = space - offsetDelta * offset / buckets
  
        const v = this.fromLogScale((i + 1) * adjSpace + sMin + offsetDelta * offset)
        let idx = Math.ceil(inputSize * v / fMax)
  
        if (idx <= lastIdx) {
          idx = lastIdx + 1
          offset++
        }
        if (idx >= inputSize) {
          idx = inputSize - 1
        }
  
        indices[i] = idx
        lastIdx = idx
      }
  
      this.indices = indices
    }
  
    private toLogScale(x: number) {
      return Math.log2(1 + x)
    }
  
    private fromLogScale(x: number) {
      return 2 ** (x) + 1
    }
  
    public bucket(input: Float32Array) {
      // const input = e.inputBuffer.getChannelData(0)
      // const output = e.outputBuffer.getChannelData(0)
      const output = new Float32Array(this.buckets)
  
      for (let i = 0; i < this.buckets; i++) {
        let start = (i === 0) ? 0 : this.indices[i - 1]
        let stop = (i === this.buckets - 1) ? input.length : this.indices[i]
  
        let sum = 0
        for (let j = start; j < stop; j++) {
          sum += input[j]
        }
  
        output[i] = sum / (stop - start)
      }
  
      return output
    }
  }
  