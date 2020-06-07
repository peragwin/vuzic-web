import React from "react";
import { useHistory } from "react-router-dom";

import { makeStyles } from "@material-ui/core";
import Button from "@material-ui/core/Button";

export const useStyles = makeStyles({
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
});

interface Props {}

const EntryPoint: React.FC<Props> = () => {
  const classes = useStyles();
  const history = useHistory();
  return (
    <div className={classes.buttonContainer}>
      <div className={classes.buttonsJustified}>
        <Button
          className={classes.button}
          size="large"
          onClick={() => history.push("/pps")}
        >
          Particle System Simulator
        </Button>
        <Button
          size="large"
          className={classes.button}
          onClick={() => history.push("/warp")}
        >
          Music Visualizer
        </Button>
      </div>
    </div>
  );
};

export default EntryPoint;
