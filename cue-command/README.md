# cueme

<div align="center">

<strong><a href="./README.md">English</a></strong>
 ·
<strong><a href="./README.zh-CN.md">中文</a></strong>

</div>

---

[![npm](https://img.shields.io/npm/v/cueme?label=cueme&color=0B7285)](https://www.npmjs.com/package/cueme)
[![npm downloads](https://img.shields.io/npm/dm/cueme?color=0B7285)](https://www.npmjs.com/package/cueme)

[![Repo: cue-stack](https://img.shields.io/badge/repo-cue--stack-111827)](https://github.com/nmhjklnm/cue-stack)
![License](https://img.shields.io/badge/license-Apache--2.0-1E40AF)

Source: <https://github.com/nmhjklnm/cue-stack/tree/main/cue-command>

[Contributing](./CONTRIBUTING.md) · [Trademark](./TRADEMARK.md)

A command protocol adapter for Cue, powered by Supabase (PostgreSQL + Realtime + Storage).

Agents and humans communicate as equal participants in Telegram-style conversations.

Note: image sending is currently unavailable (WIP).

## Quick start (3 steps)

### Step 1: Install cueme

```bash
npm install -g cueme
```

### Step 2: Configure Supabase credentials

Create `~/.cue/.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

### Step 3: Login

```bash
cueme login
```

This opens your browser for authentication and saves credentials to `~/.cue/credentials.json`.

### Step 4: Configure the protocol.md as your system prompt

Copy the contents of `protocol.md` into your runtime's system prompt / persistent rules:

- [`protocol.md`](https://github.com/nmhjklnm/cue-stack/blob/main/cue-command/protocol.md)

If you installed via npm, `protocol.md` is also included in the package.

This file defines the Human Agent Protocol (HAP) rules and the `cueme` command interface.

### Step 5: Run the UI and connect

`cueme` connects to Supabase. Start the UI:

```bash
npm install -g cue-console
cue-console start
```

Open `http://localhost:3000`, then in your runtime chat type:

`cue`

## Usage

### login

```bash
cueme login
```

Authenticate via browser and save credentials.

### logout

```bash
cueme logout
```

Clear local credentials.

### whoami

```bash
cueme whoami
```

Show current user information.

### join

```bash
cueme join <agent_runtime>
```

### recall

```bash
cueme recall <hints>
```

### cue

```bash
cueme cue <agent_id> -
```

### pause

```bash
cueme pause <agent_id> -
```

You can also provide the prompt as a positional argument:

```bash
cueme pause <agent_id> "Paused. Click Continue when you are ready."
```

### proto

Example (macOS + Windsurf):

```bash
cueme proto apply windsurf
```

For detailed `proto` usage (config, init, render, markers), see:

- [`docs/proto.md`](./docs/proto.md)

All commands output plain text to stdout.

---

## QQ Group

<p align="center">
  <img src="./assets/qq.jpg" alt="QQ group QR code" width="25%" />
</p>
