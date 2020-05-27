import React, { useState } from 'react';
import { makeStyles } from '@material-ui/core'

import AppBar from '@material-ui/core/AppBar'
import Toolbar from '@material-ui/core/Toolbar'
import Typography from '@material-ui/core/Typography'
import IconButton from '@material-ui/core/IconButton'
import SaveIcon from '@material-ui/icons/Save'
import MenuIcon from '@material-ui/icons/Menu'
import CreateIcon from '@material-ui/icons/Create'
import ListItemIcon from '@material-ui/core/ListItemIcon'
import FolderOpenIcon from '@material-ui/icons/FolderOpen'
import Slide from '@material-ui/core/Slide';
import Paper from '@material-ui/core/Paper';
import ClickAwayListener from '@material-ui/core/ClickAwayListener';
import Slider from '@material-ui/core/Slider'
import Menu from '@material-ui/core/Menu'
import MenuItem from '@material-ui/core/MenuItem'

import { RenderParams, RenderParamUpdate, RenderParamKey } from '../gfx/warpgrid/render';
import { AudioProcessorParams, AudioParamUpdate, AudioParamKey, FilterParams } from '../audio/audio';

const useStyles = makeStyles(theme => ({
  root: {
    flexGrow: 1,
  },
  background: {
    background: 'linear-gradient(90deg, rgba(233,30,99,1) 0%, rgba(213,0,249,1) 50%, rgba(33,150,243,1) 100%)',
  },
  menuButton: {
    marginRight: theme.spacing(2),
  },
  title: {
    flexGrow: 1,
  },
  menuTriggerArea: {
    position: 'absolute',
    top: 0,
    zIndex: 100,
    minHeight: '20vh',
    minWidth: '100vw',
  },
  settingsContainer: {
    width: '100vw',
    height: '100vh',
    background: 'rgba(0,0,0,0)',
    position: 'absolute',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'scroll',
  },
  settings: {
    zIndex: 200,
    background: 'rgba(255, 255, 255, .1)',
    boxShadow: 'inset 0 0 10px rgba(255,255,255,.8)',
    borderRadius: '30px',
    width: '80vw',
    minHeight: '70vh',
    color: 'white',
    padding: '40px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsOptions: {
    width: '100%',
    height: '100%',
    margin: theme.spacing(1),
  },
  slider: {
    width: '90%',
    margin: 'auto',
  },
  filterParamSlider: {
    borderTop: '1px',
    borderBottom: '1px',
  },
}));

interface ParamSliderProps {
  title: string,
  min: number,
  max: number,
  value: number,
  onChange: (e: React.ChangeEvent<{}>, value: number) => void,
  step: number,
  displayValue?: number,
}

const ParamSlider: React.FC<ParamSliderProps> = (props: ParamSliderProps) => {
  const { title, min, max, value, onChange, step } = props
  const classes = useStyles()
  return (
    <div>
      <Typography id={`slider-${title}`} gutterBottom>
        {title} = {value}
      </Typography>
      <Slider className={classes.slider}
        min={min} max={max}
        aria-labelledby={`slider-${title}`}
        step={step}
        value={value || 0}
        // @ts-ignore
        onChange={onChange}
        valueLabelDisplay="auto"
      />
    </div>
  )
}

interface FilterParamSliderProps {
  title: string,
  min: number,
  max: number,
  value: FilterParams,
  onChange: (e: React.ChangeEvent<{}>, value: FilterParams) => void,
  step: number,
}

const FilterParamSlider: React.FC<FilterParamSliderProps> = (props: FilterParamSliderProps) => {
  const { title, min, max, value, onChange, step } = props
  const handleChange = (key: 'tao' | 'gain') => (e: React.ChangeEvent<{}>, val: number | number[]) => {
    switch (key) {
      case 'tao':
        onChange(e, { ...value, tao: (val as number) * (val as number) })
        break
      case 'gain':
        onChange(e, { ...value, gain: val as number })
        break
    }
  }
  const classes = useStyles()
  return (
    <div className={classes.filterParamSlider}>
      <Typography id={`slider-${title}`}>
        {title}
      </Typography>
      <Typography id={`slider-${title}-tao`} gutterBottom>
        Tao = {value.tao}
      </Typography>
      <Slider className={classes.slider}
        min={Math.sqrt(min)} max={Math.sqrt(max)}
        aria-labelledby={`slider-${title}-tao`}
        step={step}
        value={Math.sqrt(value.tao)}
        onChange={handleChange('tao')}
        valueLabelDisplay="off"
      />
      <Typography id={`slider-${title}-gain`} gutterBottom>
        Gain = {value.gain}
      </Typography>
      <Slider className={classes.slider}
        min={-2} max={2}
        aria-labelledby={`slider-${title}-gain`}
        step={.01}
        value={value.gain}
        onChange={handleChange('gain')}
        valueLabelDisplay="auto"
      />
    </div>
  )
}

