import React, { useRef, useEffect } from 'react';
import './App.css';
import { WarpGrid } from './display';
import { AudioProcessor, AudioProcessorParams } from './audio';
import { Renderer, RenderParams } from './render';
import PixelMap from "./pixelmap";

let count = 0

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return

    const audio = new AudioProcessor(1024, 1024, 36, 60,
      new AudioProcessorParams(
        2,
        new Float32Array([.1, .9]),
        new Float32Array([.005, .995]),
        new Float32Array([.2, .8]),
        new Float32Array([.01, .99]),
        new Float32Array([.01, .99, .001, .999]),
        .1,
        2,
        0,
        1e-2,
      ))

    const render = new Renderer(60, 36,
      new RenderParams(
        1, 0, .6, 0, 1, .5, .5, .75, 6 * 60,
      ))

    // window.framecount = 0
    const wg = new WarpGrid(cv, 36*2, 60*2, (wg: WarpGrid) => {
      const drivers = audio.process()
      // console.log(drivers)

      const display = render.render(drivers)
      const xo = display.width
      const yo = display.height
      const pix = new PixelMap(display)
      for (let x = 0; x < display.width; x++) {
        for (let y = 0; y < display.height; y++) {
          const c = pix.at(x, y)
          wg.setPixel(xo + x, yo + y, c)
          wg.setPixel(xo - 1 - x, yo + y, c)
          wg.setPixel(xo + x, yo - 1 - y, c)
          wg.setPixel(xo - 1 - x, yo - 1 - y, c)
        }
      }

    })
  })


  return (
    <div className="App">
      <canvas
        ref={canvasRef}
        style={{ width: '100hv', height: '100vh' }}
      />
    </div>
  );
}

export default App;
