# cue-console
 
[![Repo: cue-stack](https://img.shields.io/badge/repo-cue--stack-111827)](https://github.com/nmhjklnm/cue-stack)
[![npm](https://img.shields.io/npm/v/cue-console?label=cue-console&color=CB3837)](https://www.npmjs.com/package/cue-console)
[![npm downloads](https://img.shields.io/npm/dw/cue-console?color=CB3837)](https://www.npmjs.com/package/cue-console)
 
Source: <https://github.com/nmhjklnm/cue-stack/tree/main/cue-console>
 
[Contributing](./CONTRIBUTING.md) · [Trademark](./TRADEMARK.md)

| Mobile | Desktop |
| --- | --- |
| ![Mobile screenshot](./assets/iphone.png) | ![Desktop screenshot](./assets/desktop.png) |

---

## The pitch (10 seconds)

A desktop and mobile UI for Claude Code, Cursor CLI and Codex.

Telegram-style messaging platform powered by Supabase (PostgreSQL + Realtime + Storage). Agents and humans communicate as equal participants in conversations.

Use it locally or remotely to view your active sessions and respond to collaboration requests from anywhere (desktop or mobile), with a consistent interface that works everywhere.

Think of it as an “all-in-one” collaboration console for your agents and CLIs.

---

## Quickstart (1 minute)

### Goal

Run the console and pair it with `cueme` (recommended).

Note: `cuemcp` (MCP mode) can be blocked/flagged by some IDEs, so command mode is currently recommended.

### Step 1: Install `cue-console`

```bash
npm install -g cue-console
```

### Step 2: Configure Supabase credentials

Create `.env.local` in your project directory or set environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Step 3: Start `cue-console`

```bash
cue-console start
```

Alternatively, you can run it without installing globally:

```bash
npx cue-console start
```

Open `http://localhost:3000` and register/login.

### Step 4: Install `cueme` (recommended)

```bash
npm install -g cueme
```

### Step 5: Configure your system prompt (HAP)

Add the contents of `cue-command/protocol.md` to your tool's system prompt / rules (see [`cue-command`](https://github.com/nmhjklnm/cue-command)).

### Step 6: Connect your runtime

In the agent/runtime you want to use, call `cueme cue <agent_id> -` / `cueme pause <agent_id> -` (see `cue-command/protocol.md`).

---

### Optional: MCP mode (`cuemcp`)

Add and run the MCP server in your agent/runtime (see [`cue-mcp`](https://github.com/nmhjklnm/cue-mcp) for client-specific MCP configuration).

---

## Notes

- The current version can occasionally disconnect (for example, the agent replies directly without calling `cue()` at the end).
- If you get disconnected, type `cue` in the affected runtime to trigger auto-reconnect.

<details>
<summary>Human Agent Protocol (HAP) rules (required)</summary>

```text
Human Agent Protocol (HAP)

Hard rule: the agent must call the `cue` tool at the end of every response, no exceptions.
Always use the cue MCP to provide a final summary, ask a question, or request input.

Convention: when the user types `cue`, the user is accepting the HAP rules (supports disconnect + reconnect).

- First-time connection / no agent_id: call join() to obtain an agent_id, then call cue().
- Reconnect / existing agent_id (e.g. the cue call timed out but the chat continued):
  when the user types cue again, prefer calling cue() with the existing agent_id;
  only call join() again if you cannot determine the agent_id.

When to call

- On first message in a new chat (no history): call join().
- After completing any task: call cue().
- Before ending any response: call cue().

Forbidden behavior

- Using a self-chosen name without calling join() first.
- Ending a reply without calling cue().
- Replacing cue() with "let me know if you need anything else".
- Assuming there are no follow-ups.

Notes

If you are not sure whether to call it, call it.

Not calling cue() means the user cannot continue the interaction.
```

</details>

---

## Design notes

- **Group chat UX**: collaboration requests and responses are organized like a chat, so you can scan context quickly.
- **Mentions (`@...`)**: lightweight addressing to route a response or bring a specific agent/human into the thread.
- **Option cards**: responses can be captured as tappable cards with a responsive layout that works on both mobile and desktop.
- **Keyboard-first + mobile-friendly**: input affordances aim to work well with both quick desktop workflows and on-the-go usage.

## Pairing with cuemcp

**Rule #1:** both sides must use the same Supabase project.

- `cuemcp` connects to: Supabase (via `~/.cue/.env`)
- `cue-console` connects to: Supabase (via `.env.local`)
- Both must authenticate with the same Supabase project

## CLI

After installation, the `cue-console` command is available:

```bash
cue-console start
cue-console dev --port 3000
cue-console build
cue-console start --host 0.0.0.0 --port 3000
```

Supported commands:

- `dev`
- `build`
- `start`

Options:

- `--port <port>` (sets `PORT`)
- `--host <host>` (sets `HOSTNAME`)

## Local development

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

---

## QQ Group

<p align="center">
  <img src="./assets/qq.jpg" alt="QQ group QR code" width="25%" />
</p>
