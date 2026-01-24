"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  bootstrapConversation,
  fetchAgentTimeline,
  fetchGroupTimeline,
  type TimelineItem as AgentTimelineItem,
} from "@/lib/api/timeline";
import type { QueuedMessage } from "@/lib/types";

type CueRequest = {
  request_id: string;
  agent_id: string;
  prompt: string;
  payload?: any;
  status: string;
  created_at: string;
};

export function useConversationTimeline({
  type,
  id,
  pageSize,
  soundEnabled,
  setSoundEnabled,
  onBootstrap,
  isPauseRequest,
  playDing,
  perfEnabled,
  setError,
}: {
  type: "agent" | "group";
  id: string;
  pageSize: number;
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
  onBootstrap: (res: {
    members: string[];
    agentNameMap: Record<string, string>;
    queue: QueuedMessage[];
    timeline: { items: AgentTimelineItem[]; nextCursor: string | null };
  }) => void;
  isPauseRequest: (req: CueRequest) => boolean;
  playDing: () => void | Promise<void>;
  perfEnabled: () => boolean;
  setError: (v: string | null) => void;
}) {
  const [timeline, setTimeline] = useState<AgentTimelineItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);

  const loadSeqRef = useRef(0);
  const pendingNonPauseSeenRef = useRef<Set<string>>(new Set());
  const soundEnabledRef = useRef(soundEnabled);
  const playDingRef = useRef(playDing);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    playDingRef.current = playDing;
  }, [playDing]);

  const keyForItem = useCallback((item: AgentTimelineItem) => {
    return item.item_type === "request"
      ? `req:${item.request.request_id}`
      : `resp:${item.response.id}`;
  }, []);

  const fetchPage = useCallback(
    async (before: string | null, limit: number) => {
      if (type === "agent") return fetchAgentTimeline(id, before, limit);
      return fetchGroupTimeline(id, before, limit);
    },
    [type, id]
  );

  const loadInitial = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    const t0 = perfEnabled() ? performance.now() : 0;
    setBootstrapping(true);
    try {
      const res = await bootstrapConversation({ type, id, limit: pageSize });
      if (seq !== loadSeqRef.current) return;

      setSoundEnabled(Boolean(res.config.sound_enabled));
      onBootstrap({
        members: res.members,
        agentNameMap: res.agentNameMap,
        queue: res.queue,
        timeline: res.timeline,
      });

      const { items, nextCursor: cursor } = res.timeline;
      const asc = [...items].reverse();

      const map = new Map<string, AgentTimelineItem>();
      for (const it of asc) map.set(keyForItem(it), it);
      const uniqueAsc = Array.from(map.values());

      const seed = new Set<string>();
      for (const it of uniqueAsc) {
        if (it.item_type !== "request") continue;
        if (it.request.status !== "PENDING") continue;
        if (isPauseRequest(it.request)) continue;
        seed.add(it.request.request_id);
      }
      pendingNonPauseSeenRef.current = seed;

      setTimeline(uniqueAsc);
      setNextCursor(cursor);

      if (t0) {
        const t1 = performance.now();
        console.log(
          `[perf] bootstrapConversation type=${type} id=${id} items=${asc.length} queue=${res.queue.length} ${(t1 - t0).toFixed(1)}ms`
        );
      }
    } catch (e) {
      if (seq !== loadSeqRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (seq !== loadSeqRef.current) return;
      setBootstrapping(false);
    }
  }, [id, isPauseRequest, keyForItem, onBootstrap, pageSize, perfEnabled, setError, setSoundEnabled, type]);

  const refreshLatest = useCallback(async () => {
    try {
      const { items } = await fetchPage(null, pageSize);
      const asc = [...items].reverse();

      if (document.visibilityState === "visible" && soundEnabledRef.current) {
        const seen = pendingNonPauseSeenRef.current;
        let shouldDing = false;
        for (const it of asc) {
          if (it.item_type !== "request") continue;
          if (it.request.status !== "PENDING") continue;
          if (isPauseRequest(it.request)) continue;
          const rid = it.request.request_id;
          if (!seen.has(rid)) {
            seen.add(rid);
            shouldDing = true;
          }
        }
        if (shouldDing) {
          void playDingRef.current();
        }
      }

      setTimeline((prev) => {
        const map = new Map<string, AgentTimelineItem>();
        for (const it of prev) map.set(keyForItem(it), it);
        for (const it of asc) map.set(keyForItem(it), it);
        const toTs = (t: string) => {
          const d = new Date((t || "").replace(" ", "T"));
          const n = d.getTime();
          return Number.isFinite(n) ? n : 0;
        };
        return Array.from(map.values()).sort((a, b) => toTs(a.time) - toTs(b.time));
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [fetchPage, isPauseRequest, keyForItem, pageSize, setError]);

  const loadMore = useCallback(
    async (before: string) => {
      if (loadingMore) return { cursor: nextCursor };
      setLoadingMore(true);
      try {
        const { items, nextCursor: cursor } = await fetchPage(before, pageSize);
        const asc = [...items].reverse();
        setTimeline((prev) => {
          const merged = [...asc, ...prev];
          const map = new Map<string, AgentTimelineItem>();
          for (const it of merged) map.set(keyForItem(it), it);
          const toTs = (t: string) => {
            const d = new Date((t || "").replace(" ", "T"));
            const n = d.getTime();
            return Number.isFinite(n) ? n : 0;
          };
          return Array.from(map.values()).sort((a, b) => toTs(a.time) - toTs(b.time));
        });
        setNextCursor(cursor);
        return { cursor };
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return { cursor: nextCursor };
      } finally {
        setLoadingMore(false);
      }
    },
    [fetchPage, keyForItem, loadingMore, nextCursor, pageSize, setError]
  );

  const loadInitialRef = useRef(loadInitial);
  const refreshLatestRef = useRef(refreshLatest);

  useEffect(() => {
    loadInitialRef.current = loadInitial;
  }, [loadInitial]);

  useEffect(() => {
    refreshLatestRef.current = refreshLatest;
  }, [refreshLatest]);

  useEffect(() => {
    setTimeline([]);
    setNextCursor(null);
    loadSeqRef.current++;
    void loadInitialRef.current();

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void refreshLatestRef.current();
    };

    const interval = setInterval(tick, 5000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") tick();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearInterval(interval);
    };
  }, [type, id, pageSize]);

  return {
    timeline,
    nextCursor,
    loadingMore,
    bootstrapping,
    loadMore,
    refreshLatest,
  };
}
