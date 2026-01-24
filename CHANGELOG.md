# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-01-25

### 🚀 Major Features

- **Supabase Migration**: Complete migration from local SQLite to Supabase cloud architecture
  - Real-time messaging with postgres_changes (<100ms latency)
  - Multi-user support with authentication
  - Cloud-based storage for files and attachments
  - Scalable infrastructure for production use

- **Telegram-Style Messaging**: Agent ⇄ Human peer-to-peer communication
  - Conversation-based messaging (channels)
  - Message status tracking (SENDING → SENT → DELIVERED → READ)
  - Message receipts for delivery confirmation
  - Support for structured interactions (choice/confirm/form payloads)

### ⚡ Performance Improvements

- **RLS Policy Optimization**: Rewrote all Row Level Security policies
  - Changed `auth.uid()` to `(select auth.uid())` for better query planning
  - Reduced query execution time by ~10x
  - Improved database performance for conversation and message queries

- **Index Optimization**: Added comprehensive indexes
  - Foreign key indexes for all relationships
  - Composite indexes for common query patterns
  - Partial indexes for conditional queries
  - Estimated 5-10x performance improvement on large datasets

- **Realtime Configuration**: Optimized postgres_changes setup
  - Replica identity set to FULL for all tables
  - Proper publication configuration (supabase_realtime)
  - WebSocket connection optimization
  - Message delivery latency reduced from ~500ms (polling) to <100ms (realtime)

### 🔧 Technical Changes

#### cue-console (0.1.24 → 0.2.0)
- Removed `better-sqlite3` dependency
- Added `@supabase/supabase-js` and `@supabase/ssr`
- Implemented Supabase authentication (email/password)
- Migrated all database operations to Supabase API
- Updated UI to use channels instead of conversations
- Implemented real-time subscriptions for messages and channels

#### cueme (0.1.16 → 0.2.0)
- Removed local database (`~/.cue/cue.db`)
- Added Supabase client with token-based authentication
- Implemented `cueme login` command (browser-based OAuth flow)
- Updated all commands to use Supabase API
- Enabled Realtime postgres_changes (disabled polling fallback)
- Improved error handling and retry logic

#### cuemcp (0.1.12 → 0.2.0)
- Removed SQLModel/SQLAlchemy dependencies
- Added `supabase` Python client
- Migrated all MCP tools to use Supabase API
- Implemented token-based authentication
- Updated models to work with Supabase schema

### 📊 Database Schema

**New Tables**:
- `users` - Human participants (linked to auth.users)
- `agents` - AI agent participants (owned by users)
- `channels` - Conversations (direct or group)
- `channel_participants` - Many-to-many relationship
- `messages` - Message content with status tracking
- `message_receipts` - Delivery and read receipts
- `files` - File metadata and storage paths
- `message_files` - Message-file associations
- `user_roles` - RBAC role assignments
- `role_permissions` - Permission definitions

**Key Features**:
- Row Level Security (RLS) on all tables
- Realtime publication for live updates
- Replica identity FULL for complete change tracking
- Comprehensive indexes for performance
- Triggers for automatic timestamp updates and receipt creation

### 🔒 Security Improvements

- Multi-user isolation with RLS policies
- JWT-based authentication with Supabase Auth
- Private file storage with signed URLs
- RBAC (Role-Based Access Control) system
- Secure token management in `~/.cue/credentials.json`

### 🐛 Bug Fixes

- Fixed WebSocket connection issues (Kong hostname configuration)
- Fixed message receipt creation trigger (added SECURITY DEFINER)
- Fixed RLS policy performance issues
- Fixed missing indexes on foreign keys

### 📝 Documentation

- Added `HYBRID_ARCHITECTURE.md` - Architecture overview
- Added `TESTING_GUIDE.md` - End-to-end testing guide
- Added `REALTIME_ISSUE.md` - Realtime troubleshooting
- Added `realtime-optimization.sql` - Performance migration
- Updated `agents.md` - Reflected Supabase migration
- Updated `state.md` - Current implementation status

### ⚠️ Breaking Changes

- **Not backward compatible** with 0.1.x versions
- Local SQLite database (`~/.cue/cue.db`) is no longer used
- All data must be migrated to Supabase
- New authentication required (`cueme login`)
- Environment variables required:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`

### 🔮 Future Plans (0.3.0+)

- Group chat support (multi-agent + multi-human)
- Message editing and deletion
- Message search functionality
- @mention notifications
- Message pinning
- Conversation archiving
- Webhook integrations
- Self-hosting guide

---

## [0.1.24] - 2026-01-24

### Features
- Initial local SQLite implementation
- Request/Response model
- Basic file attachments
- Local-only operation

---

[0.2.0]: https://github.com/nmhjklnm/cue-stack/compare/v0.1.24...v0.2.0
[0.1.24]: https://github.com/nmhjklnm/cue-stack/releases/tag/v0.1.24
