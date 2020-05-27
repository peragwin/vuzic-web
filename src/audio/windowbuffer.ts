
export class WindowBuffer {
    private buffer: Float32Array
    private index = 0
  
    constructor(
      readonly capacity: number,
    ) {
      this.buffer = new Float32Array(capacity).fill(0)
    }
  
    public push(x: Float32Array) {
      if (x.length > this.buffer.length) throw new Error("cannot push size greater than capacity")
  
      let wrap = false
      let en = this.index + x.length
      if (en > this.buffer.length) {
        en = this.buffer.length
        wrap = true
      }
  
      for (let i = this.index; i < en; i++) {
        this.buffer[i] = x[i - this.index]
      }
      if (wrap) {
        const os = this.buffer.length - this.index
        for (let i = 0; i < x.length - os; i++) {
          this.buffer[i] = x[i + os]
        }
      }
  
      this.index = (this.index + x.length) % this.capacity
    }
  
    public get(size: number) {
      if (size > this.capacity) throw new Error("cannot get size greater than capacity")
  
      const out = new Float32Array(size).fill(0)
  
      let wrap = false
      let st = this.index - size
      let en = this.index
      if (st < 0) {
        st = this.capacity + st
        en = this.capacity
        wrap = true
      }
  
      for (let i = st; i < en; i++) {
        out[i - st] = this.buffer[i]
      }
      if (wrap) {
        const os = en - st
        for (let i = 0; i < this.index; i++) {
          out[i + os] = this.buffer[i]
        }
      }
  
      return out
    }
  }
  