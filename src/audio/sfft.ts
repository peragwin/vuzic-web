import FFT from "fft.js";
import { WindowBuffer } from "./windowbuffer";

function blackmanHarris(i: number, N: number) {
  const a0 = 0.35875,
    a1 = 0.48829,
    a2 = 0.14128,
    a3 = 0.01168,
    f = (6.283185307179586 * i) / (N - 1);

  return a0 - a1 * Math.cos(f) + a2 * Math.cos(2 * f) - a3 * Math.cos(3 * f);
}

export class SlidingFFT {
  private buffer: WindowBuffer;
  private fft: FFT;
  private window: Float32Array;

  private lastTime = 0;

  constructor(readonly frameSize: number, readonly fftSize: number) {
    this.buffer = new WindowBuffer(fftSize);
    this.fft = new FFT(fftSize);
    this.window = new Float32Array(fftSize).fill(0);
    for (let i = 0; i < fftSize; i++) {
      this.window[i] = blackmanHarris(i, fftSize);
    }
  }

  public process(input: Float32Array) {
    // const ts = e.timeStamp
    // console.log("fps:", 1000 / (ts - this.lastTime), ts)
    // this.lastTime = ts

    // const input = e.inputBuffer.getChannelData(0)
    this.buffer.push(input);

    const frame = this.buffer.get(this.fftSize);
    for (let i = 0; i < this.fftSize; i++) {
      frame[i] *= this.window[i];
    }

    const out = this.fft.createComplexArray(); //new Float32Array(this.fftSize/2).fill(0)
    this.fft.realTransform(out, frame);

    // const output = e.outputBuffer.getChannelData(0)
    const output = new Float32Array(this.fftSize / 2);
    for (let i = 0; i < this.fftSize; i += 2) {
      const v = Math.sqrt(out[i] * out[i] + out[i + 1] * out[i + 1]);
      output[i / 2] = Math.log2(1 + v);
    }

    return output;
  }
}
