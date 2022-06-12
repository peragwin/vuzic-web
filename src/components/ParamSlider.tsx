import React from "react";

import Slider from "@mui/material/Slider";
import Typography from "@mui/material/Typography";
import { makeStyles } from "@mui/styles";

import { FilterParams } from "../audio/audio";

const useStyles = makeStyles({
  slider: {
    width: "90%",
    margin: "auto",
  },
  filterParamSlider: {
    borderTop: "1px",
    borderBottom: "1px",
  },
});

interface ParamSliderProps {
  title: string;
  min: number;
  max: number;
  value: number;
  onChange: (e: Event, value: number) => void;
  step: number;
  displayValue?: number;
}

export const ParamSlider: React.FC<ParamSliderProps> = (
  props: ParamSliderProps
) => {
  const { title, min, max, value, onChange, step } = props;
  const classes = useStyles();
  const reset = (e: any) => onChange(e, (max + min) / 2);
  return (
    <div>
      <Typography id={`slider-${title}`} gutterBottom>
        {title} = {value}
      </Typography>
      <Slider
        className={classes.slider}
        min={min}
        max={max}
        aria-labelledby={`slider-${title}`}
        step={step}
        value={value || 0}
        // @ts-ignore
        onChange={onChange}
        onDoubleClick={reset}
        valueLabelDisplay="auto"
      />
    </div>
  );
};

interface FilterParamSliderProps {
  title: string;
  min: number;
  max: number;
  value: FilterParams;
  onChange: (e: Event, value: FilterParams) => void;
  step: number;
}

export const FilterParamSlider: React.FC<FilterParamSliderProps> = (
  props: FilterParamSliderProps
) => {
  const { title, min, max, value, onChange, step } = props;
  const handleChange =
    (key: "tao" | "gain") => (e: Event, val: number | number[], _: number) => {
      switch (key) {
        case "tao":
          onChange(e, { ...value, tao: (val as number) * (val as number) });
          break;
        case "gain":
          onChange(e, { ...value, gain: val as number });
          break;
      }
    };
  const classes = useStyles();
  return (
    <div className={classes.filterParamSlider}>
      <Typography id={`slider-${title}`}>{title}</Typography>
      <Typography id={`slider-${title}-tao`} gutterBottom>
        Tao = {value.tao}
      </Typography>
      <Slider
        className={classes.slider}
        min={Math.sqrt(min)}
        max={Math.sqrt(max)}
        aria-labelledby={`slider-${title}-tao`}
        step={step}
        value={Math.sqrt(value.tao)}
        onChange={handleChange("tao")}
        valueLabelDisplay="off"
      />
      <Typography id={`slider-${title}-gain`} gutterBottom>
        Gain = {value.gain}
      </Typography>
      <Slider
        className={classes.slider}
        min={-2}
        max={2}
        aria-labelledby={`slider-${title}-gain`}
        step={0.01}
        value={value.gain}
        onChange={handleChange("gain")}
        valueLabelDisplay="auto"
      />
    </div>
  );
};
