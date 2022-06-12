import React from "react";

import CreateIcon from "@mui/icons-material/Create";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import IconButton from "@mui/material/IconButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import SaveIcon from "@mui/icons-material/Save";
import ShareIcon from "@mui/icons-material/Share";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import { MenuPanelProps } from "./MenuPanel";
import { AudioParamKey, AudioProcessorParams } from "../audio/audio";
import { makeStyles } from "@mui/styles";
import { VisualOptions } from "../types/types";
import { ListItemButton, ListItemText } from "@mui/material";

const useStyles = makeStyles({
  title: {
    flexGrow: 1,
  },
});

interface ProfileData {
  pps?: { params: any };
  pps3?: { params: any };
  warp?: { params: any };
  particleLife?: { params: any };
  audioParams: AudioProcessorParams;
  thumb?: string;
}

interface SaveMenuProps extends MenuPanelProps {
  setShowImportExport: (show: boolean) => void;
  listItemClass?: string;
  textClass?: string;
}

const setProfile = (
  visual: VisualOptions,
  name: string,
  params: any,
  audioParams: AudioProcessorParams,
  thumb?: string
) => {
  const data = {
    [visual]: { params },
    audioParams,
    thumb,
  };
  window.localStorage.setItem(
    `profile.${visual}.${name}`,
    JSON.stringify(data)
  );
};

const loadProfileData = (visual: VisualOptions, name: string) => {
  const profile = window.localStorage.getItem(`profile.${visual}.${name}`);
  if (profile === null) return;
  return JSON.parse(profile) as ProfileData;
};

const SaveMenu: React.FC<SaveMenuProps> = (props: SaveMenuProps) => {
  const { visual, manager } = props;
  const renderController = manager.controller(visual);
  const audioController = manager.audio;
  const audioParams = audioController.params;

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

  const handleShowThumb = (name: string) => () => {
    setShowThumb("");
    const profile = loadProfileData(visual, name);
    if (profile) {
      if (profile.thumb) {
        setThumb(profile.thumb);
        setShowThumb(name);
      }
    }
  };

  const saveProfile = (name: string) => {
    handleCloseMenu();

    let thumb: string | undefined;

    const save = (thumb?: string) => {
      const data = renderController.exportPreset
        ? renderController.exportPreset()
        : renderController.params;
      setProfile(visual, name, data, audioParams, thumb);
    };

    const capture = props.captureCanvas();
    if (capture) {
      const resizedCanvas = document.createElement("canvas");
      const ctx = resizedCanvas.getContext("2d");
      resizedCanvas.height = 256;
      resizedCanvas.width = 256;
      if (ctx) {
        thumb = ""; // assign thumb so we know that save will be deferred to the img onload
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, 256, 256);
          thumb = resizedCanvas.toDataURL();
          resizedCanvas.remove();
          save(thumb);
        };
        img.src = capture;
      }
    }
    // thumb wasnt assigned so save now
    if (thumb === undefined) {
      save();
    }
  };

  const loadProfile = (name: string, audioOnly?: boolean) => {
    handleCloseMenu();

    const prof = loadProfileData(visual, name);
    if (!prof) return;

    const renderParams = prof[visual];
    const audioParams = prof.audioParams;

    if (renderParams && !audioOnly) {
      renderController.update({ type: "all", value: renderParams.params });
    }
    audioController.update({
      type: AudioParamKey.all,
      value: audioParams,
    });
  };

  const classes = useStyles();

  return (
    <React.Fragment>
      <ListItemButton onClick={handleShowMenu}>
        <ListItemIcon className={props.listItemClass}>
          <SaveIcon />
        </ListItemIcon>
        <ListItemText
          className={props.textClass}
          primary="Save / Load"
          primaryTypographyProps={{ variant: "h6" }}
        />
      </ListItemButton>
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
        <MenuItem
          onClick={() => {
            handleCloseMenu();
            props.setShowImportExport(true);
          }}
        >
          <ListItemIcon>
            <ShareIcon />
          </ListItemIcon>
          <Typography variant="inherit">Share</Typography>
        </MenuItem>
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
              title={
                showThumb ? <img src={thumb} alt="thumbnail" /> : "No Preview"
              }
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
    </React.Fragment>
  );
};

export default SaveMenu;
