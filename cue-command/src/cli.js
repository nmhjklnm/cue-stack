const { readAllStdin } = require('./io');
const { handleCommand } = require('./handler');
const { parseTagBlocksEnvelope } = require('./envelope');
const { protoApply, protoRemove, protoInit, protoLs, protoPath, protoRender } = require('./proto');
const pkg = require('../package.json');
const fs = require('fs');
const path = require('path');

async function parseStdinTagBlocksOrExit({ parsed, allow_payload }) {
  const raw = await readAllStdin();
  const env = parseTagBlocksEnvelope(raw, { allow_payload });
  if (!env.ok) {
    process.stderr.write(env.error);
    process.exitCode = 2;
    return false;
  }
  parsed.prompt = env.prompt;
  if (allow_payload !== false) {
    parsed.payload = env.payload == null ? null : JSON.stringify(env.payload);
  }
  return true;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { _: [] };
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next == null || next.startsWith('--')) {
        out[key] = true;
        i += 1;
      } else {
        out[key] = next;
        i += 2;
      }
      continue;
    }
    out._.push(a);
    i += 1;
  }
  return out;
}

function extractTextFromResult(result) {
  if (!result || typeof result !== 'object') return '';
  if (result.ok === false) return result.error ? String(result.error) : '';

  const data = result.data;
  if (!data || typeof data !== 'object') return '';

  const contents = Array.isArray(data.contents) ? data.contents : [];
  const textParts = [];
  for (const c of contents) {
    if (c && c.type === 'text' && typeof c.text === 'string' && c.text.length > 0) {
      textParts.push(c.text);
    }
  }
  if (textParts.length > 0) return textParts.join('');

  if (typeof data.message === 'string') return data.message;
  return '';
}

