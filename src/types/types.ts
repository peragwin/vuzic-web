import { AudioProcessor } from "../audio/audio";

export type VisualOptions = "warp" | "pps";

export interface RouteProps {
  canvas: React.RefObject<HTMLCanvasElement>;
  audio: React.RefObject<AudioProcessor>;
  setFrameRate: (fr: number) => void;
  setErrorState: (e: Error) => void;
}