interface MenuPanelProps {
  renderParams: RenderParams,
  updateRenderParam: (action: RenderParamUpdate) => void,
  audioParams: AudioProcessorParams,
  updateAudioParam: (action: AudioParamUpdate) => void,
  children?: React.ReactNode,
  canvas?: React.RefObject<HTMLCanvasElement>,
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

  const { renderParams, audioParams } = props
  const saveProfile = (name: string) => {
    window.localStorage.setItem(`profile.${name}`, JSON.stringify({ renderParams, audioParams }))
    handleCloseMenu()
  }

  const loadProfile = (name: string) => {
    const profile = window.localStorage.getItem(`profile.${name}`)
    if (profile === null) return
    console.log(profile)
    const { renderParams, audioParams } = JSON.parse(profile)
    props.updateRenderParam({ type: RenderParamKey.all, value: renderParams })
    props.updateAudioParam({ type: AudioParamKey.all, value: audioParams })
    handleCloseMenu()
  }

  const classes = useStyles()

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
          vertical: 'top',
          horizontal: 'right',
        }}
        keepMounted
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        open={open}
        onClose={handleCloseMenu}
      >
        {["Default", "Bright", "Dim", "Sensitive", "Other"].map(name =>
          <div>
            <MenuItem key={"save" + name} onClick={() => saveProfile(name)}>
              <ListItemIcon>
                <CreateIcon />
              </ListItemIcon>
              <Typography variant="inherit">{`Save Profile: ${name}`}</Typography>
            </MenuItem>
            <MenuItem key={"load" + name} onClick={() => loadProfile(name)}>
              <ListItemIcon>
                <FolderOpenIcon />
              </ListItemIcon>
              <Typography variant="inherit">{`Load Profile: ${name}`}</Typography>
            </MenuItem>
          </div>)}
      </Menu>
    </div>)
}

