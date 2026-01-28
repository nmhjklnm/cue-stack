import { useEffect, RefObject } from "react";

interface UseTextareaAutogrowProps {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  input: string;
}

export function useTextareaAutogrow({ textareaRef, input }: UseTextareaAutogrowProps) {
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    // Auto-grow up to ~8 lines; beyond that, keep it scrollable
    el.style.height = "0px";
    const maxPx = 8 * 22; // ~8 lines
    el.style.height = Math.min(el.scrollHeight, maxPx) + "px";
    el.style.overflowY = el.scrollHeight > maxPx ? "auto" : "hidden";
  }, [input, textareaRef]);
}
