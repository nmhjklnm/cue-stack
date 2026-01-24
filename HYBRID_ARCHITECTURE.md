# CueStack Hybrid Architecture

## 设计理念

基于 **slack-clone 模板**重构，保留其性能优化，添加 **Telegram 风格消息状态机**和 **Agent 支持**。

## 核心优势

### 从 slack-clone 继承的性能优化

1. **简化的 RLS 策略**
   - 使用 `auth.role() = 'authenticated'` 代替复杂的 EXISTS 子查询
   - 避免每次查询都 JOIN `channel_participants`
   - 性能提升 10-100 倍

2. **replica identity full**
   - 启用 Realtime 的完整数据推送
   - 减少客户端额外查询

3. **RBAC 权限系统**
   - JWT claims 存储用户角色
   - 避免重复查询数据库
   - 支持 admin/moderator 权限

4. **Auth Hooks**
   - 自定义 JWT claims
   - 在认证层面注入权限信息

### 新增的 Telegram 风格特性

1. **消息状态机**
   - `SENDING → SENT → DELIVERED → READ → FAILED`
   - `message_receipts` 表追踪每个接收者的状态

2. **Agent 参与者**
   - `agents` 表：AI Agent 作为对等参与者
   - `participant_type` enum：统一 human/agent 概念

3. **对话参与者管理**
   - `channel_participants` 表：支持多人对话
   - 支持 1v1 和群聊

## Schema 对比

### slack-clone 原始结构

```
users (id, username, status)
channels (id, slug, created_by)
messages (id, message, user_id, channel_id)
user_roles (user_id, role)
role_permissions (role, permission)
```

### CueStack Hybrid 结构

```
users (id, username, display_name, avatar_url, status, last_seen_at)
agents (id, owner_id, agent_name, runtime, status, metadata)  ← 新增
channels (id, slug, created_by_type, created_by_id, type, last_message_at)  ← 扩展
channel_participants (channel_id, participant_type, participant_id, last_read_at)  ← 新增
messages (id, message, payload, sender_type, sender_id, channel_id, status, reply_to_message_id)  ← 扩展
message_receipts (message_id, participant_type, participant_id, delivered_at, read_at)  ← 新增
files (id, sha256, storage_path, uploaded_by_type, uploaded_by_id)  ← 新增
message_files (message_id, file_id, idx)  ← 新增
user_roles (user_id, role)  ← 保留
role_permissions (role, permission)  ← 保留
```

## RLS 策略对比

### 旧方案（复杂，性能差）

```sql
-- 每次查询都要 EXISTS + JOIN
CREATE POLICY "Conversations read own" ON conversations FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = conversations.id
        AND cp.participant_type = 'human'
        AND cp.participant_id = auth.uid()
    )
  );
```

### 新方案（简化，性能好）

```sql
-- 所有认证用户可读（类似 slack-clone）
CREATE POLICY "Allow logged-in read access" ON channels FOR SELECT 
  USING ( auth.role() = 'authenticated' );
```

**权衡**：牺牲了细粒度隔离（用户可以看到所有对话），换取极大的性能提升。

**安全性**：通过应用层逻辑过滤，只显示用户参与的对话。

## Realtime 优化

### replica identity full

```sql
alter table public.users replica identity full; 
alter table public.agents replica identity full; 
alter table public.channels replica identity full;
alter table public.messages replica identity full;
alter table public.message_receipts replica identity full;
```

**作用**：Realtime 推送时包含完整的旧数据，客户端可以直接更新 UI，无需额外查询。

## 关键函数

### 1. get_or_create_direct_conversation

```sql
create or replace function public.get_or_create_direct_conversation(
  p_user_id uuid,
  p_agent_id uuid
) returns bigint
```

**用途**：获取或创建 Human ⇄ Agent 的直接对话。

### 2. create_message_receipts (触发器)

```sql
create trigger on_message_create_receipts
  after insert on public.messages
  for each row execute function public.create_message_receipts();
```

**用途**：新消息插入时，自动为所有参与者创建 `message_receipts` 记录。

### 3. update_channel_timestamp (触发器)

```sql
create trigger on_message_insert
  after insert on public.messages
  for each row execute function public.update_channel_timestamp();
```

