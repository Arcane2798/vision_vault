import { useCallback, useEffect, useRef, useState } from 'react';

type AudioCtor = typeof AudioContext;

/**
 * Short alarm beep via Web Audio. Browsers only allow sound after a user gesture, so the audio context is
 * created on the first click / key press anywhere on the page; until then `enabled` is false.
 */
export function useAlertSound() {
  const ctx = useRef<AudioContext | null>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (enabled) return;
    const enable = () => {
      try {
        const Ctor: AudioCtor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
        if (!Ctor) return;
        ctx.current ??= new Ctor();
        void ctx.current.resume().then(() => setEnabled(ctx.current?.state === 'running'));
      } catch {
        // no audio on this device - the red banner still shows
      }
    };
    window.addEventListener('pointerdown', enable);
    window.addEventListener('keydown', enable);
    return () => {
      window.removeEventListener('pointerdown', enable);
      window.removeEventListener('keydown', enable);
    };
  }, [enabled]);

  /** Two short 880 Hz beeps (~0.5 s). Silent until sound is enabled. */
  const beep = useCallback(() => {
    const ac = ctx.current;
    if (!ac || ac.state !== 'running') return;
    const start = ac.currentTime;
    [0, 0.25].forEach((offset) => {
      const t = start + offset;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'square';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain).connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  }, []);

  return { enabled, beep };
}
