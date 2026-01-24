# CueStack

<div align="center">

<strong><a href="./README.md">English</a></strong>
 ·
<strong><a href="./README.zh-CN.md">中文</a></strong>

</div>

---

<div align="center">

[![Repo: cue-stack](https://img.shields.io/badge/repo-cue--stack-111827)](https://github.com/nmhjklnm/cue-stack)
[![License](https://img.shields.io/github/license/nmhjklnm/cue-stack?color=1E40AF)](./LICENSE)
[![CI](https://github.com/nmhjklnm/cue-stack/actions/workflows/publish.yml/badge.svg)](https://github.com/nmhjklnm/cue-stack/actions/workflows/publish.yml)
[![npm](https://img.shields.io/npm/v/cue-console?label=cue-console&color=0B7285)](https://www.npmjs.com/package/cue-console)
[![npm downloads](https://img.shields.io/npm/dm/cue-console?color=0B7285)](https://www.npmjs.com/package/cue-console)
[![npm](https://img.shields.io/npm/v/cueme?label=cueme&color=0B7285)](https://www.npmjs.com/package/cueme)
[![npm downloads](https://img.shields.io/npm/dm/cueme?color=0B7285)](https://www.npmjs.com/package/cueme)
[![PyPI](https://img.shields.io/pypi/v/cuemcp?label=cuemcp&color=0B7285)](https://pypi.org/project/cuemcp/)
[![PyPI downloads](https://img.shields.io/pypi/dm/cuemcp?color=0B7285)](https://pypi.org/project/cuemcp/)
[![Python versions](https://img.shields.io/pypi/pyversions/cuemcp?color=0B7285)](https://pypi.org/project/cuemcp/)

</div>

[Contributing](./CONTRIBUTING.md) · [Trademark](./TRADEMARK.md)

| Mobile | Desktop |
| --- | --- |
| ![Mobile screenshot](./assets/iphone.png) | ![Desktop screenshot](./assets/desktop.png) |

Treat your agent as a collaborator.

Open the console.

Agents can run for hours. At that point they stop feeling like “tools” and start feeling like “coworkers”.
Coworkers don’t dump their entire context on you — they bring progress, questions, and decisions. HAP defines that contract; `cue-command` implements it.

**Architecture**: Telegram-style messaging platform powered by Supabase (PostgreSQL + Realtime + Storage). Agents and humans communicate as equal participants in conversations.

| Package | What it is | Source |
| --- | --- | --- |
| `cue-console` | UI inbox (desktop + mobile) | [/cue-console](./cue-console) |
| `cue-command` | HAP command adapter (`cueme`) | [/cue-command](./cue-command) |
| `cue-mcp` | HAP implementation (MCP server) | [/cue-mcp](./cue-mcp) |

---

## Start here (copy/paste runway)

### 1) Install packages & start UI

```bash
npm install -g cue-console
npm install -g cueme
cue-console start
```

Open `http://localhost:3000`.

**Note**: You need to configure Supabase credentials (see [Environment Setup](#environment-setup)).

### 2) Environment Setup

Create `.env.local` in your `cue-console` installation directory:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

For `cueme` and `cuemcp`, create `~/.cue/.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

### 3) Login

**cueme** (command mode):

```bash
cueme login
```

This opens your browser for authentication and saves credentials to `~/.cue/credentials.json`.

**cue-console** (web UI):

Open `http://localhost:3000` and register/login via the web interface.

### 4) Configure system prompt

Use `cueme proto` to inject `protocol.md` into your runtime's persistent rules.

Example (macOS + Windsurf):

```bash
cueme proto apply windsurf
```

Reference:

- [`cue-command/protocol.md`](./cue-command/protocol.md)
- `cueme proto` docs: [cue-command/docs/proto.md](./cue-command/docs/proto.md)

### 5) Start the first chat in your IDE, then continue in cue-console

In your IDE chat panel, send the text:

`cue`

Then continue follow-up conversation rounds in cue-console (`http://localhost:3000`).

<details>
<summary>Optional: MCP server (cuemcp)</summary>

Recommended runtime command:

- `command`: `uvx`
- `args`: `--from cuemcp cuemcp`

Claude Code:

```bash
claude mcp add --transport stdio cuemcp -- uvx --from cuemcp cuemcp
```

<details>
<summary>Other runtimes (Windsurf / Cursor / Codex / VS Code)</summary>

Windsurf (`~/.codeium/mcp_config.json`):

```json
{
  "mcpServers": {
    "cuemcp": {
      "command": "uvx",
      "args": ["--from", "cuemcp", "cuemcp"]
    }
  }
}
```

Cursor (`mcp.json` in your project):

```json
{
  "mcpServers": {
    "cuemcp": {
      "command": "uvx",
      "args": ["--from", "cuemcp", "cuemcp"],
      "env": {}
    }
  }
}
```

Codex:

```bash
codex mcp add cuemcp -- uvx --from cuemcp cuemcp
```

VS Code:

```json
{
  "servers": {
    "cuemcp": {
      "type": "stdio",
      "command": "uvx",
      "args": ["--from", "cuemcp", "cuemcp"]
    }
  }
}
```

</details>

### If it doesn’t work (30-second checklist)

- `cue-console` is running and you opened `http://localhost:3000`
- Supabase credentials are configured correctly (`.env.local` and `~/.cue/.env`)
- You've logged in via `cueme login` or the web UI
- If you're using cuemcp: `uvx` is available (`uv` installed) and your runtime can launch the MCP server
- Your runtime has the HAP rule injected (so it calls `cue()` before ending and waits for you)

</details>

---
<details>
<summary>Architecture (at a glance)</summary>

```text
Agent/Runtime  ⇄  (cueme OR cuemcp)  ⇄  Supabase  ⇄  cue-console
```

```mermaid
flowchart LR
  A["Agent / Runtime\nClaude Code • Cursor • Windsurf • Codex"]
  B["cueme\ncommand adapter"]
  E["cuemcp\nMCP server"]
  C[("Supabase\nPostgreSQL + Realtime + Storage")]
  D["cue-console\nUI (desktop/mobile)"]

  A -->|command| B
  A -->|MCP stdio| E
  B --> C
  E --> C
  D <-->|API + Realtime| C
```

</details>

---

## QQ Group

<img src="./assets/qq.jpg" width="240" alt="QQ group QR code" />
