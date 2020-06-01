import React, { useRef, useEffect, useState, useReducer } from "react";

import { WarpGrid } from "./gfx/warpgrid/display";
import {
  AudioProcessor,
  AudioProcessorParams,
  audioParamReducer,
} from "./audio/audio";
import {
  RenderParams as WarpInitRenderParams,
  renderParamReducer as warpRenderParamReducer,
  WarpRenderer,
  WarpRenderParams,
} from "./gfx/warpgrid/render";
import { PPS, defaultParams as ppsDefaultParams } from "./gfx/pps/pps";
import { PpsRenderParams, ppsRenderParamsReducer } from "./gfx/pps/params";
import { RenderController } from "./gfx/renderconfig";

import "./App.css";
import { makeStyles } from "@material-ui/core";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import Button from "@material-ui/core/Button";
import MenuPanel from "./components/MenuPanel";

const useStyles = makeStyles({
  button: {
    background: "linear-gradient(45deg, #FE6B8B 30%, #FF8E53 90%)",
    border: 0,
    borderRadius: 3,
    boxShadow: "0 3px 5px 2px rgba(255, 105, 135, .3)",
    color: "white",
    height: 48,
    padding: "0 30px",
  },
  app: {
    background: "linear-gradient(135deg, #45484d 0%,#000000 100%)",
    minHeight: "100vh",
    minWidth: "100vw",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "calc(10px + 2vmin)",
    color: "white",
  },
  errorDisplay: {
    background: "linear-gradient(-180deg, #CFC5B4 0%,#ab7a4752 267%)",
    padding: "2em",
  },
  errorMessage: {
    lineHeight: 1.5,
    letterSpacing: "0.00938em",
  },
  canvas: { width: "100vw", height: "100vh" },
});

const buckets = 32;
const length = 120;

const warpRenderParamsInit = new WarpInitRenderParams(
  2, //valueScale,
  0, //valueOffset,
  0.88, //satScale,
  0, //satOffset,
  1, // alphaScale
  0.25, // alphaOffset
  16, //warpScale,
  1.35, //warpOffset,
  2.26, //scaleScale,
  0.45, //scaleOffset,
  3 * 60, //period
  0.00001 // colorCycle
);

const audioParamsInit = new AudioProcessorParams(
  2, //preemph
  { tao: 2.924, gain: 1 }, // gain filter params
  { tao: 138, gain: -1 }, // gain feedback params
  { tao: 10.5, gain: 1 }, // diff filter params
  { tao: 56.6, gain: -0.05 }, // diff feedback param
  { tao: 69, gain: 1 }, // pos value scale params
  { tao: 693, gain: 1 }, // neg value scale params
  1.3, //diffGain
  1.2, // amp scale
  0, //amp offset
  1e-2, //sync
  0.35 // decay
);

type VisualOptions = "warp" | "pps";

type CanvasCapture = HTMLCanvasElement & { capture: string };

interface WakeLock {
  release(): void;
}

interface WakeLocker {
  wakeLock: {
    request(req: string): Promise<WakeLock>;
  };
}

const supportsWakelock = (nav: Navigator): nav is Navigator & WakeLocker => {
  const wn = nav as Navigator & WakeLocker;
  return wn.wakeLock !== undefined && wn.wakeLock.request !== undefined;
};

