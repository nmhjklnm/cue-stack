# Test Login Credentials

## Test User
- Email: `test_windsurf@cuestack.test`
- User ID: `8a155ab9-67c7-415b-bf9a-43e1b52296fd`
- Has: 1 channel, 1 agent (test_agent_windsurf)

## Expected Behavior After Fix
1. Navigate to http://localhost:3000
2. Should redirect to /login (middleware enforces auth)
3. Login with test credentials
4. Should redirect to / (home)
5. Conversation list should display 1 conversation with the agent

## What Was Fixed
1. **Root Cause**: `AuthProvider` was not wrapping the app in `providers.tsx`
2. **Impact**: All API calls to Supabase returned `user = null`, causing empty conversation list
3. **Fix**: Added `AuthProvider` wrapper in `src/app/providers.tsx`
4. **Additional Fixes**: 
   - Fixed message ordering in `fetchConversationList` 
   - Added proper error handling and logging
   - Fixed pending message count query