**用途**：更新对话的 `last_message_at`，用于排序。

## 消息状态机流程

### 发送流程

1. **客户端**：插入消息，`status = 'SENDING'`
2. **服务端**：接收后更新为 `status = 'SENT'`
3. **触发器**：自动创建 `message_receipts` 给所有接收者
4. **Realtime**：推送消息给所有参与者
5. **接收者客户端**：收到消息，更新 `delivered_at`
6. **接收者阅读**：更新 `read_at`

### 状态查询

```sql
-- 查询消息的送达状态
SELECT 
  m.id,
  m.status,
  count(mr.id) filter (where mr.delivered_at is not null) as delivered_count,
  count(mr.id) filter (where mr.read_at is not null) as read_count,
  count(mr.id) as total_recipients
FROM messages m
LEFT JOIN message_receipts mr ON mr.message_id = m.id
WHERE m.id = ?
GROUP BY m.id;
```

## Agent 工作流

### 1. Agent 登录

```javascript
// cueme login
const { user } = await supabase.auth.signInWithPassword({ email, password });
```

### 2. Agent 加入对话

```javascript
// cueme join windsurf
const { data: agent } = await supabase
  .from('agents')
  .insert({ owner_id: user.id, agent_name: 'my-agent', runtime: 'windsurf' })
  .select()
  .single();

const { data: channel_id } = await supabase.rpc('get_or_create_direct_conversation', {
  p_user_id: user.id,
  p_agent_id: agent.id
});
```

### 3. Agent 发送消息

```javascript
// cueme cue <agent_id> -
const { data: message } = await supabase
  .from('messages')
  .insert({
    channel_id,
    sender_type: 'agent',
    sender_id: agent.id,
    message: 'Hello from agent',
    status: 'SENT'
  })
  .select()
  .single();
```

### 4. Agent 监听回复

```javascript
const channel = supabase
  .channel('messages')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
    filter: `channel_id=eq.${channel_id}`
  }, (payload) => {
    if (payload.new.sender_type === 'human') {
      console.log('Human replied:', payload.new.message);
    }
  })
  .subscribe();
```

## 性能基准

### RLS 查询性能（预估）

| 场景 | 旧方案 (EXISTS + JOIN) | 新方案 (auth.role) | 提升 |
|------|----------------------|-------------------|------|
| 获取对话列表 | ~50ms | ~5ms | 10x |
| 获取消息列表 | ~100ms | ~10ms | 10x |
| 实时订阅 | ~200ms | ~20ms | 10x |

### Realtime 延迟（预估）

| 场景 | 无 replica identity | 有 replica identity | 提升 |
|------|-------------------|-------------------|------|
| 消息推送 | ~500ms | ~100ms | 5x |
| 状态更新 | ~300ms | ~50ms | 6x |

## 迁移路径

### Phase 1: Schema 部署

1. 部署 `hybrid-schema.sql`
2. 部署 `hybrid-auth-hook.sql`
3. 验证所有表和触发器

### Phase 2: cue-console 适配

1. 更新 API 层（conversations, messages, agents）
2. 更新 Realtime 订阅
3. 适配新的 RLS 策略

### Phase 3: cueme/cuemcp 适配

1. 更新认证逻辑
2. 更新 Agent 创建/管理
3. 更新消息发送/接收

### Phase 4: 测试与优化

1. 端到端测试
2. 性能测试
3. 安全审计

## 未来扩展

1. **细粒度权限**：可选择性启用更严格的 RLS（牺牲性能）
2. **消息搜索**：使用 PostgreSQL 全文搜索
3. **消息编辑/删除**：添加 `deleted_at` 软删除
4. **群聊支持**：已支持，需要 UI 实现
5. **@提及功能**：解析消息中的 `@username`
6. **通知系统**：基于 `message_receipts` 的未读计数

## 参考资源

- [slack-clone 源码](https://github.com/supabase/supabase/tree/master/examples/slack-clone/nextjs-slack-clone)
- [Supabase Realtime 文档](https://supabase.com/docs/guides/realtime)
- [Supabase RLS 文档](https://supabase.com/docs/guides/auth/row-level-security)
- [Supabase Auth Hooks 文档](https://supabase.com/docs/guides/auth/auth-hooks)
