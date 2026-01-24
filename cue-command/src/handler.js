const { login, logout, whoami } = require('./auth');
const { getSupabaseConfig } = require('./supabase');
const {
  createAgent,
  getOrCreateDirectConversation,
  sendMessage,
  getMessages,
  updateAgentStatus,
  waitForNextMessage,
} = require('./api');

function detectAgentTerminal() {
  const platform = process.platform;
  if (platform === 'win32') {
    const comspec = (process.env.ComSpec ?? '').toString().toLowerCase();
    const psModulePath = (process.env.PSModulePath ?? '').toString();
    const shell = (process.env.SHELL ?? '').toString().toLowerCase();
    const nuVersion = (process.env.NU_VERSION ?? '').toString();
    const msystem = (process.env.MSYSTEM ?? '').toString().toLowerCase();

    if (
      shell.includes('powershell') ||
      shell.includes('pwsh') ||
      comspec.includes('powershell') ||
      comspec.includes('pwsh') ||
      psModulePath
    ) {
      return 'powershell';
    }

    if (nuVersion || shell.includes('nushell') || shell.endsWith('/nu') || shell === 'nu') return 'nushell';
    if (shell.endsWith('/bash') || shell === 'bash' || msystem) return 'bash';
    if (comspec.endsWith('cmd.exe') || comspec.includes('\\cmd.exe') || comspec.includes('/cmd.exe')) return 'cmd';
    return 'unknown';
  }

  const isWsl = Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP);
  const shellPath = (process.env.SHELL ?? '').toString().toLowerCase();
  if (shellPath.endsWith('/zsh') || shellPath === 'zsh') return 'zsh';
  if (shellPath.endsWith('/bash') || shellPath === 'bash') return 'bash';
  if (shellPath.endsWith('/fish') || shellPath === 'fish') return 'fish';
  if (shellPath.endsWith('/nu') || shellPath === 'nu' || shellPath.includes('nushell')) return 'nushell';
  if (isWsl && (shellPath.endsWith('/bash') || shellPath === 'bash' || !shellPath)) return 'bash';
  return 'unknown';
}

async function handleLogin() {
  const { url } = getSupabaseConfig();
  const { user } = await login(url);
  return {
    ok: true,
    data: {
      message: `Logged in as ${user.email}`,
      user_id: user.id,
      email: user.email,
    },
  };
}

async function handleLogout() {
  await logout();
  return {
    ok: true,
    data: { message: 'Logged out successfully' },
  };
}

async function handleWhoami() {
  const user = await whoami();
  if (!user) {
    return {
      ok: false,
      error: 'Not logged in. Run: cueme login',
    };
  }
  return {
    ok: true,
    data: {
      user_id: user.id,
      email: user.email,
    },
  };
}

async function handleJoin(runtime) {
  const agent = await createAgent(runtime, {
    project_dir: process.cwd(),
    agent_terminal: detectAgentTerminal(),
  });
  
  const conversation = await getOrCreateDirectConversation(agent.id);
  
  await updateAgentStatus(agent.id, 'ONLINE');
  
  const message = [
    `agent_id=${agent.id}`,
    `conversation_id=${conversation.id}`,
    `project_dir=${process.cwd()}`,
    `agent_terminal=${detectAgentTerminal()}`,
    `agent_runtime=${runtime}`,
  ].join('\n');
  
  return {
    ok: true,
    data: {
      message,
      agent_id: agent.id,
      conversation_id: conversation.id,
    },
  };
}

async function handleSend(agentId, prompt, payload = null) {
  const { data: agent } = await require('./supabase').getSupabaseClient()
    .then(s => s.from('agents').select('*').eq('id', agentId).single());
  
  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }
  
  const { data: convs } = await require('./supabase').getSupabaseClient()
    .then(s => s.from('conversation_participants')
      .select('conversation_id')
      .eq('participant_type', 'agent')
      .eq('participant_id', agentId));
  
  if (!convs || convs.length === 0) {
    throw new Error(`No conversation found for agent: ${agentId}`);
  }
  
  const conversationId = convs[0].conversation_id;
  
  await sendMessage(conversationId, agentId, 'agent', prompt, payload);
  
  const response = await waitForNextMessage(conversationId, 'human', 600000);
  
  return {
    ok: true,
    data: {
      contents: [
        { type: 'text', text: response.content },
      ],
      message_id: response.id,
      payload: response.payload,
    },
  };
}

async function handlePause(agentId, prompt = 'Continue?') {
  const payload = {
    type: 'confirm',
    text: prompt,
    variant: 'pause',
    confirm_label: 'Continue',
    cancel_label: 'Cancel',
  };
  
  return handleSend(agentId, prompt, payload);
}

async function handleCue(agentId, prompt, payload = null) {
  return handleSend(agentId, prompt, payload);
}

module.exports = {
  handleLogin,
  handleLogout,
  handleWhoami,
  handleJoin,
  handleSend,
  handlePause,
  handleCue,
};
