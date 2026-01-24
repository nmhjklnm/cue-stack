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

| 手机端 | 桌面端 |
| --- | --- |
| ![Mobile screenshot](./assets/iphone.png) | ![Desktop screenshot](./assets/desktop.png) |

把 Agent 当作伙伴,而不是工具。
你给它目标与授权,它会像协作者一样持续推进。
当它需要你参与时,它不会把一堆上下文扔给你——
它会发来像真人同事一样的协作:进度、问题、建议、以及需要你拍板的选择。
这些协作会像同事消息一样,自动进入你的协作控制台。
你随时可以在控制台里处理它们。

**架构**: 基于 Supabase (PostgreSQL + Realtime + Storage) 的 Telegram 风格消息平台。Agent 和 Human 作为对等参与者在对话中通信。

| 包 | 作用 | 源码 |
| --- | --- | --- |
| `cue-console` | UI inbox（桌面 + 手机） | [/cue-console](./cue-console) |
| `cue-command` | HAP command 适配器（`cueme`） | [/cue-command](./cue-command) |
| `cue-mcp` | HAP 的具象实现（MCP server） | [/cue-mcp](./cue-mcp) |

---

## 从这里开始（可复制路径）

### 1) 安装包并启动 UI

```bash
npm install -g cue-console
npm install -g cueme
cue-console start
```

打开 `http://localhost:3000`。

**注意**: 需要配置 Supabase 凭证（见 [环境配置](#环境配置)）。

### 2) 环境配置

在 `cue-console` 安装目录创建 `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

对于 `cueme` 和 `cuemcp`,创建 `~/.cue/.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

### 3) 登录

**cueme** (命令模式):

```bash
cueme login
```

这会打开浏览器进行认证,并将凭证保存到 `~/.cue/credentials.json`。

**cue-console** (Web UI):

打开 `http://localhost:3000` 通过 Web 界面注册/登录。

### 4) 配置 system prompt

复制 `cue-command/protocol.md` 的文本内容到你的 runtime 的 system prompt / persistent rules:

- [`cue-command/protocol.md`](./cue-command/protocol.md)

### 5) 首次对话在 IDE,后续轮次在 cue-console

首次对话在 IDE 的 chat 窗里发送一条消息：

`cue`

后续轮次对话在 cue-console（`http://localhost:3000`）中进行。

<details>
<summary>可选：MCP server（`cuemcp`）</summary>

推荐 command：

- `command`: `uvx`
- `args`: `--from cuemcp cuemcp`

Claude Code：

```bash
claude mcp add --transport stdio cuemcp -- uvx --from cuemcp cuemcp
```

<details>
<summary>其他 runtime（Windsurf / Cursor / Codex / VS Code）</summary>

Windsurf（`~/.codeium/mcp_config.json`）：

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

Cursor（项目内 `mcp.json`）：

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

Codex：

```bash
codex mcp add cuemcp -- uvx --from cuemcp cuemcp
```

VS Code：

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

### 如果不行（30 秒排错清单）

- `cue-console` 已运行,并打开了 `http://localhost:3000`
- Supabase 凭证配置正确(`.env.local` 和 `~/.cue/.env`)
- 已通过 `cueme login` 或 Web UI 登录
- `uvx` 可用(已安装 `uv`),runtime 能启动 MCP server
- HAP 规则已注入(否则 agent 不会在回复末尾调用 `cue()` 并等待你)）

</details>

---

<details>
<summary>架构图（快速理解）</summary>

```text
Agent/Runtime  ⇄  (cueme 或 cuemcp,二选一)  ⇄  Supabase  ⇄  cue-console
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
## QQ 群

<img src="./assets/qq.jpg" width="240" alt="QQ 群二维码" />
