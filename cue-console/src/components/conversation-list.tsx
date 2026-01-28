"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_USER_CONFIG } from "@/lib/user-config";
import { UserMenu } from "@/components/user-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn, getAgentEmoji, formatTime, truncateText } from "@/lib/utils";
import {
  getOrInitAvatarSeed,
  getOrInitGroupAvatarSeed,
  thumbsAvatarDataUrl,
} from "@/lib/avatar";
import {
  archiveConversations,
  deleteConversations,
  fetchArchivedConversationCount,
  fetchConversationList,
  fetchPinnedConversationKeys,
  getUserConfig,
  pinConversationByKey,
  setUserConfig,
  unpinConversationByKey,
  unarchiveConversations,
  type ConversationItem,
} from "@/lib/actions";
import {
  Archive,
  Bot,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Pin,
  Plus,
  Search,
  Settings,
  Users,
  X,
} from "lucide-react";
import Image from "next/image";
import { ConfirmDialog } from "@/components/confirm-dialog";

function perfEnabled(): boolean {
  try {
    return window.localStorage.getItem("cue-console:perf") === "1";
  } catch {
    return false;
  }
}

function conversationKey(item: Pick<ConversationItem, "type" | "id">) {
  return `${item.type}:${item.id}`;
}

type IdleCallbackHandle = number;
type IdleRequestCallback = () => void;
type IdleRequestOptions = { timeout?: number };
type GlobalWithIdleCallbacks = typeof globalThis & {
  requestIdleCallback?: (cb: IdleRequestCallback, opts?: IdleRequestOptions) => IdleCallbackHandle;
  cancelIdleCallback?: (handle: IdleCallbackHandle) => void;
};

