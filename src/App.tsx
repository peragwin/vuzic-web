import React, { useRef, useEffect, useState, useReducer } from "react";

import { WarpGrid } from "./gfx/warpgrid/display";
import {
  AudioProcessor,
  AudioProcessorParams,
  audioParamReducer,
} from "./audio/audio";
import {
  RenderParams as WarpRenderParams,
  renderParamReducer as warpRenderParamReducer,
  WarpController,
} from "./gfx/warpgrid/render";
import { PPS, defaultParams as ppsDefaultParams } from "./gfx/pps/pps";
import { PpsRenderParams, ppsRenderParamsReducer } from "./gfx/pps/params";
import { RenderController, Manager, ExportSettings } from "./gfx/renderconfig";
import { VisualOptions } from "./gfx/renderconfig";

import "./App.css";
import { makeStyles } from "@material-ui/core";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import Button from "@material-ui/core/Button";
import MenuPanel from "./components/MenuPanel";
import base64url from "base64url";

const useStyles = makeStyles({
  buttonContainer: {
    width: "100vw",
    textAlign: "center",
  },
  buttonsJustified: {
    display: "inline-grid",
    width: "100vw",
    maxWidth: "400px",
  },
  button: {
    background: "linear-gradient(45deg, #FE6B8B 30%, #FF8E53 90%)",
    border: 0,
    borderRadius: 3,
    boxShadow: "0 3px 5px 2px rgba(255, 105, 135, .3)",
    color: "white",
    height: 48,
    padding: "0 30px",
    margin: "1.5em",
    maxWidth: "400px",
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

const warpRenderParamsInit: WarpRenderParams = {
  rows: buckets,
  columns: length,
  aspect: 4 / 3,
  valueScale: 2,
  valueOffset: 0,
  lightnessScale: 0.88,
  lightnessOffset: 0,
  alphaScale: 1,
  alphaOffset: 0.25,
  warpScale: 16,
  warpOffset: 1.35,
  scaleScale: 2.26,
  scaleOffset: 0.45,
  period: 3 * 60,
  colorCycle: 0.01,
};

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captureCanvas = () =>
    canvasRef.current && canvasRef.current.toDataURL();

  const [warpRenderParams, updateWarpRenderParam] = useReducer(
    warpRenderParamReducer,
    warpRenderParamsInit
  );
  const warpController = new WarpController(
    warpRenderParams,
    updateWarpRenderParam
  );

  const [ppsRenderParams, updatePpsRenderParam] = useReducer(
    ppsRenderParamsReducer,
    ppsDefaultParams
  );
  const ppsController = new PpsRenderParams(
    ppsRenderParams,
    updatePpsRenderParam
  );

  const [audioParams, updateAudioParam] = useReducer(
    audioParamReducer,
    audioParamsInit
  );

  const audioProcessor = useRef(
    new AudioProcessor(1024, 256, buckets, length, audioParams)
  );

  const settingsManager = new Manager(audioProcessor.current, [
    { visual: "warp", rc: warpController },
    { visual: "pps", rc: ppsController },
  ]);

  const [start, setStart] = useState(false);
  const [visual, setVisual] = useState<VisualOptions>("pps");

  const renderController = useRef<RenderController>(ppsController);
  const [errorState, setErrorState] = useState<Error | null>(null);
  const [frameRate, setFrameRate] = useState(0);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;

    if (!start) return;

    let viz: WarpGrid | PPS | undefined;

    try {
      switch (visual) {
        case "warp":
          renderController.current = warpController;
          audioProcessor.current.start(
            (ready) =>
              !ready &&
              setErrorState(
                new Error("Vuzic requires access to your microphone! 🎤🎶👩🏽‍🎤")
              )
          );

          viz = new WarpGrid(
            cv,
            { ...warpController.params },
            (w: WarpGrid) => {
              if (!(renderController.current instanceof WarpController)) return;
              if (!audioProcessor.current) return;

              const params = renderController.current.params;
              const drivers = audioProcessor.current.getDrivers();

              w.setParams(params);
              w.updateFromDrivers(drivers);
            }
          );

          break;

        case "pps":
          renderController.current = ppsController;

          viz = new PPS(cv, (p: PPS) => {
            if (!(renderController.current instanceof PpsRenderParams)) return;
            const params = renderController.current;
            p.setParams(params.params);
          });

          break;
      }
    } catch (e) {
      console.error(e);
      setErrorState(e);
    }

    // fixme: this will break when switching visuals...
    if (viz) {
      setInterval(() => {
        const fr = viz!.getFrameRate(1000);
        setFrameRate(fr);
      }, 1000);
    }
  }, [start, visual]);

  // effect watches for changes made to params and will mutate the ref with
  // the new values wrapped in a controller.
  useEffect(() => {
    renderController.current = (() => {
      switch (visual) {
        case "pps":
          return ppsController;
        case "warp":
          return warpController;
      }
    })();
  }, [warpRenderParams, ppsRenderParams, visual]);

  useEffect(() => {
    const parser = document.createElement("a");
    parser.href = document.URL;
    if (parser.hash) {
      try {
        const dec = base64url.decode(parser.hash);
        const settings: ExportSettings = JSON.parse(dec);
        if (settings.visual) {
          setVisual(settings.visual);
          settingsManager.update(settings);
          setStart(true);
        }
      } catch (e) {
        console.error("invalid settings from url", e);
      }
    }
  }, []);

  useEffect(() => {
    if (audioProcessor.current) {
      audioProcessor.current.setAudioParams(audioParams);
    }
  }, [audioParams]);

  const classes = useStyles();

  const [wakelockEnabled] = useState(true); // TODO: use setWakelockEnabled
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
                <span>💩</span>... Vuzic was unable to load
              </Typography>
              <pre className={classes.errorMessage}>{errorState.message}</pre>
            </Paper>
          </div>
        ) : (
          <div>
            <MenuPanel
              visual={visual}
              settingsManager={settingsManager}
              audioParams={audioParams}
              updateAudioParam={updateAudioParam}
              captureCanvas={captureCanvas}
              frameRate={frameRate}
            />
            <canvas
              ref={canvasRef}
              className={classes.canvas}
              onDoubleClick={handleFullscreen}
            />
          </div>
        )
      ) : (
        <div className={classes.buttonContainer}>
          <div className={classes.buttonsJustified}>
            <Button
              className={classes.button}
              size="large"
              onClick={() => {
                setVisual("pps");
                setStart(true);
              }}
            >
              Particle System Simulator
            </Button>
            <Button
              size="large"
              className={classes.button}
              onClick={() => {
                setVisual("warp");
                setStart(true);
              }}
            >
              Music Visualizer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
