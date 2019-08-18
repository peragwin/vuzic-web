declare module 'fft.js';

declare class FFT {
    constructor(size: number);

    public createComplexArray(): Array
    public realTransform(out: Float32Array, frame: Float32Array): void;
}
