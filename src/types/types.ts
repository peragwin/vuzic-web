import { AudioProcessor } from "../audio/audio";
import { AudioController } from "../hooks/audio";

export type VisualOptions = "warp" | "pps" | "pps3" | "particleLife";

export interface RouteProps {
  canvas: React.RefObject<HTMLCanvasElement>;
  audio: AudioController; // React.RefObject<AudioProcessor>;
  setFrameRate: (fr: number) => void;
  setErrorState: (e: Error) => void;
}
