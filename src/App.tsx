import React, { useRef, useEffect, useState } from 'react';
import './App.css';
import { WarpGrid } from './display';
import { AudioProcessor, AudioProcessorParams } from './audio';
import { Renderer, RenderParams } from './render';
import PixelMap, { RGBA } from "./pixelmap";

let count = 0
const buckets = 16
const length = 60

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [start, setStart] = useState<boolean>()

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return

    if (!start) return

    const audio = new AudioProcessor(1024, 256, buckets, length,
      new AudioProcessorParams(
        2,
        new Float32Array([.1, .9]),
        new Float32Array([.005, .995]),
        new Float32Array([.2, .8]),
        new Float32Array([.01, .99]),
        new Float32Array([.01, .99, .001, .999]),
        .2,
        2,
        -1,
        1e-2,
      ))

    const render = new Renderer(length, buckets,
      new RenderParams(
        2, //valueScale,
        -1, //valueOffset,
        .75, //satScale,
        0, //satOffset,
        4, //warpScale,
        .5, //warpOffset,
        .5, //scaleScale,
        .5, //scaleOffset,
        3 * 60, //period
      ))

    // window.framecount = 0
    const wg = new WarpGrid(cv, buckets * 2, length * 2, async (wg: WarpGrid) => {
      const drivers = audio.getDrivers()
      // console.log(drivers)

      const [display, warp, scale] = render.render(drivers)

      const mwarp = new Float32Array(warp.length * 2)
      const wo = warp.length
      for (let i = 0; i < wo; i++) {
        mwarp[wo + i] = warp[i]
        mwarp[wo - 1 - i] = warp[i]
      }
      wg.setWarp(mwarp)

      const mscale = new Float32Array(scale.length * 2)
      const so = scale.length
      for (let i = 0; i < so; i++) {
        mscale[so + i] = scale[i]
        mscale[so - 1 - i] = scale[i]
      }
      wg.setScale(mscale)

      const xo = display.width
      const yo = display.height
      // const pix = new PixelMap(display)
      for (let x = 0; x < display.width; x++) {
        for (let y = 0; y < display.height; y++) {
          const idx = 4 * (x + display.width * y)
          const c = display.data.slice(idx, idx + 4)
          wg.setPixelSlice(xo + x, yo + y, c)
          wg.setPixelSlice(xo - 1 - x, yo + y, c)
          wg.setPixelSlice(xo + x, yo - 1 - y, c)
          wg.setPixelSlice(xo - 1 - x, yo - 1 - y, c)
        }
      }
      // for (let x = 0; x < wg.columns; x++) {
      //   for (let y = 0; y < wg.rows; y++) {
      //     wg.setPixel(x, y, (x + y) % 2 === 0 ? new RGBA(255, 255, 255, 255) : new RGBA(0, 0, 0, 0))
      //   }
      // }

    })
  }, [start])


  return (
    <div className="App" //onMouseMove={start ? undefined : () => setStart(true)}
      style={{ width: '100hv', height: '100vh' }}>
      {(start ?
        <canvas
          ref={canvasRef}
          style={{ width: '100hv', height: '100vh' }}
        />
        :
        <button onClick={() => setStart(true)}>Start</button>
      )}
    </div>
  );
}

export default App;
