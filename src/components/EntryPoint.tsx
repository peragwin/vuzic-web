import React from "react";
import { useHistory } from "react-router-dom";

import { makeStyles } from "@material-ui/core";
import Button from "@material-ui/core/Button";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import GitHubIcon from "@material-ui/icons/GitHub";
import InstagramIcon from "@material-ui/icons/Instagram";
import IconButton from "@material-ui/core/IconButton";

export const useStyles = makeStyles((theme) => ({
  title: {
    margin: "auto",
    textAlign: "center",
    fontFamily: "'Iceland', cursive",
  },
  footer: {
    textAlign: "center",
    marginTop: theme.spacing(8),
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
  },
  root: {
    display: "flex",
    flexWrap: "wrap",
    "& > *": {
      margin: "auto",
    },
  },
  paper: {
    width: theme.spacing(64),
    height: theme.spacing(64),
    padding: theme.spacing(4),
    textAlign: "center",
    background: "linear-gradient(225deg, #ff22e48c -30%, #bf9bff94 100%)",
    color: "#FFFFFF",
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
  const history = useHistory();
  return (
    <div>
      <Typography variant="h1" className={classes.title}>
        Vuzic.app
      </Typography>
      <div className={classes.root}>
        <div>
          <Paper elevation={3} className={classes.paper}>
            <Typography variant="h3" className={classes.cardHeading}>
              Particle System Simulator
            </Typography>
            <Typography className={classes.cardInfo}>
              The particle system is based on the Primordial Particle System
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
              onClick={() => history.push("/pps")}
            >
              2D Particle System
            </Button>
            <Typography className={classes.cardInfo}>
              It's also possible to extend into three dimensions.
            </Typography>
            <Button
              className={classes.button}
              size="large"
              onClick={() => history.push("/pps3")}
            >
              3D Particle System
            </Button>
          </Paper>
        </div>
        <div>
          <Paper elevation={3} className={classes.paper}>
            <Typography variant="h3" className={classes.cardHeading}>
              Music Visualizer
            </Typography>
            <Typography className={classes.cardInfo}>
              A music visualizer using a connected microphone as input.
            </Typography>
            <Button
              size="large"
              className={classes.button}
              onClick={() => history.push("/warp")}
            >
              Music Visualizer
            </Button>
          </Paper>
        </div>
      </div>
      {/* <div style={{ height: "auto" }}></div> */}
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
