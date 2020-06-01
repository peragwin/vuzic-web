import React, { useState, useMemo, useEffect } from "react";
import { makeStyles } from "@material-ui/core";

import AppBar from "@material-ui/core/AppBar";
import Toolbar from "@material-ui/core/Toolbar";
import Typography from "@material-ui/core/Typography";
import IconButton from "@material-ui/core/IconButton";
import SaveIcon from "@material-ui/icons/Save";
import MenuIcon from "@material-ui/icons/Menu";
import CreateIcon from "@material-ui/icons/Create";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import FolderOpenIcon from "@material-ui/icons/FolderOpen";
import Slide from "@material-ui/core/Slide";
import Paper from "@material-ui/core/Paper";
import ClickAwayListener from "@material-ui/core/ClickAwayListener";
import Slider from "@material-ui/core/Slider";
import Menu from "@material-ui/core/Menu";
import MenuItem from "@material-ui/core/MenuItem";
import Tooltip from "@material-ui/core/Tooltip";

import { RenderController } from "../gfx/renderconfig";
import {
  AudioProcessorParams,
  AudioParamUpdate,
  AudioParamKey,
  FilterParams,
} from "../audio/audio";

const useStyles = makeStyles((theme) => ({
  root: {
    flexGrow: 1,
  },
  background: {
    background:
      "linear-gradient(90deg, rgba(233,30,99,1) 0%, rgba(213,0,249,1) 50%, rgba(33,150,243,1) 100%)",
  },
  menuButton: {
    marginRight: theme.spacing(2),
  },
  title: {
    flexGrow: 1,
  },
  menuTriggerArea: {
    position: "absolute",
    top: 0,
    zIndex: 100,
    minHeight: "20vh",
    minWidth: "100vw",
  },
  settingsContainer: {
    width: "100vw",
    height: "100vh",
    background: "rgba(0,0,0,0)",
    position: "absolute",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    overflow: "scroll",
  },
  settings: {
    zIndex: 200,
    background: "rgba(255, 255, 255, .1)",
    boxShadow: "inset 0 0 10px rgba(255,255,255,.8)",
    borderRadius: "30px",
    width: "80vw",
    minHeight: "70vh",
    color: "white",
    padding: "40px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  settingsOptions: {
    width: "100%",
    height: "100%",
    margin: theme.spacing(1),
  },
  slider: {
    width: "90%",
    margin: "auto",
  },
  filterParamSlider: {
    borderTop: "1px",
    borderBottom: "1px",
  },
  thumbPopover: {
    zIndex: 1000,
  },
}));

interface ParamSliderProps {
  title: string;
  min: number;
  max: number;
  value: number;
  onChange: (e: React.ChangeEvent<{}>, value: number) => void;
  step: number;
  displayValue?: number;
}

const ParamSlider: React.FC<ParamSliderProps> = (props: ParamSliderProps) => {
  const { title, min, max, value, onChange, step } = props;
  const classes = useStyles();
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
  onChange: (e: React.ChangeEvent<{}>, value: FilterParams) => void;
  step: number;
}

