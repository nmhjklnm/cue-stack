const http = require('http');
const { promises: fs } = require('fs');
const path = require('path');
const os = require('os');

const CREDENTIALS_PATH = path.join(os.homedir(), '.cue', 'credentials.json');
const CALLBACK_PORT = 54321;

async function ensureCueDir() {
  const dir = path.join(os.homedir(), '.cue');
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

async function saveCredentials(accessToken, refreshToken, expiresAt, user) {
  await ensureCueDir();
  const data = {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt,
    user: {
      id: user.id,
      email: user.email,
    },
  };
  await fs.writeFile(CREDENTIALS_PATH, JSON.stringify(data, null, 2), 'utf8');
}

async function loadCredentials() {
  try {
    const raw = await fs.readFile(CREDENTIALS_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function clearCredentials() {
  try {
    await fs.unlink(CREDENTIALS_PATH);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

function startCallbackServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.url.startsWith('/callback')) {
        const url = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);
        const accessToken = url.searchParams.get('access_token');
        const refreshToken = url.searchParams.get('refresh_token');
        const expiresIn = url.searchParams.get('expires_in');
        const error = url.searchParams.get('error');
        const errorDescription = url.searchParams.get('error_description');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`<html><body><h1>Login Failed</h1><p>${errorDescription || error}</p></body></html>`);
          server.close();
          reject(new Error(errorDescription || error));
          return;
        }

        if (!accessToken || !refreshToken) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<html><body><h1>Login Failed</h1><p>Missing tokens</p></body></html>');
          server.close();
          reject(new Error('Missing tokens in callback'));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><h1>Login Successful</h1><p>You can close this window now.</p></body></html>');
        
        server.close();
        
        const expiresAt = Date.now() + (parseInt(expiresIn) || 3600) * 1000;
        resolve({ accessToken, refreshToken, expiresAt });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(CALLBACK_PORT, 'localhost', () => {
      resolve({ server });
    });

    server.on('error', (err) => {
      reject(err);
    });
  });
}

async function login(supabaseUrl) {
  const { server } = await startCallbackServer();
  
  const redirectUri = `http://localhost:${CALLBACK_PORT}/callback`;
  const authUrl = `${supabaseUrl}/auth/v1/authorize?provider=email&redirect_to=${encodeURIComponent(redirectUri)}`;
  
  console.log(`Opening browser for login...`);
  console.log(`If browser doesn't open, visit: ${authUrl}`);
  
  const open = require('child_process').spawn('open', [authUrl], { stdio: 'ignore' });
  open.unref();
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error('Login timeout (5 minutes)'));
    }, 5 * 60 * 1000);

    server.on('close', () => {
      clearTimeout(timeout);
    });

    server.once('request', async (req, res) => {
      try {
        const url = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);
        const accessToken = url.searchParams.get('access_token');
        const refreshToken = url.searchParams.get('refresh_token');
        const expiresIn = url.searchParams.get('expires_in');

        if (accessToken && refreshToken) {
          const expiresAt = Date.now() + (parseInt(expiresIn) || 3600) * 1000;
          
          const { createClient } = require('@supabase/supabase-js');
          const supabase = createClient(supabaseUrl, accessToken);
          const { data: { user }, error } = await supabase.auth.getUser();
          
          if (error) throw error;
          
          await saveCredentials(accessToken, refreshToken, expiresAt, user);
          
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><h1>Login Successful</h1><p>You can close this window.</p></body></html>');
          
          server.close();
          clearTimeout(timeout);
          resolve({ user });
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(`<html><body><h1>Error</h1><p>${err.message}</p></body></html>`);
        server.close();
        clearTimeout(timeout);
        reject(err);
      }
    });
  });
}

async function logout() {
  await clearCredentials();
}

async function getToken() {
  const creds = await loadCredentials();
  if (!creds) return null;
  
  if (Date.now() >= creds.expires_at) {
    return null;
  }
  
  return creds.access_token;
}

async function whoami() {
  const creds = await loadCredentials();
  if (!creds) return null;
  return creds.user;
}

module.exports = {
  login,
  logout,
  getToken,
  whoami,
  loadCredentials,
  saveCredentials,
};