const App: React.FC = () => {
  const canvasRef = useRef<CanvasCapture>(null);

  const [warpRenderParams, updateWarpRenderParam] = useReducer(
    warpRenderParamReducer,
    warpRenderParamsInit
  );

  const [ppsRenderParams, updatePpsRenderParam] = useReducer(
    ppsRenderParamsReducer,
    ppsDefaultParams
  );

  const [audioParams, updateAudioParam] = useReducer(
    audioParamReducer,
    audioParamsInit
  );

  const [start, setStart] = useState<boolean>();
  const [visual, setVisual] = useState<VisualOptions>("pps");
  const renderControllerInit = ((): RenderController => {
    switch (visual) {
      case "warp":
        return new WarpRenderParams(warpRenderParams, updateWarpRenderParam);
      case "pps":
        return new PpsRenderParams(ppsRenderParams, updatePpsRenderParam);
    }
  })();

  const renderController = useRef(renderControllerInit);
  const audioProcessor = useRef<AudioProcessor | null>(null);
  const [errorState, setErrorState] = useState<Error | null>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;

    if (!start) return;

    audioProcessor.current = new AudioProcessor(
      1024,
      512,
      buckets,
      length,
      audioParams
    );

    renderController.current = renderControllerInit;

    try {
      switch (visual) {
        case "warp":
          new WarpGrid(cv, buckets * 2, length * 2, 4 / 3, (wg: WarpGrid) => {
            if (!(renderController.current instanceof WarpRenderer)) return;
            const params = renderController.current.params;
            const renderer = new WarpRenderer(length, buckets, params);

            if (!audioProcessor.current) return;
            const drivers = audioProcessor.current.getDrivers();

            const [display, warp, scale] = renderer.render(drivers);

            const mwarp = new Float32Array(warp.length * 2);
            const wo = warp.length;
            for (let i = 0; i < wo; i++) {
              mwarp[wo + i] = warp[i];
              mwarp[wo - 1 - i] = warp[i];
            }
            wg.setWarp(mwarp);

            const mscale = new Float32Array(scale.length * 2);
            const so = scale.length;
            for (let i = 0; i < so; i++) {
              mscale[so + i] = scale[i];
              mscale[so - 1 - i] = scale[i];
            }
            wg.setScale(mscale);

            const xo = display.width;
            const yo = display.height;
            for (let x = 0; x < display.width; x++) {
              for (let y = 0; y < display.height; y++) {
                const idx = 4 * (x + display.width * y);
                const c = display.data.slice(idx, idx + 4);
                wg.setPixelSlice(xo + x, yo + y, c);
                wg.setPixelSlice(xo - 1 - x, yo + y, c);
                wg.setPixelSlice(xo + x, yo - 1 - y, c);
                wg.setPixelSlice(xo - 1 - x, yo - 1 - y, c);
              }
            }
          });

          break;

        case "pps":
          new PPS(cv, (p: PPS) => {
            if (!(renderController.current instanceof PpsRenderParams)) return;
            const params = renderController.current;
            p.setParams(params.params);
          });

          break;
      }
    } catch (e) {
      setErrorState(e);
    }
  }, [start, visual]);

  useEffect(() => {
    const rc = (renderController.current = renderControllerInit);
    if (rc instanceof WarpRenderer) {
      rc.setRenderParams(warpRenderParams);
    }
  }, [warpRenderParams, ppsRenderParams]);

  useEffect(() => {
    if (audioProcessor.current) {
      audioProcessor.current.setAudioParams(audioParams);
    }
  }, [audioParams]);

  const classes = useStyles();

  const [wakelockEnabled, setWakelockEnabled] = useState(true); // TODO: use setWakelockEnabled
  const wakelockListenters = useRef<{ fullscreen: any; visibility: any }>({
    fullscreen: null,
    visibility: null,
  });

  useEffect(() => {
    if (!wakelockEnabled) {
      const { fullscreen, visibility } = wakelockListenters.current;
      document.removeEventListener("fullscreenchange", fullscreen);
      document.removeEventListener("visibilitychange", visibility);
      return;
    }

    const state: { wakelock: WakeLock | null } = { wakelock: null };

    const handleChange = async (acquire: boolean) => {
      if (acquire) {
        if (supportsWakelock(navigator)) {
          try {
            state.wakelock = await navigator.wakeLock.request("screen");
            console.log("wakelock acquired");
          } catch (e) {
            console.log("browser wakeLock not supported:", e);
          }
        }
      } else if (state.wakelock) {
        const wl = state.wakelock;
        state.wakelock = null;
        wl.release();
        console.log("wakelock released");
      }
    };
    const fullscreen = (wakelockListenters.current.fullscreen = () =>
      handleChange(!!document.fullscreenElement));
    const visibility = (wakelockListenters.current.visibility = () => {
      if (state.wakelock !== null && document.visibilityState === "visible") {
        handleChange(true);
      }
    });
    document.addEventListener("fullscreenchange", fullscreen);
    document.addEventListener("visibilitychange", visibility);
  }, [wakelockEnabled]);

  const handleFullscreen = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!document.fullscreenEnabled) return;
    const isFullscreen = document.fullscreenElement !== null;
    if (isFullscreen) {
      document.exitFullscreen();
    } else {
      document.body.requestFullscreen();
    }
  };

  return (
    <div className={classes.app}>
      {start ? (
        errorState ? (
          <div>
            <Paper className={classes.errorDisplay} elevation={3}>
              <Typography variant="h2">
                💩... Vuzic was unable to load
              </Typography>
              <pre className={classes.errorMessage}>{errorState.message}</pre>
            </Paper>
          </div>
        ) : (
          <div>
            <MenuPanel
              visual={visual}
              renderController={renderControllerInit}
              audioParams={audioParams}
              updateAudioParam={updateAudioParam}
              canvas={canvasRef}
            />
            <canvas
              ref={canvasRef}
              className={classes.canvas}
              onDoubleClick={handleFullscreen}
            />
          </div>
        )
      ) : (
        <div>
          <Button className={classes.button} onClick={() => setStart(true)}>
            Start
          </Button>
        </div>
      )}
    </div>
  );
};

export default App;
