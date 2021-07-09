# Vuzic Visualizer

![particle-simulation](https://github.com/peragwin/vuzic-web/blob/master/public/particles-2d.png)
[Try me!](https://vuzic.app/pps?params=WyJ2MC4zIiwxMTkuMSwtMC4yOSwwLjE0NiwzLjA1LDAuMDEwMSw1MTQ3Miw0LjAxLDEsMC4xLDIsMCwxLDAsNDUsNDUsMCwwXQ) (🌋 this is running using a GTX 1660 with compute shaders enabled, ymmv...)

Currently consists of separate particle simulator in 2D and 3D, and a rewrite of the audio visualization that runs on my LED panels.

![vuzic-audio-visualizer](https://github.com/peragwin/vuzic-web/blob/master/public/vuzic-512.png)

If you look closely, there's some interesting typescript+webgl stuff going on. A year ago, webgl2-compute shaders were available in chrome, so this takes advantage of that. However, support has been dropped in recent versions in the spectre of the upcoming webgpu api. At some point, my intention would be to rewrite all the webgl here to use webgpu.

There's even some webxr support if you have compatible hardware! (but this is basically not runnable without the compute shader because it will use too much cpu and not leave enough cycles for head/motion tracking) Eventually, the particle simulations should be interractive with the user in space.

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app). `yarn start`, `yarn build`, etc...
