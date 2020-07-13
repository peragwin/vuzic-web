import { AudioProcessor } from "../audio/audio";

export type VisualOptions = "warp" | "pps" | "pps3";

export interface RouteProps {
  canvas: React.RefObject<HTMLCanvasElement>;
  audio: React.RefObject<AudioProcessor>;
  setFrameRate: (fr: number) => void;
  setErrorState: (e: Error) => void;
}
