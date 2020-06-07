import React, { useEffect, useState, useRef } from "react";

interface WakeLock {
  release(): void;
}

interface WakeLocker {
  wakeLock: {
    request(req: string): Promise<WakeLock>;
  };
}

const supportsWakelock = (nav: Navigator): nav is Navigator & WakeLocker => {
  const wn = nav as Navigator & WakeLocker;
  return wn.wakeLock !== undefined && wn.wakeLock.request !== undefined;
};

const useFullscreen = () => {
  const [wakelockEnabled] = useState(true); // TODO: use setWakelockEnabled
  const wakelockListenters = useRef<{ fullscreen: any; visibility: any }>({
    fullscreen: null,
    visibility: null,
  });

  useEffect(() => {
    if (!wakelockEnabled) {
      const { fullscreen, visibility } = wakelockListenters.current;
      document.removeEventListener("fullscreenchange", fullscreen);
      document.removeEventListener("visibilitychange", visibility);
      return;
    }

    const state: { wakelock: WakeLock | null } = { wakelock: null };

    const handleChange = async (acquire: boolean) => {
      if (acquire) {
        if (supportsWakelock(navigator)) {
          try {
            state.wakelock = await navigator.wakeLock.request("screen");
            console.log("wakelock acquired");
          } catch (e) {
            console.log("browser wakeLock not supported:", e);
          }
        }
      } else if (state.wakelock) {
        const wl = state.wakelock;
        state.wakelock = null;
        wl.release();
        console.log("wakelock released");
      }
    };
    const fullscreen = (wakelockListenters.current.fullscreen = () =>
      handleChange(!!document.fullscreenElement));
    const visibility = (wakelockListenters.current.visibility = () => {
      if (state.wakelock !== null && document.visibilityState === "visible") {
        handleChange(true);
      }
    });
    document.addEventListener("fullscreenchange", fullscreen);
    document.addEventListener("visibilitychange", visibility);
  }, [wakelockEnabled]);

  const handleFullscreen = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!document.fullscreenEnabled) return;
    const isFullscreen = document.fullscreenElement !== null;
    if (isFullscreen) {
      document.exitFullscreen();
    } else {
      document.body.requestFullscreen();
    }
  };

  return handleFullscreen;
};

export default useFullscreen;
