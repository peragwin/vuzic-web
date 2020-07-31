import React, { useRef, useState } from "react";
import {
  BrowserRouter as Router,
  Switch,
  Route,
  useRouteMatch,
} from "react-router-dom";
import { RecoilRoot, useSetRecoilState } from "recoil";

import { makeStyles } from "@material-ui/core";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import MenuPanel from "./components/MenuPanel";

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
  canvas: { width: "100vw", height: "100vh" },
});

const buckets = 32;
const length = BASE_AUDIO_LENGTH;
const gridSize = { width: 128, height: 64 };

const useVisualFromRoute = () => {
  const match = useRouteMatch<{ visual: VisualOptions }>("/:visual");
  if (match) return match.params.visual;
};

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captureCanvas = () =>
    canvasRef.current && canvasRef.current.toDataURL();

  const handleFullscreen = useFullscreen();

  const audioController = useAudio({
    window: 1024,
    frame: 256,
    buckets,
    length,
  });

  const visual = useVisualFromRoute();
  const [warpController, ppsController, manager] = useSettingsManager(
    audioController,
    { width: length, height: buckets },
    gridSize
  );
  useSettingsFromRoute(visual, manager);

  const [errorState, setErrorState] = useState<Error | null>(null);
  const setFrameRate = useSetRecoilState(fpsState);

  const classes = useStyles();

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
              />
              <canvas
                ref={canvasRef}
                className={classes.canvas}
                onDoubleClick={handleFullscreen}
              />
            </div>
          )}

          <Switch>
            <Route path="/" exact>
              <EntryPoint />
            </Route>

            <Route
              path="/warp"
              render={() => (
                <Warp
                  canvas={canvasRef}
                  audio={audioController}
                  controller={warpController}
                  setErrorState={setErrorState}
                  setFrameRate={setFrameRate}
                />
              )}
            />

            <Route
              path="/pps"
              render={() => (
                <Particle
                  canvas={canvasRef}
                  audio={audioController}
                  controller={ppsController}
                  setErrorState={setErrorState}
                  setFrameRate={setFrameRate}
                />
              )}
            />

            <Route
              path="/pps3"
              render={() => (
                <Particle
                  canvas={canvasRef}
                  audio={audioController}
                  controller={ppsController}
                  setErrorState={setErrorState}
                  setFrameRate={setFrameRate}
                  mode={"3D"}
                />
              )}
            />
          </Switch>
        </React.Fragment>
      )}
    </div>
  );
};

export default () => (
  <RecoilRoot>
    <Router>
      <App />
    </Router>
  </RecoilRoot>
);
