![cuemcp banner](assets/banner.png)

_An MCP service on top of HAP (Human Agent Protocol) — compose humans and agents into a team._

[![PyPI](https://img.shields.io/pypi/v/cuemcp?label=cuemcp&color=0B7285)](https://pypi.org/project/cuemcp/)
[![PyPI downloads](https://img.shields.io/pypi/dm/cuemcp?color=0B7285)](https://pypi.org/project/cuemcp/)
[![Python versions](https://img.shields.io/pypi/pyversions/cuemcp?color=0B7285)](https://pypi.org/project/cuemcp/)

[![Repo: cue-stack](https://img.shields.io/badge/repo-cue--stack-111827)](https://github.com/nmhjklnm/cue-stack)
![License](https://img.shields.io/badge/license-Apache--2.0-1E40AF)

Source: <https://github.com/nmhjklnm/cue-stack/tree/main/cue-mcp>

[Contributing](./CONTRIBUTING.md) · [Trademark](./TRADEMARK.md)

---

## The pitch (10 seconds)

`cuemcp` is an MCP server that gives your agents a single "collaboration inbox" (`cue`/`cue()`), so you can run Claude Code, Cursor, Codex, Windsurf (and other MCP-capable runtimes) with one consistent collaboration flow.

Powered by Supabase (PostgreSQL + Realtime + Storage). Agents and humans communicate as equal participants in Telegram-style conversations.

Pair it with [`cue-console`](https://github.com/nmhjklnm/cue-stack/tree/main/cue-console) for a desktop/mobile UI to view pending collaboration requests and respond from anywhere.

Note: some IDEs can block/flag MCP integrations. If you run into that, command mode (`cueme`) is currently recommended.

---

## Quickstart (1 minute)

### Goal

Add `cuemcp` as a local `stdio` MCP server inside your agent/runtime.

Assumptions:

- You have `uv`.
- Your machine can run `uvx`.

### Notes

- Versions prior to `v0.1.11` are no longer usable. Please upgrade to `v0.1.11+`.
- The current version can occasionally disconnect (for example, the agent replies directly without calling `cue()` at the end).
- If you get disconnected, type `cue` in the affected runtime to trigger auto-reconnect.

### Step 1: Configure Supabase credentials

Create `~/.cue/.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

### Step 2: Add the HAP rule to your agent/runtime

Before using `cuemcp`, add a persistent HAP rule so your agent knows it must call `cue()` at the end of every response.

- **Windsurf**: add it to **Global Rules**.
- **Codex**: add it to `agents.md`.
- **Claude Code**: add it to `Claude.md`.

<details>
<summary>Human Agent Protocol (HAP) rules (required)</summary>

```text
# Human Agent Protocol

消息表达方式有两种：一种通过 cue mcp 输出，另一种通过非 cue mcp 的方式输出。

当用户接受 Human Agent Protocol 协议时，表示他已完全放弃通过非 cue mcp 的消息交互方式。这意味着你必须使用 cue mcp 才能与其进行交流；该限制仅影响交流方式，不影响你执行 command、使用其他 tool、mcp。

**强制规则**：每次回复前必须调用 `cuemcp` 工具，无例外。任何总结、任何提问、任何请求、任何选项都必须使用 cue mcp来给我。

**约定**：当用户发送 `cue` 即代表他接受Human Agent Protocol协议（支持断开重连）。

- 首次连接 / 无 agent_id：先执行 `join()` 获取 agent_id，再执行 `cue()`。

- 重连 / 已有 agent_id（例如网络波动导致 cue 中断但对话仍在继续）：用户再次发送 `cue` 时，优先直接用已有 agent_id 执行 `cue()`；仅当无法确认 agent_id 时才重新 `join()`。

### 调用时机

- 无历史会话、用户首次输入时调用 `join()` 获取 agent_id
- 每次对话完成后调用 `cue()`
- 任何回复结束前调用 `cue()`

### 禁止行为

- 不调用 `join()` 就使用自定义名字 ❌
- 不调用 `cue()` 就结束你给我的回复 ❌
- 用"有问题请告诉我"替代调用 ❌
- 假设用户没有后续需求 ❌

### 说明

不确定是否调用时默认采用调用 cue mcp 的方式。
```

Then continue with MCP configuration below.

### Step 3: Configure the MCP server

<details>
<summary>Claude Code</summary>

Claude Code can install local `stdio` MCP servers via `claude mcp add`.

```bash
claude mcp add --transport stdio cuemcp -- uvx --from cuemcp cuemcp
```

</details>

<details>
<summary>Windsurf</summary>

Windsurf reads MCP config from `~/.codeium/mcp_config.json` and uses the Claude Desktop-compatible schema.

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

</details>

<details>
<summary>Cursor</summary>

Cursor uses `mcp.json` for configuration, and the Cursor CLI (`cursor-agent`) can list and manage servers. The CLI uses the same MCP configuration as the editor.

```bash
cursor-agent mcp list
```

Create an `mcp.json` in your project (Cursor discovers configs with project → global → parent directory precedence) and add a `cuemcp` stdio server:

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

</details>

<details>
<summary>VS Code</summary>

VS Code MCP configuration uses a JSON file with `servers` and optional `inputs`.

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

<details>
<summary>Codex</summary>

Codex can register a local stdio MCP server via the CLI:

```bash
codex mcp add cuemcp -- uvx --from cuemcp cuemcp
```

For deeper configuration, Codex stores MCP servers in `~/.codex/config.toml`.

</details>

<details>
<summary>Gemini CLI</summary>

Gemini CLI can add a local stdio MCP server via:

```bash
gemini mcp add cuemcp uvx --from cuemcp cuemcp
```

</details>

<details>
<summary>Fallback: run from source (no `uvx`)</summary>

If you don’t want to rely on `uvx` (for example, you prefer pinned source or local hacking), you can run `cuemcp` from a cloned repository.

```bash
git clone https://github.com/nmhjklnm/cue-stack.git
cd cue-stack/cue-mcp
uv sync
uv run cuemcp
```

Then configure your MCP client to run:

- `command`: `cuemcp`
- `args`: `[]`

</details>

---
### Step 4: Connect your runtime

In the agent/runtime you want to use, type `cue` to trigger connect (or reconnect) and route the collaboration flow to `cue-console`.

Install `cue-console`

```bash
npm install -g cue-console
cue-console start
```

---

## Command mode (cueme)

If you don't want to use an MCP runtime but still want to speak to the same collaboration platform (Supabase), you can use a command-style adapter (`cueme`).

Install:

```bash
npm install -g cueme
```

Examples:

```bash
cueme join <agent_runtime>
cueme recall <hints>

cueme cue <agent_id> -
cueme pause <agent_id> -
```

Passing prompts via stdin (recommended):

```bash
cueme cue <agent_id> - <<'EOF'
What should I do next?
EOF
```

## Pairing with cue-console

**Rule #1:** both sides must use the same Supabase project.

- Configure Supabase credentials in `~/.cue/.env` (for `cuemcp`)
- Configure Supabase credentials in `.env.local` (for `cue-console`)
- Start `cuemcp`
- Start `cue-console`

When the UI shows conversations and messages in real-time, you're watching the Telegram-style collaboration flow.

---

## Dev workflow (uv)

```bash
uv sync
uv run cuemcp
```

---

## Safety

- **Do not commit tokens.**
  - If you store publish credentials in a project file (e.g. `.secret`), ensure it stays ignored.
- **Do not share tokens in chat.**

---

## Links

- **PyPI**: [pypi.org/project/cuemcp](https://pypi.org/project/cuemcp/)
- **Repo**: [github.com/nmhjklnm/cue-stack/tree/main/cue-mcp](https://github.com/nmhjklnm/cue-stack/tree/main/cue-mcp)

---

## QQ Group

<p align="center">
  <img src="./assets/qq.jpg" alt="QQ group QR code" width="25%" />
</p>
