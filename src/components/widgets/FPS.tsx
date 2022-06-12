import React from "react";
import { atom, useRecoilValue } from "recoil";

import Typography from "@mui/material/Typography";

export const fpsState = atom({
  key: "frameRate",
  default: 0,
});

export const FPSInfo: React.FC<{}> = () => {
  const fps = useRecoilValue(fpsState);
  return <Typography variant="overline">FPS: {fps}</Typography>;
};
