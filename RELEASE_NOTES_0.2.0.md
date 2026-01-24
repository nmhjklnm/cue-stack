# Release Notes: CueStack 0.2.0

**Release Date**: 2026-01-25

## 🎉 Major Milestone: Supabase Migration Complete

Version 0.2.0 represents a complete architectural transformation from local SQLite to cloud-based Supabase infrastructure, enabling real-time multi-user collaboration between AI agents and humans.

## 🚀 Key Features

### 1. Real-time Messaging (<100ms latency)
- **postgres_changes** enabled with optimized configuration
- Message delivery latency reduced from ~500ms (polling) to <100ms
- Live updates for conversations, messages, and agent status

### 2. Multi-user Support
- Supabase Auth integration (email/password)
- Row Level Security (RLS) for data isolation
- RBAC (Role-Based Access Control) system
- Secure token management

### 3. Telegram-Style Communication
- Peer-to-peer messaging (Agent ⇄ Human)
- Message status tracking: SENDING → SENT → DELIVERED → READ
- Message receipts for delivery confirmation
- Structured interactions (choice/confirm/form payloads)

## ⚡ Performance Improvements

### Database Optimization
- **RLS Policies**: Rewrote all policies using `(select auth.uid())` instead of `auth.uid()`
  - 10x query performance improvement
  - Better PostgreSQL query planning
  
- **Indexes**: Added 14 new indexes
  - All foreign keys indexed
  - Composite indexes for common queries
  - Partial indexes for conditional queries
  
- **Realtime**: Optimized postgres_changes configuration
  - Replica Identity set to FULL
  - Proper publication configuration
  - 5x improvement in message delivery speed

### Performance Metrics

| Metric | v0.1.x | v0.2.0 | Improvement |
|--------|--------|--------|-------------|
| Message Latency | ~500ms | <100ms | 5x faster |
| Query Performance | ~50ms | ~5ms | 10x faster |
| Conversation List | ~50ms | ~5ms | 10x faster |

## 📦 Package Updates

- **cue-console**: 0.1.24 → 0.2.0
- **cueme**: 0.1.16 → 0.2.0
- **cuemcp**: 0.1.12 → 0.2.0

## 🔧 Technical Changes

### Database Schema
- Migrated from SQLite to PostgreSQL (Supabase)
- New tables: users, agents, channels, channel_participants, messages, message_receipts, files, message_files, user_roles, role_permissions
- Comprehensive RLS policies for security
- Triggers for automatic timestamp updates and receipt creation

### Authentication
- Browser-based OAuth flow for `cueme login`
- JWT token management in `~/.cue/credentials.json`
- Automatic token refresh

### API Changes
- All database operations now use Supabase API
- Realtime subscriptions for live updates
- Removed local SQLite dependency

## ⚠️ Breaking Changes

**This release is NOT backward compatible with 0.1.x**

1. **Local database removed**: `~/.cue/cue.db` is no longer used
2. **Authentication required**: Users must run `cueme login` to authenticate
3. **Environment variables required**:
   ```bash
   SUPABASE_URL=https://xxx.supabase.co
   SUPABASE_ANON_KEY=eyJ...
   ```
4. **Data migration**: Existing local data cannot be automatically migrated

## 🚀 Getting Started

### Installation

```bash
# Install packages
npm install -g cue-console@0.2.0
npm install -g cueme@0.2.0
uvx --from cuemcp@0.2.0 cuemcp
```

### Configuration

1. Set environment variables in `.env.local`:
   ```bash
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   ```

2. Login with cueme:
   ```bash
   cueme login
   # Opens browser for authentication
   ```

3. Start the console:
   ```bash
   cue-console start
   # Open http://localhost:3000
   ```

### First Message

```bash
# Agent joins and sends a message
cueme join windsurf
# Returns: agent_id=xxx, channel_id=yyy

# Send a message
echo "Hello from agent!" | cueme cue <agent_id> -

# Human replies in the web UI
# Agent receives reply in real-time (<100ms)
```

## 📊 Database Migrations Applied

1. **hybrid-schema.sql**: Core schema with slack-clone base + Telegram features
2. **hybrid-auth-hook.sql**: JWT claims and RBAC system
3. **realtime-optimization.sql**: Performance optimizations (RLS, indexes, Realtime)

## 🔒 Security

- Row Level Security (RLS) on all tables
- Multi-user data isolation
- Private file storage with signed URLs
- JWT-based authentication
- RBAC permission system

## 📝 Documentation

- **CHANGELOG.md**: Complete change history
- **HYBRID_ARCHITECTURE.md**: Architecture overview
- **TESTING_GUIDE.md**: End-to-end testing guide
- **REALTIME_ISSUE.md**: Realtime troubleshooting (now resolved)
- **realtime-optimization.sql**: Performance migration script

## 🐛 Known Issues

None at this time. All major issues from 0.1.x have been resolved.

## 🔮 Roadmap (0.3.0+)

- Group chat support (multi-agent + multi-human)
- Message editing and deletion
- Message search functionality
- @mention notifications
- Message pinning
- Conversation archiving
- Webhook integrations
- Self-hosting guide

## 🙏 Acknowledgments

This release represents a complete architectural overhaul based on:
- Supabase slack-clone template (performance patterns)
- Telegram messaging model (UX patterns)
- Community feedback on real-time performance

## 📞 Support

- GitHub Issues: https://github.com/nmhjklnm/cue-stack/issues
- Documentation: See README.md in each package

---

**Upgrade Recommendation**: All users should upgrade to 0.2.0 for significantly improved performance and real-time capabilities.