async function main() {
  const first = process.argv[2];
  if (first === '-v' || first === '--version') {
    process.stdout.write(String(pkg.version || '') + '\n');
    return;
  }

  if (first === '-p' || first === '--protocol') {
    const protocolPath = path.join(__dirname, '..', 'protocol.md');
    try {
      const content = fs.readFileSync(protocolPath, 'utf8');
      process.stdout.write(String(content || ''));
      if (!String(content || '').endsWith('\n')) process.stdout.write('\n');
    } catch {
      process.stderr.write('error: failed to read protocol.md\n');
      process.exitCode = 2;
    }
    return;
  }

  const parsed = parseArgs(process.argv);
  const sub = parsed._[0];
  const pos = parsed._.slice(1);

  if (!sub || sub === 'help' || sub === '-h' || sub === '--help') {
    process.stdout.write(
      [
        'cueme',
        '',
        'Usage:',
        '  cueme -v|--version',
        '  cueme -p|--protocol',
        '  cueme login',
        '  cueme logout',
        '  cueme whoami',
        '  cueme proto <agent>',
        '  cueme proto apply <agent>',
        '  cueme proto rm|remove <agent>',
        '  cueme proto init',
        '  cueme proto ls',
        '  cueme proto path <agent>',
        '  cueme fix <issue>',
        '  cueme migrate',
        '  cueme join <agent_runtime>',
        '  cueme cue <agent_id> -',
        '  cueme pause <agent_id> [prompt|-]',
        '',
        'Cue stdin envelope (tag blocks; tags must be alone on their line):',
        '  <cueme_prompt>',
        '  ...raw prompt text...',
        '  </cueme_prompt>',
        '  <cueme_payload>',
        '  ...JSON object or null...',
        '  </cueme_payload>',
        '',
        'Pause stdin envelope (tag blocks; tags must be alone on their line):',
        '  <cueme_prompt>',
        '  ...raw prompt text...',
        '  </cueme_prompt>',
        '',
        'Output:',
        '  - join/cue/pause: plain text (stdout)',
      ].join('\n') + '\n'
    );
    return;
  }

  if (parsed.timeout != null) {
    process.stderr.write('error: --timeout is not supported (fixed to 10 minutes)\n');
    process.exitCode = 2;
    return;
  }

  if (parsed.agent_id != null || parsed.prompt != null) {
    process.stderr.write('error: --agent_id/--prompt flags are not supported; use positional args\n');
    process.exitCode = 2;
    return;
  }

  if (sub === 'fix') {
    const issue = pos[0];
    if (!issue) {
      process.stderr.write('error: missing <issue>\n');
      process.stderr.write('Available fixes:\n');
      process.stderr.write('  powershell_utf-8  Fix PowerShell encoding for Chinese characters\n');
      process.exitCode = 2;
      return;
    }
    
    if (issue === 'powershell_utf-8') {
      if (process.platform !== 'win32') {
        process.stderr.write('This fix is only for Windows PowerShell\n');
        process.exitCode = 1;
        return;
      }
      
      const { execSync } = require('child_process');
      const os = require('os');
      const path = require('path');
      const fs = require('fs');
      
      try {
        // Get PowerShell profile path
        const profilePath = path.join(
          os.homedir(),
          'Documents',
          'WindowsPowerShell',
          'Microsoft.PowerShell_profile.ps1'
        );
        
        const encodingConfig = [
          '$utf8NoBom = New-Object System.Text.UTF8Encoding($false)',
          '[Console]::InputEncoding  = $utf8NoBom',
          '[Console]::OutputEncoding = $utf8NoBom',
          '$OutputEncoding = $utf8NoBom',
        ].join('\n');
        
        // Ensure profile directory exists
        const profileDir = path.dirname(profilePath);
        if (!fs.existsSync(profileDir)) {
          fs.mkdirSync(profileDir, { recursive: true });
          process.stdout.write('Created PowerShell profile directory\n');
        }
        
        // Check if profile exists and if encoding is already configured
        let needsUpdate = true;
        if (fs.existsSync(profilePath)) {
          const content = fs.readFileSync(profilePath, 'utf8');
          if (content.includes('utf8NoBom')) {
            process.stdout.write('UTF-8 encoding already configured\n');
            needsUpdate = false;
          }
        } else {
          process.stdout.write('Created PowerShell profile\n');
        }
        
        // Add encoding configuration if needed
        if (needsUpdate) {
          fs.appendFileSync(profilePath, '\n' + encodingConfig + '\n');
          process.stdout.write('Added UTF-8 encoding to PowerShell profile\n');
          process.stdout.write('Please restart PowerShell for changes to take effect\n');
        }
        
      } catch (err) {
        process.stderr.write(`Failed to fix PowerShell encoding: ${err.message}\n`);
        process.exitCode = 1;
      }
      return;
    }
    
    process.stderr.write(`error: unknown issue: ${issue}\n`);
    process.stderr.write('Available fixes:\n');
    process.stderr.write('  powershell_utf-8  Fix PowerShell encoding for Chinese characters\n');
    process.exitCode = 2;
    return;
  }

  if (sub === 'login' || sub === 'logout' || sub === 'whoami') {
    const { handleLogin, handleLogout, handleWhoami } = require('./handler');
    try {
      let result;
      if (sub === 'login') {
        result = await handleLogin();
      } else if (sub === 'logout') {
        result = await handleLogout();
      } else {
        result = await handleWhoami();
      }
      
      if (result.ok) {
        process.stdout.write((result.data.message || JSON.stringify(result.data)) + '\n');
      } else {
        process.stderr.write((result.error || 'Command failed') + '\n');
        process.exitCode = 1;
      }
    } catch (err) {
      process.stderr.write(`error: ${err.message}\n`);
      process.exitCode = 1;
    }
    return;
  }

  if (sub === 'join') {
    const agentRuntime = pos[0];
    if (!agentRuntime) {
      process.stderr.write('error: missing <agent_runtime>\n');
      process.exitCode = 2;
      return;
    }
    parsed.agent_runtime = String(agentRuntime);
  }

  if (sub === 'proto') {
    const action = pos[0];
    try {
      if (!action) {
        process.stderr.write('error: missing <agent>\n');
        process.exitCode = 2;
        return;
      }

      if (action === 'ls') {
        process.stdout.write(protoLs());
        return;
      }

      if (action === 'init') {
        process.stdout.write(protoInit() + '\n');
        return;
      }

      if (action === 'apply') {
        const agent = pos[1];
        if (!agent) {
          process.stderr.write('error: missing <agent>\n');
          process.exitCode = 2;
          return;
        }
        process.stdout.write(protoApply(String(agent)) + '\n');
        return;
      }

      if (action === 'rm' || action === 'remove') {
        const agent = pos[1];
        if (!agent) {
          process.stderr.write('error: missing <agent>\n');
          process.exitCode = 2;
          return;
        }
        process.stdout.write(protoRemove(String(agent)) + '\n');
        return;
      }

      if (action === 'path') {
        const agent = pos[1];
        if (!agent) {
          process.stderr.write('error: missing <agent>\n');
          process.exitCode = 2;
          return;
        }
        process.stdout.write(protoPath(String(agent)) + '\n');
        return;
      }

      const agent = action;
      const rendered = protoRender(String(agent));
      process.stdout.write(rendered);
      if (!String(rendered || '').endsWith('\n')) process.stdout.write('\n');
      return;
    } catch (err) {
      process.stderr.write((err && err.message ? err.message : 'error: proto failed') + '\n');
      process.exitCode = 2;
      return;
    }
  }

  if (sub === 'cue') {
    const agentId = pos[0];
    if (!agentId) {
      process.stderr.write('error: missing <agent_id>\n');
      process.exitCode = 2;
      return;
    }

    if (parsed.payload != null) {
      process.stderr.write('error: --payload is not supported for cue. Use stdin tag-blocks envelope.\n');
      process.exitCode = 2;
      return;
    }

    parsed.agent_id = String(agentId);

    const promptPos = pos[1];
    if (promptPos !== '-') {
      process.stderr.write('error: cue requires stdin tag-blocks. Usage: cueme cue <agent_id> -\n');
      process.exitCode = 2;
      return;
    }

    if (pos.length > 2) {
      process.stderr.write('error: cue only accepts <agent_id> - and stdin tag-blocks envelope.\n');
      process.exitCode = 2;
      return;
    }

    const ok = await parseStdinTagBlocksOrExit({ parsed, allow_payload: true });
    if (!ok) return;
  }

  if (sub === 'pause') {
    const agentId = pos[0];
    if (!agentId) {
      process.stderr.write('error: missing <agent_id>\n');
      process.exitCode = 2;
      return;
    }

    if (parsed.payload != null) {
      process.stderr.write('error: --payload is not supported for pause. Use tag-blocks stdin or positional prompt.\n');
      process.exitCode = 2;
      return;
    }

    parsed.agent_id = String(agentId);

    const promptPos = pos[1];
    if (promptPos === '-') {
      if (pos.length > 2) {
        process.stderr.write('error: pause only accepts <agent_id> [prompt|-] (tag-blocks stdin when "-" is used).\n');
        process.exitCode = 2;
        return;
      }

      const ok = await parseStdinTagBlocksOrExit({ parsed, allow_payload: false });
      if (!ok) return;
    } else if (promptPos != null) {
      parsed.prompt = String(promptPos);
    }
  }

  if (sub === 'join' || sub === 'cue' || sub === 'pause') {
    const { handleJoin, handleCue, handlePause } = require('./handler');
    try {
      let result;
      if (sub === 'join') {
        result = await handleJoin(parsed.agent_runtime);
      } else if (sub === 'cue') {
        result = await handleCue(parsed.agent_id, parsed.prompt, parsed.payload ? JSON.parse(parsed.payload) : null);
      } else if (sub === 'pause') {
        result = await handlePause(parsed.agent_id, parsed.prompt || 'Continue?');
      }
      
      if (result.ok) {
        process.stdout.write(extractTextFromResult(result) + '\n');
      } else {
        process.stderr.write((result.error || 'Command failed') + '\n');
        process.exitCode = 1;
      }
    } catch (err) {
      process.stderr.write(`error: ${err.message}\n`);
      process.exitCode = 1;
    }
    return;
  }

  const result = await handleCommand({ subcommand: sub, args: parsed });
  process.stdout.write(extractTextFromResult(result) + '\n');
}

module.exports = { main };
