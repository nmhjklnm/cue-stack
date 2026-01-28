import { useState, useEffect, RefObject } from "react";

interface UseComposerHeightProps {
  inputWrapRef: RefObject<HTMLDivElement | null>;
}

export function useComposerHeight({ inputWrapRef }: UseComposerHeightProps) {
  const [composerPadPx, setComposerPadPx] = useState(36 * 4);

  useEffect(() => {
    const el = inputWrapRef ? inputWrapRef.current : null;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      const bottomOffsetPx = 20; // matches ChatComposer: bottom-5
      const extraPx = 12;
      const next = Math.max(0, Math.ceil(rect.height + bottomOffsetPx + extraPx));
      setComposerPadPx(next);
    };

    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, [inputWrapRef]);

  return { composerPadPx };
}