const MenuPanel: React.FC<MenuPanelProps> = (props: MenuPanelProps) => {
  const classes = useStyles();
  const [showMenu, setShowMenu] = useState(false)
  const [showAudioSettings, setShowAudioSettings] = useState(false)
  const [showRenderSettings, setShowRenderSettings] = useState(false)

  const handleShowMenu = () => {
    setShowMenu(true)
  }

  const handleShowRenderSettings = () => {
    setShowAudioSettings(false)
    setShowRenderSettings(true)
  }

  const handleHideRenderSettings = () => {
    setShowRenderSettings(false)
  }

  const handleShowAudioSettings = () => {
    setShowRenderSettings(false)
    setShowAudioSettings(true)
  }

  const handleHideAudioSettings = () =>
    setShowAudioSettings(false)

  const renderParams = props.renderParams
  const setRenderParam = (type: RenderParamKey) =>
    (e: React.ChangeEvent<{}>, value: number) => props.updateRenderParam({ type, value })

  const audioParams = props.audioParams
  const setAudioParam = (type: AudioParamKey) =>
    (e: React.ChangeEvent<{}>, value: number | FilterParams) => props.updateAudioParam({ type, value })

  return (<div>
    <div className={classes.menuTriggerArea} onClick={() => console.log("foo")} onMouseOver={handleShowMenu} onMouseOut={() => setShowMenu(false)}>
      <Slide appear={false} in={showMenu} direction="down">
        <AppBar position="static" className={classes.background}>
          <Toolbar>
            <IconButton edge="start" className={classes.menuButton} color="inherit" aria-label="renderMenu">
              <MenuIcon onClick={handleShowRenderSettings} />
            </IconButton>
            <Typography variant="h6" className={classes.title} onClick={handleShowRenderSettings}>
              Visualizer
            </Typography>
            <IconButton edge="start" className={classes.menuButton} color="inherit" aria-label="audioMenu">
              <MenuIcon onClick={handleShowAudioSettings} />
            </IconButton>
            <Typography variant="h6" className={classes.title} onClick={handleShowAudioSettings}>
              Audio
            </Typography>
            <SaveMenu {...props} />
          </Toolbar>
        </AppBar>
      </Slide>
    </div>
    <div className={(showRenderSettings || showAudioSettings) ? classes.settingsContainer : undefined}>
      {showRenderSettings ?
        <ClickAwayListener onClickAway={handleHideRenderSettings}>
          <Paper className={classes.settings}>
            <div className={classes.settingsOptions}>
              <ParamSlider title="Color Scaler" min={-4} max={4} step={.01} value={renderParams.valueScale} onChange={setRenderParam(RenderParamKey.valueScale)} />
              <ParamSlider title="Color Offset" min={-4} max={4} step={.01} value={renderParams.valueOffset} onChange={setRenderParam(RenderParamKey.valueOffset)} />
              <ParamSlider title="Lightness Scaler" min={-4} max={4} step={.01} value={renderParams.lightnessScale} onChange={setRenderParam(RenderParamKey.lightnessScale)} />
              <ParamSlider title="Lightness Offset" min={-4} max={4} step={.01} value={renderParams.lightnessOffset} onChange={setRenderParam(RenderParamKey.lightnessOffset)} />
              <ParamSlider title="Alpha Scale" min={-2} max={8} step={.01} value={renderParams.alphaScale} onChange={setRenderParam(RenderParamKey.alphaScale)} />
              <ParamSlider title="Alpha Offset" min={-4} max={4} step={.01} value={renderParams.alphaOffset} onChange={setRenderParam(RenderParamKey.alphaOffset)} />
              <ParamSlider title="Horizontal Warp" min={0} max={16} step={.05} value={renderParams.warpScale} onChange={setRenderParam(RenderParamKey.warpScale)} />
              <ParamSlider title="Horizontal Warp Offset" min={-1} max={4} step={.01} value={renderParams.warpOffset} onChange={setRenderParam(RenderParamKey.warpOffset)} />
              <ParamSlider title="Vertical Warp" min={-2} max={8} step={.01} value={renderParams.scaleScale} onChange={setRenderParam(RenderParamKey.scaleScale)} />
              <ParamSlider title="Vertical Warp Offset" min={-1} max={4} step={.01} value={renderParams.scaleOffset} onChange={setRenderParam(RenderParamKey.scaleOffset)} />
              <ParamSlider title="Color Period" min={1} max={360} step={1} value={renderParams.period} onChange={setRenderParam(RenderParamKey.period)} />
              <ParamSlider title="Color Cycle Rate" min={.0001} max={.01} step={.0005} value={renderParams.colorCycle} onChange={setRenderParam(RenderParamKey.colorCycle)} />
            </div>
          </Paper>
        </ClickAwayListener>
        : null}
      {showAudioSettings ?
        <ClickAwayListener onClickAway={handleHideAudioSettings}>
          <Paper className={classes.settings}>
            <div className={classes.settingsOptions}>
              <ParamSlider title="Preemphasis" min={1} max={16} step={.01} value={audioParams.preemphasis} onChange={setAudioParam(AudioParamKey.preemphasis)} />
              <ParamSlider title="Sensitivity Scale" min={-1} max={8} step={.01} value={audioParams.ampScale} onChange={setAudioParam(AudioParamKey.ampScale)} />
              <ParamSlider title="Sensitivity Offset" min={-2} max={8} step={.01} value={audioParams.ampOffset} onChange={setAudioParam(AudioParamKey.ampOffset)} />
              <ParamSlider title="Differential Sensitivity" min={-1} max={4} step={.01} value={audioParams.diffGain} onChange={setAudioParam(AudioParamKey.diffGain)} />
              <ParamSlider title="Differential Sync" min={0} max={.1} step={.001} value={audioParams.sync} onChange={setAudioParam(AudioParamKey.sync)} />
              <ParamSlider title="Decay" min={0} max={2} step={.001} value={audioParams.decay} onChange={setAudioParam(AudioParamKey.decay)} />
              <FilterParamSlider title="Intensity Filter" min={0} max={12} step={.01} value={audioParams.gainFilterParams} onChange={setAudioParam(AudioParamKey.gainFilterParams)} />
              <FilterParamSlider title="Intensity Feedback" min={0} max={1000} step={1} value={audioParams.gainFeedbackParams} onChange={setAudioParam(AudioParamKey.gainFeedbackParams)} />
              <FilterParamSlider title="Differential Filter" min={0} max={12} step={.01} value={audioParams.diffFilterParams} onChange={setAudioParam(AudioParamKey.diffFilterParams)} />
              <FilterParamSlider title="Differential Feedback" min={0} max={1000} step={1} value={audioParams.diffFeedbackParams} onChange={setAudioParam(AudioParamKey.diffFeedbackParams)} />
              <FilterParamSlider title="Positive Bias Scale Filter" min={0} max={1000} step={1} value={audioParams.posScaleFilterParams} onChange={setAudioParam(AudioParamKey.posScaleFilterParams)} />
              <FilterParamSlider title="Negative Bias Scale Filter" min={0} max={1000} step={1} value={audioParams.negScaleFilterParams} onChange={setAudioParam(AudioParamKey.negScaleFilterParams)} />
            </div>
          </Paper>
        </ClickAwayListener>
        : null}
    </div>
  </div>)
}

export default MenuPanel
