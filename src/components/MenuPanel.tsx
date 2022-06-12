import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Base64 } from "js-base64";
import copy from "copy-to-clipboard";

import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Slide,
  SwipeableDrawer,
} from "@mui/material";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExit from "@mui/icons-material/FullscreenExit";
import AppsIcon from "@mui/icons-material/Apps";
import Button from "@mui/material/Button";
import ClickAwayListener from "@mui/material/ClickAwayListener";
import FileCopyIcon from "@mui/icons-material/FileCopy";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import MenuIcon from "@mui/icons-material/Menu";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { makeStyles } from "@mui/styles";

import { ExportSettings, Manager } from "../hooks/settings";
import { VisualOptions } from "../types/types";
import { AudioParamKey, FilterParams } from "../audio/audio";
import { ParamSlider, FilterParamSlider } from "./ParamSlider";
import SaveMenu from "./SaveMenu";
import { FPSInfo } from "./widgets/FPS";
import { XRButton } from "./XRButton";

const useStyles = makeStyles((theme: any) => ({
  root: {
    flexGrow: 1,
  },
  background: {
    background:
      "linear-gradient(180deg, rgba(233,30,99,1) 0%, rgba(213,0,249,1) 50%, rgba(33,150,243,1) 100%)",
    color: "#FFFFFF",
    borderRadius: 8,
  },
  menuButton: {
    // marginRight: theme.spacing(2),
    color: "#FFFFFF",
  },
  title: {
    flexGrow: 1,
  },
  menuTriggerArea: {
    position: "absolute",
    left: 8,
    top: 8,
    zIndex: 100,
    minHeight: "20vh",
    minWidth: "20vw",
    maxWidth: "250px",
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
  thumbPopover: {
    zIndex: 1000,
  },
  importTextArea: {
    backgroundColor: "#FFFFFFC0",
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(2),
    width: "25ch",
    borderRadius: "15px",
    display: "flex",
  },
  button: {
    background: "linear-gradient(45deg, #FE6B8B 30%, #FF8E53 90%)",
    border: 0,
    borderRadius: 3,
    boxShadow: "0 3px 5px 2px rgba(255, 105, 135, .3)",
    color: "white",
    height: 48,
    padding: "0 30px",
    // marginTop: theme.spacing(2), ???
    marginBottom: theme.spacing(2),
  },
}));

export interface MenuPanelProps {
  visual: VisualOptions;
  manager: Manager;
  captureCanvas: () => string | null;
  children?: React.ReactNode;
  handleFullscreen: (e: React.MouseEvent<Element, MouseEvent>) => void;
}

const MenuPanel: React.FC<MenuPanelProps> = (props: MenuPanelProps) => {
  const classes = useStyles();
  const [showMenu, setShowMenu] = useState(false);
  const [showAudioSettings, setShowAudioSettings] = useState(false);
  const [showRenderSettings, setShowRenderSettings] = useState(false);
  const navigate = useNavigate();
  const controller = props.manager.controller(props.visual);

  const handleShowMenu = () => {
    setShowMenu(true);
  };

  const handleShowRenderSettings = () => {
    if (controller.show) controller.show();
    else {
      setShowAudioSettings(false);
      setShowRenderSettings(true);
    }
  };

  const handleHideRenderSettings = () => {
    setShowRenderSettings(false);
  };

  const handleShowAudioSettings = () => {
    setShowRenderSettings(false);
    setShowAudioSettings(true);
  };

  const handleHideAudioSettings = () => setShowAudioSettings(false);

  const [showImportExport, setShowImportExport] = useState(false);

  const rc = props.manager.controller(props.visual);
  const renderParamConfig = useMemo(() => rc.config(), [rc]);
  const renderParamValues = rc.values();

  const audioController = props.manager.audio;
  const audioParams = audioController.params;
  const setAudioParam =
    (type: AudioParamKey) => (_: Event, value: number | FilterParams) =>
      audioController.update({ type, value });

  const handleMain = () => navigate("/");

  return (
    <div>
      <div
        className={classes.menuTriggerArea}
        onMouseOver={handleShowMenu}
        onMouseOut={() => setShowMenu(false)}
      >
        <Slide appear={false} in={showMenu} direction="right">
          {/* <Drawer
          anchor="left"
          open={showMenu}
          onClose={() => setShowMenu(false)}
          onMouseOut={() => setShowMenu(false)}
          hideBackdrop
        > */}
          <Box
            sx={{ width: 250, height: "100%" }}
            className={classes.background}
          >
            <List>
              <ListItem disablePadding>
                <ListItemButton onClick={handleMain}>
                  <ListItemIcon className={classes.menuButton}>
                    <AppsIcon color="inherit" />
                  </ListItemIcon>
                  <ListItemText
                    className={classes.title}
                    primary="Main"
                    primaryTypographyProps={{ variant: "h6" }}
                  />
                </ListItemButton>
              </ListItem>
              <ListItem disablePadding>
                <ListItemButton onClick={handleShowRenderSettings}>
                  <ListItemIcon className={classes.menuButton}>
                    <MenuIcon />
                  </ListItemIcon>
                  <ListItemText
                    className={classes.title}
                    primary="Visualizer"
                    primaryTypographyProps={{ variant: "h6" }}
                  />
                </ListItemButton>
              </ListItem>
              <ListItem disablePadding>
                <ListItemButton onClick={handleShowAudioSettings}>
                  <ListItemIcon className={classes.menuButton}>
                    <MenuIcon />
                  </ListItemIcon>
                  <ListItemText
                    className={classes.title}
                    primary="Audio"
                    primaryTypographyProps={{ variant: "h6" }}
                  />
                </ListItemButton>
              </ListItem>
              <ListItem disablePadding>
                <ListItemButton onClick={props.handleFullscreen}>
                  <ListItemIcon className={classes.menuButton}>
                    {document.fullscreenElement === null ? (
                      <FullscreenIcon />
                    ) : (
                      <FullscreenExit />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    className={classes.title}
                    primary="Fullscreen"
                    primaryTypographyProps={{ variant: "h6" }}
                  />
                </ListItemButton>
              </ListItem>
              <ListItem disablePadding>
                <XRButton listItemClass={classes.menuButton} />
              </ListItem>
              <ListItem disablePadding>
                <SaveMenu
                  {...props}
                  listItemClass={classes.menuButton}
                  setShowImportExport={setShowImportExport}
                />
              </ListItem>
            </List>
          </Box>
          {/* </Drawer> */}
        </Slide>
      </div>
      {/* 
      <div
        className={classes.menuTriggerArea}
        onMouseOver={handleShowMenu}
        onMouseOut={() => setShowMenu(false)}
      >
        <Slide appear={false} in={showMenu} direction="right">
          <AppBar position="static" className={classes.background}>
            <Toolbar>
              <IconButton
                edge="start"
                className={classes.menuButton}
                color="inherit"
                aria-label="mainMenu"
                onClick={handleMain}
              >
                <AppsIcon />
              </IconButton>
              <Typography
                variant="h6"
                className={classes.title}
                onClick={handleMain}
              >
                Main
              </Typography>

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
              <XRButton className={classes.root} />
              <SaveMenu {...props} setShowImportExport={setShowImportExport} />
            </Toolbar>
          </AppBar>
        </Slide>
      </div> */}
      <div
        className={
          showRenderSettings || showAudioSettings || showImportExport
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
                <FPSInfo />
              </div>
            </Paper>
          </ClickAwayListener>
        ) : null}
        {showAudioSettings && audioParams ? (
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
                <ParamSlider
                  title="Accumulation"
                  min={0}
                  max={8}
                  step={0.001}
                  value={audioParams.accum}
                  onChange={setAudioParam(AudioParamKey.accum)}
                />
                <ParamSlider
                  title="Drag"
                  min={-0.00125}
                  max={0.00125}
                  step={0.000001}
                  value={audioParams.drag}
                  onChange={setAudioParam(AudioParamKey.drag)}
                />
                <ParamSlider
                  title="Frame Downsampling"
                  min={0.5}
                  max={8}
                  step={0.002}
                  value={audioParams.decimation}
                  onChange={setAudioParam(AudioParamKey.decimation)}
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
        {showImportExport && (
          <ClickAwayListener onClickAway={(_) => setShowImportExport(false)}>
            <ShareContainer
              importSettings={(settings) => props.manager.update(settings)}
              currentSettings={{
                visual: props.visual,
                params: rc.export(),
              }}
            />
          </ClickAwayListener>
        )}
      </div>
    </div>
  );
};

interface ShareProps {
  importSettings: (settings: ExportSettings) => void;
  currentSettings: ExportSettings;
}

class ShareContainer extends React.PureComponent<ShareProps> {
  render() {
    return <Share {...this.props} />;
  }
}

const Share: React.FC<ShareProps> = (props) => {
  const classes = useStyles();
  const [imported, setImported] = useState("");
  const [settings, setSettings] = useState<ExportSettings | null>(null);
  const exported = Base64.encodeURL(JSON.stringify(props.currentSettings));
  const exportURL = `${process.env.REACT_APP_HOSTNAME}/#${exported}`;
  return (
    <Paper className={classes.settings} style={{ width: "unset" }}>
      <div className={classes.settingsOptions}>
        <Typography variant="h4">Import</Typography>
        <TextField
          fullWidth
          multiline
          variant="outlined"
          placeholder="Import Token or JSON"
          className={classes.importTextArea}
          onChange={(event) => {
            const value = event.currentTarget.value;
            try {
              let params;
              try {
                params = JSON.parse(value);
              } catch (e) {
                const dec = Base64.decode(value);
                params = JSON.parse(dec);
              }
              setSettings(params);
              setImported(JSON.stringify(params, undefined, 3));
            } catch (e) {
              setSettings(null);
              setImported(`failed to decode settings: ${e}`);
            }
          }}
        />
        {imported && (
          <React.Fragment>
            <TextField
              multiline
              variant="outlined"
              className={classes.importTextArea}
              value={imported}
              onChange={(event) => {
                setImported(event.currentTarget.value);
                try {
                  setSettings(JSON.parse(event.currentTarget.value));
                } catch (e) {
                  setSettings(null);
                }
              }}
            />
            <Button
              className={classes.button}
              disabled={settings === null}
              onClick={() => settings && props.importSettings(settings)}
            >
              Import Settings
            </Button>
          </React.Fragment>
        )}
        <Typography variant="h4">Export</Typography>
        <TextField
          title="Token"
          fullWidth
          multiline
          variant="outlined"
          className={classes.importTextArea}
          value={exported}
        />
        <TextField
          title="Shareable URL"
          fullWidth
          variant="outlined"
          className={classes.importTextArea}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton onClick={() => copy(exportURL)}>
                  <FileCopyIcon />
                </IconButton>
              </InputAdornment>
            ),
          }}
          value={exportURL}
        />
      </div>
    </Paper>
  );
};

export default MenuPanel;
