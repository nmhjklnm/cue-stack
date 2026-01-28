# cueme proto

This document describes the `cueme proto` command family.

## What it does

`cueme proto` injects the shared `protocol.md` into a specific agent file by composing:

`final_proto = prefix(agent) + "\n\n" + proto_block + runtime_block`

`proto_block` and `runtime_block` are separate managed blocks:

```
<!-- HUMAN_AGENT_PROTO_BEGIN -->
... protocol.md ...
<!-- HUMAN_AGENT_PROTO_END -->

<!-- HUMAN_AGENT_RUNTIME_BEGIN -->
... runtime-specific guidance ...
<!-- HUMAN_AGENT_RUNTIME_END -->
```

The injected content is managed between sentinel markers and may be overwritten by `cueme proto apply`.

## Config

Config file path:

`~/.cue/cueme.json`

Required keys:

- `cueme.proto.path`: map of injection target paths by `<platform>.<agent>`
  - `platform`: `linux` | `macos` | `windows`
  - supports `~` and `%ENV%` expansions (e.g. `%APPDATA%`, `%USERPROFILE%`)
- `cueme.proto.prefix`: map of prefix by `<agent>`
  - can be a string or string array (joined with `\n`)
- `cueme.proto.runtime`: map of runtime-specific guidance by `<agent>`
  - can be a string or string array (joined with `\n`)
- `cueme.proto.protocol_path`: absolute or relative path to the shared `protocol.md`
  - supports `~` and `%ENV%` expansions

Example:

```json
{
  "cueme.proto.path": {
    "macos.vscode": "~/Library/Application Support/Code/User/prompts/human_proto.md",
    "macos.windsurf": "~/.codeium/windsurf/memories/global_rules.md",

    "windows.vscode": "%APPDATA%\\Code\\User\\prompts\\human_proto.md",
    "windows.windsurf": "%USERPROFILE%\\.codeium\\windsurf\\memories\\global_rules.md",

    "linux.vscode": "~/.config/Code/User/prompts/human_proto.md",
    "linux.windsurf": "~/.codeium/windsurf/memories/global_rules.md",

    "macos.codex": "~/.codex/AGENTS.md",
    "windows.codex": "%USERPROFILE%\\.codex\\AGENTS.md",
    "linux.codex": "~/.codex/AGENTS.md",

    "macos.claude": "~/.claude/CLAUDE.md",
    "windows.claude": "%USERPROFILE%\\.claude\\CLAUDE.md",
    "linux.claude": "~/.claude/CLAUDE.md"
  },
  "cueme.proto.prefix": {
    "vscode": [
      "---",
      "applyTo: '**'",
      "---"
    ],
    "codex": [],
    "claude": [],
    "windsurf": []
  },
  "cueme.proto.runtime": {
    "codex": [
      "When calling cueme cue/pause, set the tool wait timeout to 24h to avoid premature tool timeouts.",
      "不要误解“更新 todo_list”的指令，因为你是 codex，你需要做的是：把 update_plan 当作 todo_list 来维护任务，而不是创建本地 todo_list 文件。"
    ],
    "claude": [
      "When calling cueme cue/pause, set the tool wait timeout to 24h to avoid premature tool timeouts."
    ]
  },
  "cueme.proto.protocol_path": "~/path/to/protocol.md"
}
```

## Sentinel markers

Injected content is managed between these markers:

```text
<!-- HUMAN_AGENT_PROTO_BEGIN -->
... managed content ...
<!-- HUMAN_AGENT_PROTO_END -->

<!-- HUMAN_AGENT_RUNTIME_BEGIN -->
... managed content ...
<!-- HUMAN_AGENT_RUNTIME_END -->
```

Notes:

- Markers are written in the standardized `HUMAN_*` form.
- Existing files that still use `HUAMN_*` markers are also recognized for replacement.

## Commands

### Render (print to stdout)

```bash
cueme proto <agent>
```

Generates and prints `final_proto` to stdout.

### Apply (inject into agent file)

```bash
cueme proto apply <agent>
```

Behavior:

- Resolves the target path using `cueme.proto.path["<platform>.<agent>"]`.
- Writes/updates the managed block in the target file.
- Preserves the target file's existing EOL style when updating.

### Init (create config)

```bash
cueme proto init
```

Creates `~/.cue/cueme.json` if missing (never overwrites).

Auto-detect (current platform only):

- `vscode`: `.vscode/prompts/human_proto.md` (workspace) then platform user path
- `windsurf`: `.codeium/windsurf/memories/global_rules.md` (workspace) then platform user path
- `kiro`: `~/.kiro/steering/cueme_proto.md` (user-level)
- `claude`: `~/.claude/CLAUDE.md` (user-level)
- `codex`: uses `~/.codex/AGENTS.md` by default (not auto-detected)

### Helpers

```bash
cueme proto ls
cueme proto path <agent>
```
