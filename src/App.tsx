import React, { useRef, useEffect } from 'react';
import './App.css';
import { WarpGrid } from './display';
import { RGBA } from './pixelmap';

let count = 0

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    // window.framecount = 0
    const wg = new WarpGrid(cv, 32, 120, (wg: WarpGrid) => {
      count++
      for (let x = 0; x < 120; x++) {
        for (let y = 0; y < 32; y++) {
          wg.setPixel(x, y,
            new RGBA(
              (2 * count + (x * y / 10000)) % 255,
              (4 * count + (x * y / 20000)) % 255,
              (6 * count + (x * y / 30000)) % 255,
              255,
            ))
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
