import React from "react";

import IconButton from "@mui/material/IconButton";
import SvgIcon, { SvgIconProps } from "@mui/material/SvgIcon";
import { XRManager } from "../gfx/xr/manager";
import { atom, useRecoilValue } from "recoil";
import { ListItemButton, ListItemIcon, ListItemText } from "@mui/material";

type XRIconProps = SvgIconProps & { supported: boolean };

const XRIcon = (props: XRIconProps) => {
  const svgProps = { ...props, supported: undefined };
  return props.supported ? (
    <SvgIcon {...svgProps} viewBox="0 0 28 18" xmlSpace="preserve">
      <path
        d="M26.8,1.1C26.1,0.4,25.1,0,24.2,0H3.4c-1,0-1.7,0.4-2.4,1.1C0.3,1.7,0,2.7,0,3.6v10.7
      c0,1,0.3,1.9,0.9,2.6C1.6,17.6,2.4,18,3.4,18h5c0.7,0,1.3-0.2,1.8-0.5c0.6-0.3,1-0.8,1.3-1.4l
      1.5-2.6C13.2,13.1,13,13,14,13v0h-0.2 h0c0.3,0,0.7,0.1,0.8,0.5l1.4,2.6c0.3,0.6,0.8,1.1,1.3,
      1.4c0.6,0.3,1.2,0.5,1.8,0.5h5c1,0,2-0.4,2.7-1.1c0.7-0.7,1.2-1.6,1.2-2.6 V3.6C28,2.7,27.5,
      1.7,26.8,1.1z M7.4,11.8c-1.6,0-2.8-1.3-2.8-2.8c0-1.6,1.3-2.8,2.8-2.8c1.6,0,2.8,1.3,2.8,2.8
      C10.2,10.5,8.9,11.8,7.4,11.8z M20.1,11.8c-1.6,0-2.8-1.3-2.8-2.8c0-1.6,1.3-2.8,2.8-2.8C21.7
      ,6.2,23,7.4,23,9 C23,10.5,21.7,11.8,20.1,11.8z"
      />
    </SvgIcon>
  ) : (
    <SvgIcon {...svgProps} viewBox="0 0 28 18" xmlSpace="preserve">
      <path
        d="M17.6,13.4c0-0.2-0.1-0.4-0.1-0.6c0-1.6,1.3-2.8,2.8-2.8s2.8,1.3,2.8,2.8s-1.3,2.8-2.8,2.8
      c-0.2,0-0.4,0-0.6-0.1l5.9,5.9c0.5-0.2,0.9-0.4,1.3-0.8
      c0.7-0.7,1.1-1.6,1.1-2.5V7.4c0-1-0.4-1.9-1.1-2.5c-0.7-0.7-1.6-1-2.5-1
      H8.1 L17.6,13.4z"
      />
      <path
        d="M10.1,14.2c-0.5,0.9-1.4,1.4-2.4,1.4c-1.6,0-2.8-1.3-2.8-2.8c0-1.1,0.6-2,1.4-2.5
      L0.9,5.1 C0.3,5.7,0,6.6,0,7.5v10.7c0,1,0.4,1.8,1.1,2.5c0.7,0.7,1.6,1,2.5,1
      h5c0.7,0,1.3-0.1,1.8-0.5c0.6-0.3,1-0.8,1.3-1.4l1.3-2.6 L10.1,14.2z"
      />
      <path
        d="M25.5,27.5l-25-25C-0.1,2-0.1,1,0.5,0.4l0,0C1-0.1,2-0.1,2.6,0.4l25,25c0.6,0.6,0.6,1.5
      ,0,2.1l0,0 C27,28.1,26,28.1,25.5,27.5z"
      />
    </SvgIcon>
  );
};

interface Props {
  className?: string;
  listItemClass?: string;
  textClass?: string;
}

export const xrManagerState = atom<XRManager | null>({
  key: "xrManager",
  default: null,
  dangerouslyAllowMutability: true,
});

export const XRButton: React.FC<Props> = (props) => {
  const manager = useRecoilValue(xrManagerState);

  const [xrSupported, setXrSupported] = React.useState(false);
  const [sessionActive, setSessionActive] = React.useState(false);

  React.useEffect(() => {
    if (!manager) return;

    manager.queryForXR().then((supported) => setXrSupported(supported));
  }, [manager]);

  const handleClick = async () => {
    if (!xrSupported || !manager) return;

    if (!sessionActive) {
      const sessionOK = await manager.requestSession();
      setSessionActive(sessionOK);
    } else {
      await manager.cancelSession();
      setSessionActive(false);
    }
  };

  return (
    <ListItemButton onClick={handleClick}>
      <ListItemIcon className={props.listItemClass}>
        <XRIcon supported={xrSupported} />
      </ListItemIcon>
      <ListItemText
        className={props.textClass}
        primary="Enable VR"
        primaryTypographyProps={{ variant: "h6" }}
      />
    </ListItemButton>
  );
};
