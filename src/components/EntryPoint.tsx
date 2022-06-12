import React from "react";
import { useNavigate } from "react-router-dom";

import { makeStyles } from "@mui/styles";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import GitHubIcon from "@mui/icons-material/GitHub";
import InstagramIcon from "@mui/icons-material/Instagram";
import IconButton from "@mui/material/IconButton";

export const useStyles = makeStyles((theme: any) => ({
  title: {
    margin: "auto",
    marginBottom: theme.spacing(4),
    textAlign: "center",
    fontFamily: "'Iceland', cursive",
    textShadow: "0px 2px 8px #a0abffb3",
  },
  footer: {
    textAlign: "center",
    marginTop: theme.spacing(4),
    textShadow: "0px 0px 5px #c8ceffe0",
  },
  prefooter: {
    textAlign: "center",
    fontFamily: "'Poiret One', cursive",
    fontSize: "1.25rem",
    marginTop: theme.spacing(5),
    textShadow: "0px 0px 2px #c8ceffe0",
  },
  release: {
    textAlign: "center",
    fontFamily: "'Poiret One', cursive",
    fontSize: "1.25rem",
    marginTop: theme.spacing(1),
    textShadow: "0px 0px 2px #c8ceffe0",
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
    width: "100vw",
    textShadow: "0px 0px 2px #FFF",
  },
  root: {
    display: "flex",
    flexWrap: "wrap",
    "& > *": {
      margin: "auto",
    },
  },
  paper: {
    overflowX: "hidden",
    flexGrow: 1,
    maxWidth: theme.spacing(64),
    minHeight: theme.spacing(72),
    padding: theme.spacing(4),
    textAlign: "center",
    background: "linear-gradient(225deg, #ff22e48c -30%, #bf9bff94 100%)",
    color: "#FFFFFF",
    textShadow: "0px 1px 4px #c8ceffe0",
    boxShadow: "0 3px 7px 1px rgb(187 113 255 / 45%)",
    margin: theme.spacing(2),
  },
  cardHeading: {
    fontFamily: "'Iceland', cursive",
  },
  cardInfo: {
    margin: theme.spacing(2),
    fontFamily: "'Poiret One', cursive",
    fontSize: "1.25rem",
  },
}));

interface Props {}

const EntryPoint: React.FC<Props> = () => {
  const classes = useStyles();
  const navigate = useNavigate();
  return (
    <div>
      <Typography variant="h1" className={classes.title}>
        Vuzic.app
      </Typography>
      <div className={classes.root}>
        <div>
          <Paper elevation={3} className={classes.paper}>
            <Typography variant="h3" className={classes.cardHeading}>
              Particle Simulators
            </Typography>
            <Typography className={classes.cardInfo}>
              This particle system is based on the Primordial Particle System
              described in this{" "}
              <a
                style={{ color: "white" }}
                href="https://www.nature.com/articles/srep37969"
              >
                paper
              </a>
              .
            </Typography>
            <Button
              className={classes.button}
              size="large"
              onClick={() => navigate("/pps")}
            >
              2D Particle System
            </Button>

            <Typography className={classes.cardInfo}>
              It's also possible to extend into three dimensions.
            </Typography>
            <Button
              className={classes.button}
              size="large"
              onClick={() => navigate("/pps3")}
            >
              3D Particle System
            </Button>

            <Typography className={classes.cardInfo}>
              For better performance, it's possible to enable WebGL support for
              compute shaders in Chromium based browsers on Windows and Linux.
              This easily doubles the frame rate! Some good{" "}
              <a
                style={{ color: "white" }}
                href="https://github.com/9ballsyndrome/WebGL_Compute_shader"
              >
                instructions
              </a>{" "}
              are here.
            </Typography>
          </Paper>
        </div>
        <div>
          <Paper elevation={3} className={classes.paper}>
            <Typography variant="h3" className={classes.cardHeading}>
              Music Visualizers
            </Typography>
            <Typography className={classes.cardInfo}>
              This particle system is based on{" "}
              <a
                style={{ color: "white" }}
                href="https://www.ventrella.com/Clusters/"
              >
                Clusters
              </a>{" "}
              by Jeffrey Ventrella.
            </Typography>
            <Button
              className={classes.button}
              size="large"
              onClick={() => navigate("/particleLife")}
            >
              Particle Life
            </Button>
            <Typography className={classes.cardInfo}>
              A music visualizer using a connected microphone as input.
            </Typography>
            <Button
              size="large"
              className={classes.button}
              onClick={() => navigate("/warp")}
            >
              Music Visualizer
            </Button>
          </Paper>
        </div>
      </div>
      <div>
        <Typography className={classes.prefooter}>
          Vuzic requires a browser which supports WebGL 2.0. It will not work on
          iOS or Safari.
        </Typography>
        <Typography className={classes.release}>
          The current version is dated:{" "}
          <span style={{ fontFamily: "'Anonymous Pro', monospace" }}>
            2022.06.12
          </span>
        </Typography>
      </div>
      <div className={classes.footer}>
        <IconButton>
          <a style={{ color: "white" }} href="https://github.com/peragwin">
            <GitHubIcon />
          </a>
        </IconButton>
        <IconButton>
          <a style={{ color: "white" }} href="https://instagram.com/peragwin">
            <InstagramIcon />
          </a>
        </IconButton>
      </div>
    </div>
  );
};

export default EntryPoint;