const FilterParamSlider: React.FC<FilterParamSliderProps> = (
  props: FilterParamSliderProps
) => {
  const { title, min, max, value, onChange, step } = props;
  const handleChange = (key: "tao" | "gain") => (
    e: React.ChangeEvent<{}>,
    val: number | number[]
  ) => {
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

interface Capture {
  capture: string | undefined;
}

interface MenuPanelProps {
  visual: string;
  renderController: RenderController;
  audioParams: AudioProcessorParams;
  updateAudioParam: (action: AudioParamUpdate) => void;
  canvas: React.RefObject<HTMLCanvasElement & Capture>;
  children?: React.ReactNode;
}

const SaveMenu: React.FC<MenuPanelProps> = (props: MenuPanelProps) => {
  const [anchorMenu, setAnchorMenu] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorMenu);

  function handleShowMenu(event: React.MouseEvent<HTMLElement>) {
    setAnchorMenu(event.currentTarget);
  }

  function handleCloseMenu() {
    setAnchorMenu(null);
  }

  const [thumb, setThumb] = React.useState("");
  const [showThumb, setShowThumb] = React.useState("");

  const handleShowThumb = (name: string) => (
    event: React.MouseEvent<HTMLElement>
  ) => {
    setShowThumb("");
    const profile = window.localStorage.getItem(`profile.${name}`);
    if (profile !== null) {
      const prof = JSON.parse(profile);
      if (prof.thumb) {
        setThumb(prof.thumb);
        setShowThumb(name);
      }
    }
  };

  const { visual, renderController, audioParams, canvas } = props;

  const saveProfile = (name: string) => {
    let thumb: string | undefined;

    const save = () => {
      const data = {
        [visual]: { params: renderController.params },
        audioParams,
        thumb,
      };
      window.localStorage.setItem(`profile.${name}`, JSON.stringify(data));
      handleCloseMenu();
    };

    if (canvas.current && canvas.current.capture) {
      const resizedCanvas = document.createElement("canvas");
      const ctx = resizedCanvas.getContext("2d");
      resizedCanvas.height = 128;
      resizedCanvas.width = 128;
      if (ctx) {
        thumb = ""; // assign thumb so we know that save will be defered to the img onload
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, 128, 128);
          thumb = resizedCanvas.toDataURL();
          console.log(thumb);
          resizedCanvas.remove();
          save();
        };
        img.src = canvas.current.capture;
      }
    }

    if (thumb === undefined) {
      save();
    }
  };

  const [didLoad, setDidLoad] = React.useState(false);

  const loadProfile = (name: string) => {
    const profile = window.localStorage.getItem(`profile.${name}`);
    if (profile === null) return;

    setDidLoad(true);

    const prof = JSON.parse(profile);
    const renderParams = prof[visual];
    const audioParams = prof.audioParams;

    if (renderParams) {
      renderController.update({ type: "all", value: renderParams.params });
    }
    props.updateAudioParam({ type: AudioParamKey.all, value: audioParams });
    handleCloseMenu();
  };

  useEffect(() => loadProfile("current"), []);
  useEffect(() => {
    if (didLoad) {
      setDidLoad(false);
      return;
    }
    saveProfile("current");
  }, [renderController.params, audioParams]);

  const classes = useStyles();

  return (
    <div className={classes.title}>
      <IconButton
        aria-label="account of current user"
        aria-controls="menu-appbar"
        aria-haspopup="true"
        onClick={handleShowMenu}
        color="inherit"
      >
        <SaveIcon />
      </IconButton>
      <Menu
        id="menu-appbar"
        anchorEl={anchorMenu}
        anchorOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        keepMounted
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        open={open}
        onClose={handleCloseMenu}
      >
        {["Default", "Bright", "Dim", "Sensitive", "Other"].map((name) => (
          <div key={name}>
            <MenuItem key={"save" + name} onClick={() => saveProfile(name)}>
              <ListItemIcon>
                <CreateIcon />
              </ListItemIcon>
              <Typography variant="inherit">{`Save Profile: ${name}`}</Typography>
            </MenuItem>
            <Tooltip
              placement="right"
              title={showThumb ? <img src={thumb} /> : "No Preview"}
            >
              <MenuItem
                key={"load" + name}
                onClick={() => loadProfile(name)}
                onMouseEnter={handleShowThumb(name)}
              >
                <ListItemIcon>
                  <FolderOpenIcon />
                </ListItemIcon>
                <Typography variant="inherit">{`Load Profile: ${name}`}</Typography>
              </MenuItem>
            </Tooltip>
          </div>
        ))}
      </Menu>
    </div>
  );
};

