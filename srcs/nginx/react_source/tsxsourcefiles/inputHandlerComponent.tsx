import React, { useEffect } from "react";

interface InputTrackerProps {
  keys: string[]; // keys to track, e.g. ["w", "ArrowUp"]
  keyStates: Record<string, 0 | 1>; // parent state
  setKeyStates: React.Dispatch<React.SetStateAction<Record<string, 0 | 1>>>; // parent updater
}

export default function InputTracker({ keys, keyStates, setKeyStates }: InputTrackerProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (keys.includes(e.key) && keyStates[e.key] === 0) {
        setKeyStates((prev) => ({ ...prev, [e.key]: 1 }));
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (keys.includes(e.key) && keyStates[e.key] === 1) {
        setKeyStates((prev) => ({ ...prev, [e.key]: 0 }));
      }

    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [keys, keyStates, setKeyStates]);

  return null; // no UI
}
