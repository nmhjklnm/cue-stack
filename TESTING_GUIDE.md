# CueStack 新 Schema 测试指南

本指南用于测试 CueStack 适配新 Supabase Schema（基于 slack-clone + Telegram 风格）后的功能。

## 前置条件

### 1. Supabase 项目配置

确保已部署以下 SQL 文件到 Supabase 项目：

- ✅ `hybrid-schema.sql` - 核心表结构
- ✅ `hybrid-auth-hook.sql` - Auth Hook

### 2. 环境变量配置

创建 `.env.local` 文件（或配置环境变量）：

```bash
# cue-console
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# cueme & cuemcp
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

### 3. 验证 Schema 部署

在 Supabase Dashboard 中验证：

```sql
-- 检查表是否存在
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('users', 'agents', 'channels', 'channel_participants', 'messages', 'message_receipts');

-- 检查 RPC 函数
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name = 'get_or_create_direct_conversation';

-- 检查 Realtime 发布
SELECT schemaname, tablename FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime';
```

---

## 测试流程

### Phase 1: cue-console 基础功能

#### 1.1 安装依赖

```bash
cd cue-stack/cue-console
pnpm install
```

#### 1.2 启动开发服务器

```bash
pnpm dev
```

访问 `http://localhost:3000`

#### 1.3 测试认证

- [ ] 注册新用户
- [ ] 登录
- [ ] 验证用户信息显示正确

#### 1.4 验证数据库

在 Supabase Dashboard 中检查：

```sql
-- 验证用户创建
SELECT id, username, display_name FROM users;
```

---

### Phase 2: cueme 命令行工具

#### 2.1 安装 cueme

```bash
cd cue-stack/cue-command
npm link  # 或 npm install -g .
```

#### 2.2 登录

```bash
cueme login
```

- [ ] 浏览器自动打开
- [ ] 登录成功
- [ ] 凭证保存到 `~/.cue/credentials.json`

#### 2.3 验证登录

```bash
cueme whoami
```

应输出：
```
user_id: xxx
email: xxx@example.com
```

#### 2.4 创建 Agent 并加入对话

```bash
cueme join windsurf
```

应输出：
```
agent_id=xxx
channel_id=xxx
project_dir=xxx
agent_terminal=xxx
agent_runtime=windsurf
```

**记录 agent_id 和 channel_id 用于后续测试**

#### 2.5 验证数据库

```sql
-- 验证 agent 创建
SELECT id, agent_name, runtime, status FROM agents;

-- 验证 channel 创建
SELECT id, slug, type, created_by_type FROM channels;

-- 验证参与者
SELECT channel_id, participant_type, participant_id FROM channel_participants;
```

#### 2.6 发送消息（Agent → Human）

```bash
echo '<cueme_prompt>
Hello from agent!
</cueme_prompt>' | cueme cue <agent_id> -
```

- [ ] 命令等待响应（不超时）
- [ ] 在 cue-console UI 中看到消息

#### 2.7 回复消息（Human → Agent）

在 cue-console UI 中：

- [ ] 看到 Agent 发送的消息
- [ ] 输入回复并发送
- [ ] cueme 命令收到回复并显示

---

### Phase 3: cue-console Realtime

#### 3.1 测试消息实时推送

**准备**：
- 打开两个浏览器窗口，都登录同一用户
- 窗口 A：打开对话列表
- 窗口 B：打开某个对话详情

**测试**：
1. 在窗口 B 发送消息
2. [ ] 窗口 A 的对话列表实时更新（最后消息时间）
3. [ ] 窗口 B 的消息列表实时显示新消息

#### 3.2 测试 Agent 消息推送

使用 cueme 发送消息：

```bash
echo '<cueme_prompt>
Test realtime message
</cueme_prompt>' | cueme cue <agent_id> -
```

- [ ] cue-console 实时收到消息
- [ ] 消息状态正确（SENT）
- [ ] 未读计数更新

---

### Phase 4: cuemcp MCP 服务器

#### 4.1 安装 cuemcp

```bash
cd cue-stack/cue-mcp
uvx --from cuemcp cuemcp
```

或配置到 MCP 客户端（如 Claude Desktop）：

```json
{
  "mcpServers": {
    "cue": {
      "command": "uvx",
      "args": ["--from", "cuemcp", "cuemcp"]
    }
  }
}
```

#### 4.2 测试 MCP 工具

在 MCP 客户端中调用：

```
join(runtime="claude_desktop")
```

- [ ] 返回 agent_id 和 channel_id
- [ ] 数据库中创建 agent 和 channel

```
cue(prompt="Hello from MCP!", agent_id="<agent_id>")
```

- [ ] cue-console 收到消息
- [ ] MCP 等待响应
- [ ] 回复后 MCP 收到响应

---

## 常见问题排查

### 1. 认证失败

**症状**：`Not authenticated` 错误

**解决**：
- 检查环境变量配置
- 验证 Supabase URL 和 ANON_KEY
- 重新登录：`cueme login`

### 2. 表不存在

**症状**：`relation "channels" does not exist`

**解决**：
- 确认已部署 `hybrid-schema.sql`
- 检查表名是否正确（channels 而非 conversations）

### 3. RLS 权限错误

**症状**：`new row violates row-level security policy`

**解决**：
- 确认已部署 `hybrid-auth-hook.sql`
- 检查用户是否已认证
- 验证 RLS 策略：

```sql
SELECT * FROM pg_policies WHERE tablename = 'channels';
```

### 4. Realtime 不工作

**症状**：消息不实时更新

**解决**：
- 检查 Realtime 是否启用
- 验证表已发布到 supabase_realtime
- 检查 replica identity：

```sql
SELECT relname, relreplident FROM pg_class 
WHERE relname IN ('channels', 'messages');
-- 应该返回 'f' (full)
```

### 5. 字段名错误

**症状**：`column "content" does not exist`

**解决**：
- 新 Schema 使用 `message` 字段而非 `content`
- 新 Schema 使用 `channel_id` 而非 `conversation_id`
- 新 Schema 使用 `inserted_at` 而非 `created_at`

---

## 性能验证

### 测试查询性能

```sql
-- 获取对话列表（应 < 10ms）
EXPLAIN ANALYZE
SELECT * FROM channels 
WHERE id IN (
  SELECT channel_id FROM channel_participants 
  WHERE participant_type = 'human' AND participant_id = 'xxx'
)
ORDER BY last_message_at DESC NULLS LAST;

-- 获取消息列表（应 < 10ms）
EXPLAIN ANALYZE
SELECT * FROM messages 
WHERE channel_id = 1 
ORDER BY inserted_at DESC 
LIMIT 50;
```

---

## 成功标准

- [ ] 用户可以通过 cue-console 注册登录
- [ ] Agent 可以通过 cueme/cuemcp 登录并创建对话
- [ ] 支持 Human ⇄ Agent 双向实时通信
- [ ] 消息状态正确显示（SENT → DELIVERED → READ）
- [ ] Realtime 通信延迟 < 500ms
- [ ] 所有 API 调用成功无错误
- [ ] 数据正确存储到新表结构

---

## 下一步

测试通过后：

1. 更新版本号（0.2.0）
2. 更新 CHANGELOG
3. 提交代码到 `feature/supabase-migration` 分支
4. 创建 PR 合并到主分支
5. 打 tag 并发布新版本
