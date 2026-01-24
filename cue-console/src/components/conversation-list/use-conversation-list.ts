import { useState, useEffect, useCallback, useRef } from "react";
import { fetchConversationList, fetchArchivedConversationCount, fetchPinnedConversationKeys } from "@/lib/api/conversation-list";
import type { ConversationItem } from "@/lib/types";
import { perfEnabled } from "./utils";

export function useConversationList(view: "active" | "archived") {
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [archivedCount, setArchivedCount] = useState(0);
  const [pinnedKeys, setPinnedKeys] = useState<string[]>([]);

  const loadData = useCallback(async () => {
    const t0 = perfEnabled() ? performance.now() : 0;
    const data = await fetchConversationList({ view });
    setItems(data);
    const count = await fetchArchivedConversationCount();
    setArchivedCount(count);
    if (t0) {
      const t1 = performance.now();
      console.log(`[perf] conversationList loadData view=${view} items=${data.length} ${(t1 - t0).toFixed(1)}ms`);
    }
  }, [view]);

  useEffect(() => {
    void (async () => {
      try {
        const keys = await fetchPinnedConversationKeys(view);
        setPinnedKeys(Array.isArray(keys) ? keys : []);
      } catch {
        setPinnedKeys([]);
      }
    })();
  }, [view]);

  const loadDataRef = useRef(loadData);
  useEffect(() => {
    loadDataRef.current = loadData;
  }, [loadData]);

  useEffect(() => {
    const t0 = setTimeout(() => {
      void loadDataRef.current();
    }, 0);

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void loadDataRef.current();
    };

    const interval = setInterval(tick, 10_000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") tick();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearTimeout(t0);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const onAgentNameUpdated = (evt: Event) => {
      const e = evt as CustomEvent<{ agentId: string; displayName: string }>;
      const agentId = e.detail?.agentId;
      const displayName = (e.detail?.displayName || "").trim();
      if (!agentId || !displayName) return;
      setItems((prev) =>
        prev.map((it) =>
          it.type === "agent" && it.id === agentId ? { ...it, displayName } : it
        )
      );
    };

    window.addEventListener("cuehub:agentDisplayNameUpdated", onAgentNameUpdated);
    return () => {
      window.removeEventListener("cuehub:agentDisplayNameUpdated", onAgentNameUpdated);
    };
  }, []);

  return {
    items,
    setItems,
    archivedCount,
    pinnedKeys,
    setPinnedKeys,
    loadData,
  };
}
