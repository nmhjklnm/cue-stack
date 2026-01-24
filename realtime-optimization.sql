--
-- Realtime Optimization & Performance Improvements
-- 目标：配置 postgres_changes，优化 RLS 策略，添加缺失索引
--

-- ============================================
-- 1. 优化 RLS 策略（auth.uid() → (select auth.uid())）
-- ============================================

-- Users 表
DROP POLICY IF EXISTS "Users update own" ON public.users;
CREATE POLICY "Users update own" ON public.users 
  FOR UPDATE 
  USING ((select auth.uid()) = id);

-- Agents 表
DROP POLICY IF EXISTS "Agents read own" ON public.agents;
DROP POLICY IF EXISTS "Agents CRUD own" ON public.agents;

CREATE POLICY "Agents read own" ON public.agents 
  FOR SELECT 
  USING ((select auth.uid()) = owner_id);

CREATE POLICY "Agents all own" ON public.agents 
  FOR ALL 
  USING ((select auth.uid()) = owner_id);

-- Channels 表
DROP POLICY IF EXISTS "Channels read own" ON public.channels;
CREATE POLICY "Channels read own" ON public.channels 
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.channel_participants cp
      WHERE cp.channel_id = channels.id
        AND cp.participant_type = 'human'
        AND cp.participant_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Channels create" ON public.channels;
CREATE POLICY "Channels create" ON public.channels 
  FOR INSERT
  WITH CHECK (
    (created_by_type = 'human' AND created_by_id = (select auth.uid()))
  );

-- Messages 表
DROP POLICY IF EXISTS "Messages read own conversations" ON public.messages;
CREATE POLICY "Messages read own conversations" ON public.messages 
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.channel_participants cp
      WHERE cp.channel_id = messages.channel_id
        AND cp.participant_type = 'human'
        AND cp.participant_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Messages insert own" ON public.messages;
CREATE POLICY "Messages insert own" ON public.messages 
  FOR INSERT
  WITH CHECK (
    (sender_type = 'human' AND sender_id = (select auth.uid()))
    OR
    (sender_type = 'agent' AND EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.id = sender_id AND a.owner_id = (select auth.uid())
    ))
  );

-- Message Receipts 表
DROP POLICY IF EXISTS "Receipts read own" ON public.message_receipts;
CREATE POLICY "Receipts read own" ON public.message_receipts 
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.channel_participants cp ON cp.channel_id = m.channel_id
      WHERE m.id = message_receipts.message_id
        AND cp.participant_type = 'human'
        AND cp.participant_id = (select auth.uid())
    )
  );

-- Files 表
DROP POLICY IF EXISTS "Files read own" ON public.files;
CREATE POLICY "Files read own" ON public.files 
  FOR SELECT
  USING (
    (uploaded_by_type = 'human' AND uploaded_by_id = (select auth.uid()))
    OR
    EXISTS (
      SELECT 1 FROM public.message_files mf
      JOIN public.messages m ON m.id = mf.message_id
      JOIN public.channel_participants cp ON cp.channel_id = m.channel_id
      WHERE mf.file_id = files.id
        AND cp.participant_type = 'human'
        AND cp.participant_id = (select auth.uid())
    )
  );

-- ============================================
-- 2. 添加缺失的外键索引
-- ============================================

-- agents 表
CREATE INDEX IF NOT EXISTS idx_agents_owner_id ON public.agents(owner_id);

-- channels 表
CREATE INDEX IF NOT EXISTS idx_channels_created_by ON public.channels(created_by_type, created_by_id);

-- channel_participants 表
CREATE INDEX IF NOT EXISTS idx_channel_participants_channel ON public.channel_participants(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_participants_participant ON public.channel_participants(participant_type, participant_id);

-- messages 表
CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON public.messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages(sender_type, sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_channel_inserted ON public.messages(channel_id, inserted_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON public.messages(reply_to_message_id) WHERE reply_to_message_id IS NOT NULL;

-- message_receipts 表
CREATE INDEX IF NOT EXISTS idx_message_receipts_message_id ON public.message_receipts(message_id);
CREATE INDEX IF NOT EXISTS idx_message_receipts_participant ON public.message_receipts(participant_type, participant_id);

-- message_files 表
CREATE INDEX IF NOT EXISTS idx_message_files_message_id ON public.message_files(message_id);
CREATE INDEX IF NOT EXISTS idx_message_files_file_id ON public.message_files(file_id);

-- files 表
CREATE INDEX IF NOT EXISTS idx_files_uploaded_by ON public.files(uploaded_by_type, uploaded_by_id);
CREATE INDEX IF NOT EXISTS idx_files_sha256 ON public.files(sha256);

-- ============================================
-- 3. 确保 Realtime 发布配置正确
-- ============================================

-- 确保所有表都发布到 supabase_realtime
DO $$
BEGIN
  -- 检查 publication 是否存在
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- 添加表到 publication（如果尚未添加）
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.users;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.agents;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.channels;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.channel_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.message_receipts;

-- ============================================
-- 4. 确保 Replica Identity 为 FULL
-- ============================================

ALTER TABLE public.users REPLICA IDENTITY FULL;
ALTER TABLE public.agents REPLICA IDENTITY FULL;
ALTER TABLE public.channels REPLICA IDENTITY FULL;
ALTER TABLE public.channel_participants REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.message_receipts REPLICA IDENTITY FULL;

-- ============================================
-- 5. 创建复制槽（如果不存在）
-- ============================================

-- 注意：这需要 REPLICATION 权限，通常由 Supabase 自动管理
-- 如果需要手动创建：
-- SELECT pg_create_logical_replication_slot('supabase_realtime_replication_slot', 'pgoutput');

-- ============================================
-- 6. 验证配置
-- ============================================

-- 查看 publication 中的表
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime'
ORDER BY schemaname, tablename;

-- 查看 replica identity 设置
SELECT 
  schemaname, 
  tablename, 
  CASE relreplident
    WHEN 'd' THEN 'default'
    WHEN 'n' THEN 'nothing'
    WHEN 'f' THEN 'full'
    WHEN 'i' THEN 'index'
  END as replica_identity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' 
  AND c.relkind = 'r'
  AND c.relname IN ('users', 'agents', 'channels', 'channel_participants', 'messages', 'message_receipts')
ORDER BY c.relname;

-- 查看复制槽
SELECT slot_name, plugin, slot_type, database, active
FROM pg_replication_slots
WHERE slot_name LIKE 'supabase_realtime%';
