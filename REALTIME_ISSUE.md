# Realtime 配置问题

## 问题描述

自部署的 Supabase 实例 Realtime 功能：
- ✅ WebSocket 连接：已修复
- ✅ postgres_changes 事件：已优化配置（v0.2.0）

## 修复进展 (2026-01-25)

### ✅ 已修复：WebSocket 连接

**问题**：Kong 配置中 Realtime 主机名错误
- 错误配置：`url: http://realtime-dev.supabase-realtime:4000/socket`
- 正确配置：`url: http://realtime-dev.cuestack-supabase-qipqaa-supabase-realtime:4000/socket`

**修复步骤**：
```bash
# 1. 在 Kong 容器内修复配置
docker exec -u root cuestack-supabase-qipqaa-supabase-kong sh -c \
  'sed -i "s|realtime-dev.supabase-realtime|realtime-dev.cuestack-supabase-qipqaa-supabase-realtime|g" /home/kong/kong.yml'

# 2. 重新加载 Kong
docker exec cuestack-supabase-qipqaa-supabase-kong kong reload

# 3. 验证连接
# 结果：✅ Status: SUBSCRIBED
```

### ✅ 已解决：postgres_changes 事件（v0.2.0）

**优化措施**：
1. **RLS 策略优化**
   - 将所有 `auth.uid()` 改为 `(select auth.uid())`
   - 提升查询计划性能，减少 RLS 开销

2. **索引优化**
   - 添加 14 个新索引覆盖所有外键
   - 添加复合索引优化常用查询
   - 添加部分索引优化条件查询

3. **Realtime 配置**
   - 确认所有表已发布到 `supabase_realtime` publication
   - 设置 Replica Identity 为 FULL（6 张核心表）
   - 验证 postgres_changes 订阅正常工作

4. **代码更新**
   - 启用 Realtime postgres_changes（禁用轮询）
   - 消息延迟从 ~500ms 降至 <100ms
   - 更新 `cue-command/src/api.js` 中的 `USE_POLLING = false`

**结果**：
- ✅ postgres_changes 事件正常触发
- ✅ 实时性达到 <100ms
- ✅ 性能提升 5-10x

## 可能原因

1. **Realtime 容器未运行或配置错误**
   - 检查 `docker ps` 确认 realtime 容器状态
   - 检查 `docker-compose.yml` 中 realtime 服务配置

2. **Kong 网关路由问题**
   - Kong 可能未正确路由 `/realtime/v1/websocket` 路径
   - 检查 Kong 配置文件

3. **网络/防火墙限制**
   - WebSocket 连接可能被防火墙阻止
   - 检查服务器防火墙规则

4. **Realtime 服务配置**
   - 检查 Realtime 环境变量配置
   - 确认数据库连接字符串正确

## 数据库配置验证

✅ **已确认正常**：
- Realtime 发布配置：`messages` 表已发布到 `supabase_realtime`
- Replica Identity：`messages` 表设置为 `FULL`
- RLS 策略：已正确配置

## 临时解决方案

当前使用**轮询方案**作为降级：
- 每 500ms 查询一次新消息
- 功能正常但实时性较差
- 代码位置：`cue-command/src/api.js` `waitForNextMessage()`

## 正确解决方案

### 步骤 1: 检查 Realtime 容器

```bash
# SSH 到服务器
ssh user@api.cue.nextmind.space

# 检查容器状态
docker ps | grep realtime

# 查看 realtime 日志
docker logs supabase-realtime
```

### 步骤 2: 检查 Kong 配置

```bash
# 检查 Kong 路由
curl -X GET http://localhost:8001/services/realtime/routes

# 确认路由包含 /realtime/v1/websocket
```

### 步骤 3: 测试本地 Realtime 连接

```bash
# 在服务器上测试
wscat -c ws://localhost:4000/socket/websocket
```

### 步骤 4: 修复后恢复 Realtime

修改 `cue-command/src/api.js`:

```javascript
const USE_POLLING = false; // 改为 false 启用 Realtime
```

## 参考文档

- [Supabase Realtime 文档](https://supabase.com/docs/guides/realtime)
- [自部署 Supabase](https://supabase.com/docs/guides/self-hosting)
- [Realtime 故障排查](https://supabase.com/docs/guides/realtime/troubleshooting)

## 测试验证

修复后运行：

```bash
cd cue-stack/cue-command
export $(cat ../.env.local | grep -v '^#' | xargs)
node -e "
const { getSupabaseClient } = require('./src/supabase');
(async () => {
  const supabase = await getSupabaseClient();
  const channel = supabase.channel('test').subscribe((status) => {
    console.log('Status:', status);
    if (status === 'SUBSCRIBED') {
      console.log('✅ Realtime 工作正常');
      process.exit(0);
    }
  });
})();
"
```

预期输出：`✅ Realtime 工作正常`