const MenuPanel: React.FC<MenuPanelProps> = (props: MenuPanelProps) => {
  const classes = useStyles();
  const [showMenu, setShowMenu] = useState(false);
  const [showAudioSettings, setShowAudioSettings] = useState(false);
  const [showRenderSettings, setShowRenderSettings] = useState(false);

  const handleShowMenu = () => {
    setShowMenu(true);
  };

  const handleShowRenderSettings = () => {
    setShowAudioSettings(false);
    setShowRenderSettings(true);
  };

  const handleHideRenderSettings = () => {
    setShowRenderSettings(false);
  };

  const handleShowAudioSettings = () => {
    setShowRenderSettings(false);
    setShowAudioSettings(true);
  };

  const handleHideAudioSettings = () => setShowAudioSettings(false);

  const rc = props.renderController;
  const renderParamConfig = useMemo(() => rc.config(), []);
  const renderParamValues = rc.values();

  const audioParams = props.audioParams;
  const setAudioParam = (type: AudioParamKey) => (
    e: React.ChangeEvent<{}>,
    value: number | FilterParams
  ) => props.updateAudioParam({ type, value });

  return (
    <div>
      <div
        className={classes.menuTriggerArea}
        onMouseOver={handleShowMenu}
        onMouseOut={() => setShowMenu(false)}
      >
        <Slide appear={false} in={showMenu} direction="down">
          <AppBar position="static" className={classes.background}>
            <Toolbar>
              <IconButton
                edge="start"
                className={classes.menuButton}
                color="inherit"
                aria-label="renderMenu"
                onClick={handleShowRenderSettings}
              >
                <MenuIcon />
              </IconButton>
              <Typography
                variant="h6"
                className={classes.title}
                onClick={handleShowRenderSettings}
              >
                Visualizer
              </Typography>
              <IconButton
                edge="start"
                className={classes.menuButton}
                color="inherit"
                aria-label="audioMenu"
                onClick={handleShowAudioSettings}
              >
                <MenuIcon />
              </IconButton>
              <Typography
                variant="h6"
                className={classes.title}
                onClick={handleShowAudioSettings}
              >
                Audio
              </Typography>
              <SaveMenu {...props} />
            </Toolbar>
          </AppBar>
        </Slide>
      </div>
      <div
        className={
          showRenderSettings || showAudioSettings
            ? classes.settingsContainer
            : undefined
        }
      >
        {showRenderSettings ? (
          <ClickAwayListener onClickAway={handleHideRenderSettings}>
            <Paper className={classes.settings}>
              <div className={classes.settingsOptions}>
                {renderParamConfig.map((c, i) => (
                  <ParamSlider
                    key={c.title}
                    title={c.title}
                    min={c.min}
                    max={c.max}
                    step={c.step}
                    value={renderParamValues[i]}
                    onChange={c.update}
                  />
                ))}
              </div>
            </Paper>
          </ClickAwayListener>
        ) : null}
        {showAudioSettings ? (
          <ClickAwayListener onClickAway={handleHideAudioSettings}>
            <Paper className={classes.settings}>
              <div className={classes.settingsOptions}>
                <ParamSlider
                  title="Preemphasis"
                  min={1}
                  max={16}
                  step={0.01}
                  value={audioParams.preemphasis}
                  onChange={setAudioParam(AudioParamKey.preemphasis)}
                />
                <ParamSlider
                  title="Sensitivity Scale"
                  min={-1}
                  max={8}
                  step={0.01}
                  value={audioParams.ampScale}
                  onChange={setAudioParam(AudioParamKey.ampScale)}
                />
                <ParamSlider
                  title="Sensitivity Offset"
                  min={-2}
                  max={8}
                  step={0.01}
                  value={audioParams.ampOffset}
                  onChange={setAudioParam(AudioParamKey.ampOffset)}
                />
                <ParamSlider
                  title="Differential Sensitivity"
                  min={-1}
                  max={4}
                  step={0.01}
                  value={audioParams.diffGain}
                  onChange={setAudioParam(AudioParamKey.diffGain)}
                />
                <ParamSlider
                  title="Differential Sync"
                  min={0}
                  max={0.1}
                  step={0.001}
                  value={audioParams.sync}
                  onChange={setAudioParam(AudioParamKey.sync)}
                />
                <ParamSlider
                  title="Decay"
                  min={0}
                  max={2}
                  step={0.001}
                  value={audioParams.decay}
                  onChange={setAudioParam(AudioParamKey.decay)}
                />
                <FilterParamSlider
                  title="Intensity Filter"
                  min={0}
                  max={12}
                  step={0.01}
                  value={audioParams.gainFilterParams}
                  onChange={setAudioParam(AudioParamKey.gainFilterParams)}
                />
                <FilterParamSlider
                  title="Intensity Feedback"
                  min={0}
                  max={1000}
                  step={1}
                  value={audioParams.gainFeedbackParams}
                  onChange={setAudioParam(AudioParamKey.gainFeedbackParams)}
                />
                <FilterParamSlider
                  title="Differential Filter"
                  min={0}
                  max={12}
                  step={0.01}
                  value={audioParams.diffFilterParams}
                  onChange={setAudioParam(AudioParamKey.diffFilterParams)}
                />
                <FilterParamSlider
                  title="Differential Feedback"
                  min={0}
                  max={1000}
                  step={1}
                  value={audioParams.diffFeedbackParams}
                  onChange={setAudioParam(AudioParamKey.diffFeedbackParams)}
                />
                <FilterParamSlider
                  title="Positive Bias Scale Filter"
                  min={0}
                  max={1000}
                  step={1}
                  value={audioParams.posScaleFilterParams}
                  onChange={setAudioParam(AudioParamKey.posScaleFilterParams)}
                />
                <FilterParamSlider
                  title="Negative Bias Scale Filter"
                  min={0}
                  max={1000}
                  step={1}
                  value={audioParams.negScaleFilterParams}
                  onChange={setAudioParam(AudioParamKey.negScaleFilterParams)}
                />
              </div>
            </Paper>
          </ClickAwayListener>
        ) : null}
      </div>
    </div>
  );
};

export default MenuPanel;
