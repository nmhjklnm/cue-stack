const { createClient } = require('@supabase/supabase-js');
const { loadCredentials, saveCredentials } = require('./auth');

let cachedClient = null;
let cachedUrl = null;
let cachedKey = null;

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!url || !key) {
    throw new Error('Missing Supabase configuration. Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.');
  }
  
  return { url, key };
}

async function getSupabaseClient() {
  const { url, key } = getSupabaseConfig();
  
  if (cachedClient && cachedUrl === url && cachedKey === key) {
    return cachedClient;
  }
  
  const creds = await loadCredentials();
  
  if (!creds) {
    throw new Error('Not authenticated. Run: cueme login');
  }
  
  if (Date.now() >= creds.expires_at) {
    const client = createClient(url, key);
    const { data, error } = await client.auth.refreshSession({
      refresh_token: creds.refresh_token,
    });
    
    if (error) {
      throw new Error('Session expired. Please login again: cueme login');
    }
    
    await saveCredentials(
      data.session.access_token,
      data.session.refresh_token,
      Date.now() + data.session.expires_in * 1000,
      data.user
    );
    
    cachedClient = createClient(url, key, {
      global: {
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
        },
      },
    });
  } else {
    cachedClient = createClient(url, key, {
      global: {
        headers: {
          Authorization: `Bearer ${creds.access_token}`,
        },
      },
    });
  }
  
  cachedUrl = url;
  cachedKey = key;
  
  return cachedClient;
}

function clearCache() {
  cachedClient = null;
  cachedUrl = null;
  cachedKey = null;
}

module.exports = {
  getSupabaseClient,
  getSupabaseConfig,
  clearCache,
};
