import { useCallback, RefObject } from "react";
import type { MentionDraft } from "@/types/chat";

interface UsePasteToInputProps {
  input: string;
  setInput: (value: string) => void;
  setMentions: (fn: (prev: MentionDraft[]) => MentionDraft[]) => void;
  reconcileMentionsByDisplay: (display: string, prev: MentionDraft[]) => MentionDraft[];
  closeMention: () => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

export function usePasteToInput({
  input,
  setInput,
  setMentions,
  reconcileMentionsByDisplay,
  closeMention,
  textareaRef,
}: UsePasteToInputProps) {
  const pasteToInput = useCallback(
    (text: string, mode: "replace" | "append" | "upsert" = "replace") => {
      const cleaned = (text || "").trim();
      if (!cleaned) return;

      const next = (() => {
        if (mode === "replace") return cleaned;

        if (mode === "upsert") {
          // Upsert by "<field>:" prefix (first colon defines the key)
          const colon = cleaned.indexOf(":");
          if (colon <= 0) {
            // No clear field key; fall back to append behavior
            mode = "append";
          } else {
            const key = cleaned.slice(0, colon).trim();
            if (!key) {
              mode = "append";
            } else {
              const rawLines = input.split(/\r?\n/);
              const lines = rawLines.map((s) => s.replace(/\s+$/, ""));
              const needle = key + ":";

              let replaced = false;
              const out = lines.map((line) => {
                const t = line.trimStart();
                if (!replaced && t.startsWith(needle)) {
                  replaced = true;
                  return cleaned;
                }
                return line;
              });

              if (!replaced) {
                const base = out.join("\n").trim() ? out.join("\n").replace(/\s+$/, "") : "";
                return base ? base + "\n" + cleaned : cleaned;
              }

              return out.join("\n");
            }
          }
        }

        if (mode !== "append") return cleaned;

        const lines = input
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
        const exists = new Set(lines);
        if (exists.has(cleaned)) return input;

        const base = input.trim() ? input.replace(/\s+$/, "") : "";
        return base ? base + "\n" + cleaned : cleaned;
      })();

      setInput(next);
      setMentions((prev) => reconcileMentionsByDisplay(next, prev));
      closeMention();

      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        const pos = el.value.length;
        el.setSelectionRange(pos, pos);
      });
    },
    [input, setInput, setMentions, reconcileMentionsByDisplay, closeMention, textareaRef]
  );

  return { pasteToInput };
}
