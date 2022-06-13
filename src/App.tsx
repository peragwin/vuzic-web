import React, { useRef, useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useMatch,
} from "react-router-dom";
import { RecoilRoot, useSetRecoilState } from "recoil";

import { makeStyles } from "@mui/styles";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import {
  createTheme,
  ThemeProvider,
  StyledEngineProvider,
} from "@mui/material/styles";
import { useDoubleTap } from "use-double-tap";

import "./App.css";

import { VisualOptions } from "./types/types";
import { useAudio } from "./hooks/audio";
import EntryPoint from "./components/EntryPoint";
import useFullscreen from "./hooks/fullscreen";
import Warp from "./components/visuals/Warp";
import Particle from "./components/visuals/Particles";
import { useSettingsFromRoute } from "./hooks/routeSettings";
import { useSettingsManager } from "./hooks/settings";
import { fpsState } from "./components/widgets/FPS";
import { BASE_AUDIO_LENGTH } from "./gfx/warpgrid/params";
import MenuPanel from "./components/MenuPanel";
import ParticleLife from "./components/visuals/ParticleLife";

const useStyles = makeStyles({
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
  canvas: {
    width: "100vw",
    height: "100vh",
  },
});

const buckets = 32;
const length = BASE_AUDIO_LENGTH;
const gridSize = { width: 128, height: 64 };

const useVisualFromRoute = () => {
  const match = useMatch("/:visual");
  if (match) return match.params.visual as VisualOptions;
};

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captureCanvas = () =>
    canvasRef.current && canvasRef.current.toDataURL();

  const handleFullscreen = useFullscreen();
  const doubleTapBinding = useDoubleTap((ev) => {
    handleFullscreen(ev);
  });

  const audioController = useAudio({
    window: 1024,
    frame: 256,
    buckets,
    length,
  });

  const visual = useVisualFromRoute();
  const [warpController, ppsController, particleLifeController, manager] =
    useSettingsManager(
      audioController,
      { width: length, height: buckets },
      gridSize
    );
  useSettingsFromRoute(visual, manager);

  const [errorState, setErrorState] = useState<Error | null>(null);
  const setFrameRate = useSetRecoilState(fpsState);

  const classes = useStyles();

  // this is super hacky lol
  if (visual) {
    document.body.scrollTop = 0;
    document.body.style.overflow = "hidden";
  } else {
    document.body.style.overflowY = "scroll";
    document.body.style.overflowX = "hidden";
  }

  return (
    <div className={classes.app}>
      {errorState ? (
        <div>
          <Paper className={classes.errorDisplay} elevation={3}>
            <Typography variant="h2">
              <span role="img" aria-label="shit">
                💩
              </span>
              ... Vuzic was unable to load
            </Typography>
            <pre className={classes.errorMessage}>{errorState.message}</pre>
          </Paper>
        </div>
      ) : (
        <React.Fragment>
          {visual && (
            <div>
              <MenuPanel
                visual={visual}
                manager={manager}
                captureCanvas={captureCanvas}
                handleFullscreen={handleFullscreen}
              />
              <canvas
                ref={canvasRef}
                className={classes.canvas + " render-canvas"}
                // onDoubleClick={handleFullscreen}
                {...doubleTapBinding}
              />
            </div>
          )}

          <Routes>
            <Route path="/" element={<EntryPoint />} />

            <Route
              path="/warp"
              element={
                <Warp
                  canvas={canvasRef}
                  audio={audioController}
                  controller={warpController}
                  setErrorState={setErrorState}
                  setFrameRate={setFrameRate}
                />
              }
            />

            <Route
              path="/pps"
              element={
                <Particle
                  canvas={canvasRef}
                  audio={audioController}
                  controller={ppsController}
                  setErrorState={setErrorState}
                  setFrameRate={setFrameRate}
                />
              }
            />

            <Route
              path="/pps3"
              element={
                <Particle
                  canvas={canvasRef}
                  audio={audioController}
                  controller={ppsController}
                  setErrorState={setErrorState}
                  setFrameRate={setFrameRate}
                  mode={"3D"}
                />
              }
            />

            <Route
              path="/particleLife"
              element={
                <ParticleLife
                  canvas={canvasRef}
                  audio={audioController}
                  controller={particleLifeController}
                  setErrorState={setErrorState}
                  setFrameRate={setFrameRate}
                />
              }
            />
          </Routes>
        </React.Fragment>
      )}
    </div>
  );
};

const theme = createTheme({});

export default () => (
  <RecoilRoot>
    <Router>
      <StyledEngineProvider injectFirst>
        <ThemeProvider theme={theme}>
          <App />
        </ThemeProvider>
      </StyledEngineProvider>
    </Router>
  </RecoilRoot>
);
