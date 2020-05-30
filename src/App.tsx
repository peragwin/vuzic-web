import React, { useRef, useEffect, useState, useReducer } from 'react';
import './App.css';
import { WarpGrid } from './gfx/warpgrid/display';
import { AudioProcessor, AudioProcessorParams, audioParamReducer } from './audio/audio';
import { Renderer, RenderParams, renderParamReducer } from './gfx/warpgrid/render';
import { makeStyles } from '@material-ui/core';
import Button from '@material-ui/core/Button';
import MenuPanel from './components/MenuPanel'
import { PPS } from './gfx/pps/pps';

const useStyles = makeStyles({
  button: {
    background: 'linear-gradient(45deg, #FE6B8B 30%, #FF8E53 90%)',
    border: 0,
    borderRadius: 3,
    boxShadow: '0 3px 5px 2px rgba(255, 105, 135, .3)',
    color: 'white',
    height: 48,
    padding: '0 30px',
  },
  app: {
    background: 'linear-gradient(135deg, #45484d 0%,#000000 100%)',
    minHeight: '100vh',
    minWidth: '100vw',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 'calc(10px + 2vmin)',
    color: 'white',
  },
  canvas: { width: '100vw', height: '100vh' },
});

const buckets = 32
const length = 120

const renderParamsInit = new RenderParams(
  2, //valueScale,
  0, //valueOffset,
  .88, //satScale,
  0, //satOffset,
  1, // alphaScale
  .25, // alphaOffset
  16, //warpScale,
  1.35, //warpOffset,
  2.26, //scaleScale,
  .45, //scaleOffset,
  3 * 60, //period
  .00001, // colorCycle
)

const audioParamsInit = new AudioProcessorParams(
  2, //preemph
  { tao: 2.924, gain: 1 }, // gain filter params
  { tao: 138, gain: -1 }, // gain feedback params
  { tao: 10.5, gain: 1 }, // diff filter params
  { tao: 56.6, gain: -.05 }, // diff feedback param
  { tao: 69, gain: 1 }, // pos value scale params
  { tao: 693, gain: 1 }, // neg value scale params
  1.3, //diffGain
  1.2, // amp scale
  0, //amp offset
  1e-2, //sync
  .35, // decay
)

type VisualOptions = 'warp' | 'pps';

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [renderParams, updateRenderParam] = useReducer(
    renderParamReducer,
    renderParamsInit)
  const [audioParams, updateAudioParam] = useReducer(
    audioParamReducer,
    audioParamsInit)

  const [start, setStart] = useState<boolean>()
  const [visual, setVisual] = useState<VisualOptions>('pps');

  const renderer = useRef<Renderer | null>(null)
  const audioProcessor = useRef<AudioProcessor | null>(null)

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return

    if (!start) return

    audioProcessor.current = new AudioProcessor(1024, 512, buckets, length, audioParams)

    renderer.current = new Renderer(length, buckets, renderParams)

    if (visual === 'warp') {
      new WarpGrid(cv, buckets * 2, length * 2, 4 / 3, (wg: WarpGrid) => {
        if (!audioProcessor.current) return
        const drivers = audioProcessor.current.getDrivers()
        // console.log(drivers)

        if (!renderer.current) return
        const [display, warp, scale] = renderer.current.render(drivers)

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

      })
    } else if (visual === 'pps') {
      new PPS(cv, 128);
    }
  })

  useEffect(() => {
    if (renderer.current)
      renderer.current.setRenderParams(renderParams)
  }, [renderParams])

  useEffect(() => {
    if (audioProcessor.current)
      audioProcessor.current.setAudioParams(audioParams)
  }, [audioParams])

  const classes = useStyles()

  return (
    <div className={classes.app}>
      {(start ?
        <div>
          <MenuPanel renderParams={renderParams} updateRenderParam={updateRenderParam} audioParams={audioParams} updateAudioParam={updateAudioParam} canvas={canvasRef} />
          <canvas ref={canvasRef} className={classes.canvas} onDoubleClick={e => e.currentTarget.requestFullscreen()} />
        </div>
        :
        <div>
          <Button className={classes.button} onClick={() => setStart(true)}>Start</Button>
        </div>
      )}
    </div>
  );
}

export default App;