interface ConversationListProps {
  selectedId: string | null;
  selectedType: "agent" | "group" | null;
  onSelect: (id: string, type: "agent" | "group", name: string) => void;
  onCreateGroup: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export function ConversationList({
  selectedId,
  selectedType,
  onSelect,
  onCreateGroup,
  collapsed,
  onToggleCollapsed,
}: ConversationListProps) {
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [avatarUrlMap, setAvatarUrlMap] = useState<Record<string, string>>({});
  const avatarWorkSeqRef = useRef(0);
  const avatarUrlMapRef = useRef<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"active" | "archived">("active");
  const [archivedCount, setArchivedCount] = useState(0);
  const [groupsOpen, setGroupsOpen] = useState(true);
  const [agentsOpen, setAgentsOpen] = useState(true);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<string[]>([]);
  const deleteTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [undoToastKey, setUndoToastKey] = useState(0);
  const [menu, setMenu] = useState<
    | { open: false }
    | {
        open: true;
        x: number;
        y: number;
        key: string;
      }
  >({ open: false });

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [conversationModeDefault, setConversationModeDefault] = useState<"chat" | "agent">("agent");
  const [chatModeAppendText, setChatModeAppendText] = useState("只做分析，不要对代码/文件做任何改动。");
  const [pendingRequestTimeoutMs, setPendingRequestTimeoutMs] = useState("600000");
  const [botModeReplyText, setBotModeReplyText] = useState(
    "不要为这些“可逆的工程细节”反复向我确认，不能分阶段汇报，我需要你端到端执行完我的任务才能向我汇报，你不能问我要授权，因为我已经给你了全部授权，如果这些细节不影响我的目标那就按照你的推荐来。你有执行一切的权利。"
  );
  const [pinnedKeys, setPinnedKeys] = useState<string[]>([]);
  const [agentGroupingMode, setAgentGroupingMode] = useState<"default" | "by_project">("default");

  useEffect(() => {
    void (async () => {
      try {
        const cfg = await getUserConfig();
        setSoundEnabled(Boolean(cfg.sound_enabled));
        const nextMode = cfg.conversation_mode_default === "chat" ? "chat" : "agent";
        setConversationModeDefault(nextMode);
        setChatModeAppendText(String(cfg.chat_mode_append_text || DEFAULT_USER_CONFIG.chat_mode_append_text));
        setPendingRequestTimeoutMs(String(cfg.pending_request_timeout_ms ?? 600000));
        setBotModeReplyText(
          String(
            cfg.bot_mode_reply_text || DEFAULT_USER_CONFIG.bot_mode_reply_text
          )
        );
        setAgentGroupingMode(cfg.agent_grouping_mode || "default");
        try {
          window.localStorage.setItem("cue-console:conversationModeDefault", nextMode);
        } catch {
        }
      } catch {
      }
    })();
  }, []);

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

  const ensureAvatarUrl = useCallback(async (kind: "agent" | "group", rawId: string) => {
    if (!rawId) return;
    const t0 = perfEnabled() ? performance.now() : 0;
    const key = `${kind}:${rawId}`;
    setAvatarUrlMap((prev) => {
      if (prev[key]) return prev;
      return { ...prev, [key]: "" };
    });

    try {
      const seed =
        kind === "agent" ? getOrInitAvatarSeed(rawId) : getOrInitGroupAvatarSeed(rawId);
      const url = await thumbsAvatarDataUrl(seed);
      setAvatarUrlMap((prev) => ({ ...prev, [key]: url }));
      if (t0) {
        const t1 = performance.now();
        console.log(`[perf] ensureAvatarUrl kind=${kind} id=${rawId} ${(t1 - t0).toFixed(1)}ms`);
      }
    } catch {
      // ignore
    }
  }, []);

  const [moreMenu, setMoreMenu] = useState<
    | { open: false }
    | {
        open: true;
        x: number;
        y: number;
      }
  >({ open: false });

  const [confirm, setConfirm] = useState<
    | { open: false }
    | (
        {
          open: true;
          title: string;
          description?: string;
          confirmLabel?: string;
          destructive?: boolean;
        } & (
          | { kind: "archive_all"; keys: string[] }
          | { kind: "delete_selected"; keys: string[] }
          | { kind: "delete_one"; key: string }
        )
      )
  >({ open: false });

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

    const onAvatarSeedUpdated = (evt: Event) => {
      const e = evt as CustomEvent<{ kind: "agent" | "group"; id: string; seed: string }>;
      const kind = e.detail?.kind;
      const rawId = e.detail?.id;
      const seed = e.detail?.seed;
      if (!kind || !rawId || !seed) return;
      void (async () => {
        try {
          const url = await thumbsAvatarDataUrl(seed);
          setAvatarUrlMap((prev) => ({ ...prev, [`${kind}:${rawId}`]: url }));
        } catch {
          // ignore
        }
      })();
    };

    window.addEventListener("cuehub:agentDisplayNameUpdated", onAgentNameUpdated);
    window.addEventListener("cue-console:avatarSeedUpdated", onAvatarSeedUpdated);
    return () => {
      window.removeEventListener("cuehub:agentDisplayNameUpdated", onAgentNameUpdated);
      window.removeEventListener("cue-console:avatarSeedUpdated", onAvatarSeedUpdated);
    };
  }, []);

  const loadData = useCallback(async () => {
    console.log('[ConversationList] loadData called, view:', view);
    const t0 = perfEnabled() ? performance.now() : 0;
    const data = await fetchConversationList({ view });
    console.log('[ConversationList] fetchConversationList returned:', data.length, 'items', data);
    setItems(data);
    const count = await fetchArchivedConversationCount();
    setArchivedCount(count);
    if (t0) {
      const t1 = performance.now();
      console.log(`[perf] conversationList loadData view=${view} items=${data.length} ${(t1 - t0).toFixed(1)}ms`);
    }
  }, [view]);

  useEffect(() => {
    avatarUrlMapRef.current = avatarUrlMap;
  }, [avatarUrlMap]);

  useEffect(() => {
    const seq = ++avatarWorkSeqRef.current;

    const keyOf = (it: ConversationItem) => `${it.type}:${it.id}`;
    const needs = (it: ConversationItem) => {
      const k = keyOf(it);
      const existing = avatarUrlMapRef.current[k];
      return typeof existing !== "string" || existing.length === 0;
    };

    const pending = items.filter((it) => it.id && needs(it));
    if (pending.length === 0) return;

    const FIRST_BATCH = 12;
    const IDLE_BATCH = 4;

    let cancelled = false;
    const run = async (batch: ConversationItem[]) => {
      for (const it of batch) {
        if (cancelled) return;
        if (avatarWorkSeqRef.current !== seq) return;
        await ensureAvatarUrl(it.type, it.id);
      }
    };

    void run(pending.slice(0, FIRST_BATCH));

    const rest = pending.slice(FIRST_BATCH);
    if (rest.length === 0) {
      return () => {
        cancelled = true;
      };
    }

    const scheduleIdle = (fn: () => void) => {
      const g = globalThis as GlobalWithIdleCallbacks;
      if (typeof g.requestIdleCallback === "function") {
        return g.requestIdleCallback(fn, { timeout: 1000 });
      }
      return window.setTimeout(fn, 60);
    };
    const cancelIdle = (handle: number) => {
      const g = globalThis as GlobalWithIdleCallbacks;
      if (typeof g.cancelIdleCallback === "function") {
        g.cancelIdleCallback(handle);
        return;
      }
      window.clearTimeout(handle);
    };

    let idx = 0;
    let handle: number | null = null;

    const pump = () => {
      if (cancelled) return;
      if (avatarWorkSeqRef.current !== seq) return;
      const batch = rest.slice(idx, idx + IDLE_BATCH);
      idx += IDLE_BATCH;
      void run(batch);
      if (idx >= rest.length) return;
      handle = scheduleIdle(pump);
    };

    handle = scheduleIdle(pump);

    return () => {
      cancelled = true;
      if (handle != null) cancelIdle(handle);
    };
  }, [ensureAvatarUrl, items]);

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
    if (!menu.open) return;
    const onPointerDown = () => setMenu({ open: false });
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu({ open: false });
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menu.open]);

  useEffect(() => {
    if (!moreMenu.open) return;
    const onPointerDown = () => setMoreMenu({ open: false });
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreMenu({ open: false });
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [moreMenu.open]);

  const onItemContextMenu = useCallback((e: React.MouseEvent, item: ConversationItem) => {
    e.preventDefault();
    setMenu({ open: true, x: e.clientX, y: e.clientY, key: conversationKey(item) });
  }, []);

  const displayNameByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const it of items) map.set(conversationKey(it), it.displayName);
    return map;
  }, [items]);

  const filtered = items.filter((item) =>
    item.displayName.toLowerCase().includes(search.toLowerCase())
  );

  const pinnedSet = useMemo(() => new Set(pinnedKeys), [pinnedKeys]);

  const groupsAll = filtered.filter((i) => i.type === "group");
  const agentsAll = filtered.filter((i) => i.type === "agent");

  const groups = useMemo(() => {
    const byKey = new Map(groupsAll.map((g) => [conversationKey(g), g] as const));
    const pinned = pinnedKeys
      .filter((k) => k.startsWith("group:"))
      .map((k) => byKey.get(k))
      .filter(Boolean) as ConversationItem[];
    const rest = groupsAll.filter((g) => !pinnedSet.has(conversationKey(g)));
    return [...pinned, ...rest];
  }, [groupsAll, pinnedKeys, pinnedSet]);

  const agents = useMemo(() => {
    const byKey = new Map(agentsAll.map((a) => [conversationKey(a), a] as const));
    const pinned = pinnedKeys
      .filter((k) => k.startsWith("agent:"))
      .map((k) => byKey.get(k))
      .filter(Boolean) as ConversationItem[];
    const rest = agentsAll.filter((a) => !pinnedSet.has(conversationKey(a)));
    return [...pinned, ...rest];
  }, [agentsAll, pinnedKeys, pinnedSet]);

  const groupsPendingTotal = groups.reduce((sum, g) => sum + g.pendingCount, 0);

  // Group agents by project
  const agentsByProject = useMemo(() => {
    if (agentGroupingMode !== "by_project") return null;

    const projectMap = new Map<string, ConversationItem[]>();
    
    for (const agent of agents) {
      const projectName = agent.projectName || "(No Project)";
      if (!projectMap.has(projectName)) {
        projectMap.set(projectName, []);
      }
      projectMap.get(projectName)!.push(agent);
    }

    // Sort projects alphabetically (stable order)
    const projects = Array.from(projectMap.entries()).map(([name, agents]) => {
      const pendingCount = agents.reduce((sum, a) => sum + a.pendingCount, 0);
      return { name, agents, pendingCount };
    });

    projects.sort((a, b) => {
      // Sort alphabetically, with "(No Project)" at the end
      if (a.name === "(No Project)") return 1;
      if (b.name === "(No Project)") return -1;
      return a.name.localeCompare(b.name);
    });

    return projects;
  }, [agents, agentGroupingMode]);

  const isCollapsed = !!collapsed;

  const collapsedGroups = useMemo(
    () => items.filter((i) => i.type === "group"),
    [items]
  );
  const collapsedAgents = useMemo(
    () => items.filter((i) => i.type === "agent"),
    [items]
  );

  const selectedKeyList = useMemo(() => Array.from(selectedKeys), [selectedKeys]);

  const toggleSelected = useCallback(
    (key: string) => {
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    []
  );

  const clearBulk = useCallback(() => {
    setBulkMode(false);
    setSelectedKeys(new Set());
  }, []);

  const scheduleDelete = useCallback(
    (keys: string[]) => {
      const unique = Array.from(new Set(keys));
      if (unique.length === 0) return;

      // Optimistically remove from current list
      setItems((prev) => prev.filter((it) => !unique.includes(conversationKey(it))));

      setPendingDelete((prev) => Array.from(new Set([...prev, ...unique])));

      for (const k of unique) {
        if (deleteTimersRef.current.has(k)) continue;
        const t = setTimeout(async () => {
          deleteTimersRef.current.delete(k);
          setPendingDelete((prev) => prev.filter((x) => x !== k));
          await deleteConversations([k]);
          await loadData();
        }, 5000);
        deleteTimersRef.current.set(k, t);
      }
    },
    [loadData]
  );

  const undoDelete = useCallback(
    async (keys?: string[]) => {
      const toUndo = keys && keys.length > 0 ? keys : pendingDelete;
      if (toUndo.length === 0) return;
      for (const k of toUndo) {
        const t = deleteTimersRef.current.get(k);
        if (t) clearTimeout(t);
        deleteTimersRef.current.delete(k);
      }
      setPendingDelete((prev) => prev.filter((k) => !toUndo.includes(k)));
      await loadData();
    },
    [loadData, pendingDelete]
  );

  const dismissUndoToast = useCallback(() => {
    setPendingDelete([]);
  }, []);

  useEffect(() => {
    return () => {
      // Clean up all pending delete timers on unmount
      for (const timer of deleteTimersRef.current.values()) {
        clearTimeout(timer);
      }
      deleteTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (pendingDelete.length > 0) {
      queueMicrotask(() => setUndoToastKey((v) => v + 1));
    }
  }, [pendingDelete.length]);

  const handleArchiveSelected = useCallback(async () => {
    if (selectedKeyList.length === 0) return;
    await archiveConversations(selectedKeyList);
    clearBulk();
    await loadData();
  }, [selectedKeyList, clearBulk, loadData]);

  const handleUnarchiveSelected = useCallback(async () => {
    if (selectedKeyList.length === 0) return;
    await unarchiveConversations(selectedKeyList);
    clearBulk();
    await loadData();
  }, [selectedKeyList, clearBulk, loadData]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedKeyList.length === 0) return;
    setConfirm({
      open: true,
      kind: "delete_selected",
      keys: selectedKeyList,
      title: "Delete conversations?",
      description: `This will remove ${selectedKeyList.length} conversation(s) from the sidebar. You can undo within 5 seconds.`,
      confirmLabel: "Delete",
      destructive: true,
    });
  }, [selectedKeyList]);

  const handleArchiveAll = useCallback(async () => {
    if (view !== "active") return;
    const keys = filtered
      .filter((i) => i.pendingCount === 0)
      .map((i) => conversationKey(i));
    if (keys.length === 0) return;
    setConfirm({
      open: true,
      kind: "archive_all",
      keys,
      title: "Archive conversations?",
      description: `Archive ${keys.length} conversation(s) (current filter, only pending == 0). You can unarchive later.`,
      confirmLabel: "Archive",
    });
  }, [view, filtered]);

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 flex-col shrink-0",
        "border-r border-border/60",
        "glass-surface-opaque glass-noise",
        "transition-[width] duration-200 ease-out",
        // Mobile: full width, Desktop: fixed width
        "w-full md:w-auto",
        isCollapsed ? "md:w-16" : "md:w-72"
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-center border-b border-border/60",
          isCollapsed ? "px-2 py-3" : "px-4 py-3"
        )}
      >
        {isCollapsed ? (
          <div className="flex w-full flex-col items-center justify-center gap-2">
            {/* Cue Icon in collapsed state */}
            <div className="flex items-center justify-center mb-1">
              <svg
                width="24"
                height="24"
                viewBox="0 0 32 32"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="text-foreground"
                aria-label="Cue"
              >
                <path
                  d="M16 4C9.37258 4 4 9.37258 4 16C4 22.6274 9.37258 28 16 28C19.3137 28 22.3137 26.6274 24.4183 24.4183"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <circle cx="24" cy="8" r="2.5" fill="currentColor" />
              </svg>
            </div>
            
            <UserMenu />
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 transition-colors duration-200 hover:bg-accent"
              onClick={onToggleCollapsed}
              disabled={!onToggleCollapsed}
              aria-label="Expand sidebar"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 transition-colors duration-200 hover:bg-accent"
              onClick={onCreateGroup}
              aria-label="Create group"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex w-full items-center justify-between gap-2">
            <a
              href="https://github.com/nmhjklnm/CueStack"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 min-w-0 flex-1 transition-opacity duration-200 hover:opacity-70 cursor-pointer"
              title="Visit CueStack on GitHub"
            >
              {/* Cue Icon */}
              <svg
                width="20"
                height="20"
                viewBox="0 0 32 32"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="shrink-0 text-foreground"
                aria-hidden="true"
              >
                <path
                  d="M16 4C9.37258 4 4 9.37258 4 16C4 22.6274 9.37258 28 16 28C19.3137 28 22.3137 26.6274 24.4183 24.4183"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <circle cx="24" cy="8" r="2.5" fill="currentColor" />
              </svg>
              
              {/* Brand Name */}
              <span className="text-lg font-semibold text-foreground truncate">
                Cue
              </span>
            </a>
            
            <div className="flex items-center gap-0.5 shrink-0">
              <UserMenu />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 transition-colors duration-200 hover:bg-accent"
                onClick={(e) => {
                  setMoreMenu({ open: true, x: e.clientX, y: e.clientY });
                }}
                aria-label="Actions menu"
              >
                <Menu className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 transition-colors duration-200 hover:bg-accent"
                onClick={onToggleCollapsed}
                disabled={!onToggleCollapsed}
                aria-label="Collapse sidebar"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {bulkMode && !isCollapsed && (
        <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2 text-xs">
          <div className="text-muted-foreground">
            {selectedKeys.size} selected
          </div>
          <div className="flex items-center gap-2">
            {view === "archived" ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 rounded-md px-2 text-xs"
                disabled={selectedKeys.size === 0}
                onClick={() => void handleUnarchiveSelected()}
              >
                Unarchive
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 rounded-md px-2 text-xs"
                disabled={selectedKeys.size === 0}
                onClick={() => void handleArchiveSelected()}
              >
                Archive
              </Button>
            )}
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="h-8 rounded-md px-2 text-xs"
              disabled={selectedKeys.size === 0}
              onClick={handleDeleteSelected}
            >
              Delete
            </Button>
          </div>
        </div>
      )}

      {/* Search */}
      {!isCollapsed && (
        <div className="px-3 py-2">
          {view === "archived" && (
            <div className="mb-2 flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 rounded-md px-2 text-xs"
                onClick={() => {
                  setView("active");
                  clearBulk();
                }}
                title="Back"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>
              <span className="text-xs text-muted-foreground">Archived chats</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search"
                className="pl-8 h-9 bg-white/45 border-white/40 focus-visible:border-ring"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {view === "active" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={onCreateGroup}
                title="Create group"
              >
                <Plus className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* List */}
      {isCollapsed ? (
        <ScrollArea className="flex-1 min-h-0 px-2">
          <div className="py-2 space-y-2">
            {collapsedGroups.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-center">
                  <Users className="h-4 w-4 text-muted-foreground" />
                </div>
                {collapsedGroups.map((item) => (
                  <div key={item.id} data-conversation-item="true">
                    <ConversationIconButton
                      item={item}
                      avatarUrl={avatarUrlMap[`group:${item.id}`]}
                      isSelected={selectedId === item.id && selectedType === "group"}
                      onClick={() => onSelect(item.id, "group", item.name)}
                    />
                  </div>
                ))}
              </div>
            )}

            {collapsedAgents.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-center">
                  <Bot className="h-4 w-4 text-muted-foreground" />
                </div>
                {collapsedAgents.map((item) => (
                  <div key={item.id} data-conversation-item="true">
                    <ConversationIconButton
                      item={item}
                      avatarUrl={avatarUrlMap[`agent:${item.id}`]}
                      isSelected={selectedId === item.id && selectedType === "agent"}
                      onClick={() => onSelect(item.id, "agent", item.name)}
                    />
                  </div>
                ))}
              </div>
            )}

            {items.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <MessageCircle className="mb-2 h-7 w-7" />
              </div>
            )}
          </div>
        </ScrollArea>
      ) : (
        <ScrollArea className="flex-1 min-h-0 px-2">
          <div>
          {view === "active" && archivedCount > 0 && (
            <div className="mb-2">
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-2xl px-2.5 py-2 text-left transition overflow-hidden",
                  "backdrop-blur-sm hover:bg-white/40"
                )}
                onClick={() => {
                  setView("archived");
                  clearBulk();
                }}
                title="Archived chats"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/55 ring-1 ring-white/40">
                  <Archive className="h-4 w-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium leading-5">Archived chats</span>
                    <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-xs">
                      {archivedCount}
                    </Badge>
                  </div>
                </div>
              </button>
            </div>
          )}
          {/* Groups Section */}
          {groups.length > 0 && (
            <Collapsible open={groupsOpen} onOpenChange={setGroupsOpen} className="mb-1">
              <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent/50 transition-colors">
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 transition-transform duration-200",
                    groupsOpen ? "" : "-rotate-90"
                  )}
                />
                <Users className="h-4 w-4 shrink-0" />
                <span>Groups</span>
                {groupsPendingTotal > 0 && (
                  <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-xs">
                    {groupsPendingTotal}
                  </Badge>
                )}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1 space-y-0.5">
                {groups.map((item) => (
                  <div
                    key={item.id}
                    data-conversation-item="true"
                    onContextMenu={(e) => onItemContextMenu(e, item)}
                  >
                    <ConversationItemCard
                      item={item}
                      avatarUrl={avatarUrlMap[`group:${item.id}`]}
                      isSelected={selectedId === item.id && selectedType === "group"}
                      isPinned={pinnedSet.has(conversationKey(item))}
                      bulkMode={bulkMode}
                      checked={selectedKeys.has(conversationKey(item))}
                      onToggleChecked={() => toggleSelected(conversationKey(item))}
                      onClick={() => {
                        if (bulkMode) {
                          toggleSelected(conversationKey(item));
                          return;
                        }
                        onSelect(item.id, "group", item.name);
                      }}
                    />
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Agents Section */}
          {agents.length > 0 && (
            <Collapsible open={agentsOpen} onOpenChange={setAgentsOpen} className="mb-1">
              <div className="flex w-full items-center gap-2 rounded-md px-2 py-1.5">
                <CollapsibleTrigger className="flex flex-1 items-center gap-2 text-sm font-medium text-muted-foreground hover:bg-accent/50 transition-colors rounded-md -mx-2 px-2 py-0">
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 transition-transform duration-200",
                      agentsOpen ? "" : "-rotate-90"
                    )}
                  />
                  <Bot className="h-4 w-4 shrink-0" />
                  <span>Agents</span>
                </CollapsibleTrigger>
                <div
                  className="ml-auto flex h-6 w-6 items-center justify-center rounded hover:bg-accent transition-colors cursor-pointer"
                  onClick={async () => {
                    const nextMode = agentGroupingMode === "default" ? "by_project" : "default";
                    setAgentGroupingMode(nextMode);
                    await setUserConfig({ agent_grouping_mode: nextMode });
                  }}
                  title={agentGroupingMode === "default" ? "Group by project" : "Show as list"}
                >
                  {agentGroupingMode === "default" ? (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                  )}
                </div>
              </div>
              <CollapsibleContent className="mt-1 space-y-0.5">
                {agentGroupingMode === "by_project" && agentsByProject ? (
                  agentsByProject.map((project) => (
                    <Collapsible key={project.name} defaultOpen={true} className="mb-1">
                      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground/80 hover:bg-accent/30 transition-colors">
                        <ChevronDown className="h-3 w-3 shrink-0 transition-transform duration-200 data-[state=closed]:-rotate-90" />
                        <span className="text-[11px]">📁 {project.name}</span>
                        {project.pendingCount > 0 && (
                          <Badge variant="destructive" className="ml-auto h-4 min-w-4 px-1 text-[10px]">
                            {project.pendingCount}
                          </Badge>
                        )}
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-0.5 space-y-0.5 pl-4">
                        {project.agents.map((item) => (
                          <div
                            key={item.id}
                            data-conversation-item="true"
                            onContextMenu={(e) => onItemContextMenu(e, item)}
                          >
                            <ConversationItemCard
                              item={item}
                              avatarUrl={avatarUrlMap[`agent:${item.id}`]}
                              isSelected={selectedId === item.id && selectedType === "agent"}
                              isPinned={pinnedSet.has(conversationKey(item))}
                              bulkMode={bulkMode}
                              checked={selectedKeys.has(conversationKey(item))}
                              onToggleChecked={() => toggleSelected(conversationKey(item))}
                              onClick={() => {
                                if (bulkMode) {
                                  toggleSelected(conversationKey(item));
                                  return;
                                }
                                onSelect(item.id, "agent", item.name);
                              }}
                            />
                          </div>
                        ))}
                      </CollapsibleContent>
                    </Collapsible>
                  ))
                ) : (
                  agents.map((item) => (
                    <div
                      key={item.id}
                      data-conversation-item="true"
                      onContextMenu={(e) => onItemContextMenu(e, item)}
                    >
                      <ConversationItemCard
                        item={item}
                        avatarUrl={avatarUrlMap[`agent:${item.id}`]}
                        isSelected={selectedId === item.id && selectedType === "agent"}
                        isPinned={pinnedSet.has(conversationKey(item))}
                        bulkMode={bulkMode}
                        checked={selectedKeys.has(conversationKey(item))}
                        onToggleChecked={() => toggleSelected(conversationKey(item))}
                        onClick={() => {
                          if (bulkMode) {
                            toggleSelected(conversationKey(item));
                            return;
                          }
                          onSelect(item.id, "agent", item.name);
                        }}
                      />
                    </div>
                  ))
                )}
              </CollapsibleContent>
            </Collapsible>
          )}

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <MessageCircle className="mb-2 h-8 w-8" />
              <p className="text-sm">No conversations</p>
            </div>
          )}
          </div>
        </ScrollArea>
      )}

      <div className={cn("px-2 pb-3", isCollapsed ? "" : "")}>
        {isCollapsed ? (
          <div className="flex justify-center">
            <button
              type="button"
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-2xl transition",
                "backdrop-blur-sm hover:bg-white/40"
              )}
              onClick={() => setSettingsOpen(true)}
              title="Settings"
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-2.5 rounded-2xl px-2.5 py-2 text-left transition overflow-hidden",
              "backdrop-blur-sm hover:bg-white/40"
            )}
            onClick={() => setSettingsOpen(true)}
            title="Settings"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/55 ring-1 ring-white/40">
              <Settings className="h-4 w-4" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium leading-5">Settings</span>
                <span className="text-[11px] text-muted-foreground shrink-0">Global</span>
              </div>
              <p className="text-[11px] text-muted-foreground whitespace-nowrap leading-4">
                Sound notification
              </p>
            </div>
          </button>
        )}
      </div>

      {pendingDelete.length > 0 && (
        <div className="fixed top-4 right-4 z-50 w-65 overflow-hidden rounded-xl border bg-white/85 p-3 text-xs shadow-xl backdrop-blur">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium">Deleted</div>
              <div className="text-muted-foreground">
                {pendingDelete.length} conversation(s) will be removed in 5s
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={dismissUndoToast}
              title="Dismiss"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 rounded-md px-2 text-xs"
              onClick={() => void undoDelete()}
            >
              Undo
            </Button>
          </div>

          <div
            key={undoToastKey}
            className="absolute bottom-0 left-0 right-0 h-1 bg-black/10"
          >
            <div
              className="h-full bg-primary origin-left"
              style={{
                transform: "scaleX(1)",
                animation: "cuehub-toast-progress 5s linear forwards",
              }}
            />
          </div>

          <style>{`@keyframes cuehub-toast-progress { from { transform: scaleX(1); } to { transform: scaleX(0); } }`}</style>
        </div>
      )}

      {menu.open && (
        <div
          className="fixed z-50 min-w-40 rounded-lg border bg-white/90 p-1 shadow-lg backdrop-blur"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {(() => {
            const isPinned = pinnedSet.has(menu.key);
            return (
              <button
                className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={async () => {
                  const key = menu.key;
                  setMenu({ open: false });
                  if (!key) return;
                  if (isPinned) {
                    await unpinConversationByKey(key, view);
                    setPinnedKeys((prev) => prev.filter((k) => k !== key));
                    return;
                  }
                  await pinConversationByKey(key, view);
                  setPinnedKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
                }}
              >
                <span className="inline-flex items-center gap-2">
                  <Pin className="h-4 w-4" />
                  {isPinned ? "Unpin" : "Pin"}
                </span>
              </button>
            );
          })()}

          {view === "archived" ? (
            <button
              className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
              onClick={async () => {
                await unarchiveConversations([menu.key]);
                setMenu({ open: false });
                await loadData();
              }}
            >
              Unarchive
            </button>
          ) : (
            <button
              className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
              onClick={async () => {
                await archiveConversations([menu.key]);
                setMenu({ open: false });
                await loadData();
              }}
            >
              Archive
            </button>
          )}
          <button
            className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
            onClick={() => {
              const name = displayNameByKey.get(menu.key) || menu.key;
              setConfirm({
                open: true,
                kind: "delete_one",
                key: menu.key,
                title: "Delete conversation?",
                description: `Delete “${name}”? This will remove it from the sidebar. You can undo within 5 seconds.`,
                confirmLabel: "Delete",
                destructive: true,
              });
              setMenu({ open: false });
            }}
          >
            Delete
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirm.open}
        title={confirm.open ? confirm.title : ""}
        description={confirm.open ? confirm.description : undefined}
        confirmLabel={confirm.open ? (confirm.confirmLabel ?? "Confirm") : "Confirm"}
        cancelLabel="Cancel"
        destructive={confirm.open ? confirm.destructive : undefined}
        onOpenChange={(open) => {
          if (!open) setConfirm({ open: false });
        }}
        onConfirm={async () => {
          if (!confirm.open) return;
          if (confirm.kind === "archive_all") {
            await archiveConversations(confirm.keys);
            await loadData();
            setConfirm({ open: false });
            return;
          }
          if (confirm.kind === "delete_selected") {
            scheduleDelete(confirm.keys);
            clearBulk();
            setConfirm({ open: false });
            return;
          }
          if (confirm.kind === "delete_one") {
            scheduleDelete([confirm.key]);
            setConfirm({ open: false });
            return;
          }
        }}
      />

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">Sound notification</div>
              <div className="text-xs text-muted-foreground truncate">
                Ding on new non-pause messages
              </div>
            </div>
            <Button
              type="button"
              variant={soundEnabled ? "default" : "outline"}
              onClick={async () => {
                const next = !soundEnabled;
                setSoundEnabled(next);
                try {
                  await setUserConfig({ sound_enabled: next });
                } catch {
                }
                window.dispatchEvent(
                  new CustomEvent("cue-console:configUpdated", {
                    detail: { sound_enabled: next },
                  })
                );
              }}
            >
              {soundEnabled ? "On" : "Off"}
            </Button>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">Default conversation mode</div>
              <div className="text-xs text-muted-foreground truncate">
                Used when opening cue-console (unless a last-used mode exists)
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={conversationModeDefault === "chat" ? "default" : "outline"}
                onClick={async () => {
                  const next = "chat" as const;
                  setConversationModeDefault(next);
                  try {
                    await setUserConfig({ conversation_mode_default: next });
                  } catch {
                  }
                  try {
                    window.localStorage.setItem("cue-console:conversationModeDefault", next);
                  } catch {
                  }
                  window.dispatchEvent(
                    new CustomEvent("cue-console:configUpdated", {
                      detail: { conversation_mode_default: next },
                    })
                  );
                }}
              >
                Chat
              </Button>
              <Button
                type="button"
                variant={conversationModeDefault === "agent" ? "default" : "outline"}
                onClick={async () => {
                  const next = "agent" as const;
                  setConversationModeDefault(next);
                  try {
                    await setUserConfig({ conversation_mode_default: next });
                  } catch {
                  }
                  try {
                    window.localStorage.setItem("cue-console:conversationModeDefault", next);
                  } catch {
                  }
                  window.dispatchEvent(
                    new CustomEvent("cue-console:configUpdated", {
                      detail: { conversation_mode_default: next },
                    })
                  );
                }}
              >
                Agent
              </Button>
            </div>
          </div>

          <div className="mt-6">
            <div className="text-sm font-medium">Chat mode append text</div>
            <div className="text-xs text-muted-foreground">
              Appended to every message in Chat mode (single line)
            </div>
            <div className="mt-2 flex items-center justify-end gap-2">
              <Input
                value={chatModeAppendText}
                onChange={(e) => setChatModeAppendText(e.target.value)}
                placeholder="Append text"
                className="h-9 flex-1 min-w-0"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-9 rounded-md px-3 text-xs"
                onClick={async () => {
                  const next = chatModeAppendText;
                  try {
                    await setUserConfig({ chat_mode_append_text: next });
                  } catch {
                  }
                  window.dispatchEvent(
                    new CustomEvent("cue-console:configUpdated", {
                      detail: { chat_mode_append_text: next },
                    })
                  );
                }}
              >
                Save
              </Button>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-sm font-medium">Pending request timeout (ms)</div>
            <div className="text-xs text-muted-foreground">
              Filter out pending requests older than this duration
            </div>
            <div className="mt-2 flex items-center justify-end gap-2">
              <Input
                value={pendingRequestTimeoutMs}
                onChange={(e) => setPendingRequestTimeoutMs(e.target.value)}
                placeholder="600000"
                inputMode="numeric"
                className="h-9 flex-1 min-w-0"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-9 rounded-md px-3 text-xs"
                onClick={async () => {
                  const raw = pendingRequestTimeoutMs.trim();
                  const parsed = Number(raw);
                  const next = Number.isFinite(parsed) ? parsed : 600000;
                  try {
                    await setUserConfig({ pending_request_timeout_ms: next });
                  } catch {
                  }
                  window.dispatchEvent(
                    new CustomEvent("cue-console:configUpdated", {
                      detail: { pending_request_timeout_ms: next },
                    })
                  );
                  setPendingRequestTimeoutMs(String(next));
                }}
              >
                Save
              </Button>
            </div>
          </div>

          <div className="mt-6">
            <div className="text-sm font-medium">Bot reply text</div>
            <div className="text-xs text-muted-foreground">
              Multi-line
            </div>
            <div className="mt-2 flex items-start justify-end gap-2">
              <textarea
                value={botModeReplyText}
                onChange={(e) => setBotModeReplyText(e.target.value)}
                placeholder="Bot reply"
                className="min-h-24 flex-1 min-w-0 resize-y rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-9 rounded-md px-3 text-xs"
                onClick={async () => {
                  const next = botModeReplyText;
                  try {
                    await setUserConfig({ bot_mode_reply_text: next });
                  } catch {
                  }
                  window.dispatchEvent(
                    new CustomEvent("cue-console:configUpdated", {
                      detail: { bot_mode_reply_text: next },
                    })
                  );
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {moreMenu.open && (
        <div
          className="fixed z-50 min-w-44 rounded-lg border bg-white/90 p-1 shadow-lg backdrop-blur"
          style={{ left: moreMenu.x, top: moreMenu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {!bulkMode ? (
            <button
              className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() => {
                setBulkMode(true);
                setMoreMenu({ open: false });
              }}
            >
              Select
            </button>
          ) : (
            <button
              className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() => {
                clearBulk();
                setMoreMenu({ open: false });
              }}
            >
              Cancel selection
            </button>
          )}

          {view === "active" && (
            <button
              className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() => {
                setMoreMenu({ open: false });
                void handleArchiveAll();
              }}
            >
              Archive all
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ConversationIconButton({
  item,
  avatarUrl,
  isSelected,
  onClick,
}: {
  item: ConversationItem;
  avatarUrl?: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  const emoji = item.type === "group" ? "👥" : getAgentEmoji(item.name);
  return (
    <button
      className={cn(
        "relative flex h-11 w-11 items-center justify-center rounded-2xl transition",
        "backdrop-blur-sm",
        isSelected
          ? "bg-primary/10 text-accent-foreground shadow-sm"
          : "hover:bg-white/40"
      )}
      onClick={onClick}
      title={item.displayName}
    >
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt=""
          width={28}
          height={28}
          unoptimized
          className="h-7 w-7 rounded-full"
        />
      ) : (
        <span className="text-xl">{emoji}</span>
      )}
      {item.pendingCount > 0 && (
        <span className="absolute -right-0.5 -top-0.5 z-10 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-sidebar" />
      )}
    </button>
  );
}

function ConversationItemCard({
  item,
  avatarUrl,
  isSelected,
  isPinned,
  onClick,
  bulkMode,
  checked,
  onToggleChecked,
}: {
  item: ConversationItem;
  avatarUrl?: string;
  isSelected: boolean;
  isPinned?: boolean;
  onClick: () => void;
  bulkMode?: boolean;
  checked?: boolean;
  onToggleChecked?: () => void;
}) {
  const emoji = item.type === "group" ? "👥" : getAgentEmoji(item.name);
  const showAgentTags = item.type === "agent" && (item.agentRuntime || item.projectName);

  return (
    <button
      className={cn(
        "flex w-full items-center gap-2.5 rounded-2xl px-2.5 py-1.5 text-left transition overflow-hidden",
        "backdrop-blur-sm",
        isSelected
          ? "bg-primary/10 text-accent-foreground shadow-sm"
          : isPinned
            ? "bg-amber-200/15 hover:bg-amber-200/20"
            : "hover:bg-white/40"
      )}
      onClick={onClick}
    >
      {bulkMode && (
        <span className="flex h-9 w-5 items-center justify-center">
          <input
            type="checkbox"
            checked={!!checked}
            onChange={() => onToggleChecked?.()}
            onClick={(e) => e.stopPropagation()}
          />
        </span>
      )}
      <span className="relative h-9 w-9 shrink-0">
        <span className="flex h-full w-full items-center justify-center rounded-full bg-white/55 ring-1 ring-white/40 text-[18px] overflow-hidden">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt=""
              width={36}
              height={36}
              unoptimized
              className="h-full w-full rounded-full"
            />
          ) : (
            emoji
          )}
        </span>
        {item.pendingCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 z-10 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-background" />
        )}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium leading-5">
            {isPinned && <Pin className="h-3.5 w-3.5 shrink-0 text-amber-600/80" />}
            {truncateText(item.displayName, 18)}
          </span>
          {item.lastTime && (
            <span className="text-[11px] text-muted-foreground shrink-0">
              {formatTime(item.lastTime)}
            </span>
          )}
        </div>
        {showAgentTags && (
          <div className="mt-0.5 flex flex-wrap gap-1">
            {item.agentRuntime && (
              <span className="inline-flex items-center rounded-full border bg-white/55 px-2 py-0.5 text-[10px] text-muted-foreground">
                {item.agentRuntime}
              </span>
            )}
            {item.projectName && (
              <span className="inline-flex items-center rounded-full border bg-white/55 px-2 py-0.5 text-[10px] text-muted-foreground">
                {item.projectName}
              </span>
            )}
          </div>
        )}
        {item.lastMessage && (
          <p className="text-[11px] text-muted-foreground whitespace-nowrap leading-4">
            {truncateText(item.lastMessage.replace(/\n/g, ' '), 20)}
          </p>
        )}
      </div>
    </button>
  );
}
