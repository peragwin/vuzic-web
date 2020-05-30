export interface ParamSliderConfig {
  title: string;
  min: number;
  max: number;
  step: number;
  update: (e: React.ChangeEvent<{}>, value: number) => void;
}

export interface RenderController {
  config(): ParamSliderConfig[];
  values(): any[];
  params: any;
  update: (action: { type: "all"; value: any }) => void;
}
