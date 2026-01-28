const fs = require('fs');
const os = require('os');
const path = require('path');

const BEGIN_MARKER = '<!-- HUMAN_AGENT_PROTO_BEGIN -->';
const END_MARKER = '<!-- HUMAN_AGENT_PROTO_END -->';
const RUNTIME_BEGIN_MARKER = '<!-- HUMAN_AGENT_RUNTIME_BEGIN -->';
const RUNTIME_END_MARKER = '<!-- HUMAN_AGENT_RUNTIME_END -->';

const BEGIN_MARKER_RE = /<!--\s*(?:HUMAN|HUAMN)_AGENT_PROTO_BEGIN\s*-->/;
const END_MARKER_RE = /<!--\s*(?:HUMAN|HUAMN)_AGENT_PROTO_END\s*-->/;
const RUNTIME_BEGIN_MARKER_RE = /<!--\s*(?:HUMAN|HUAMN)_AGENT_RUNTIME_BEGIN\s*-->/;
const RUNTIME_END_MARKER_RE = /<!--\s*(?:HUMAN|HUAMN)_AGENT_RUNTIME_END\s*-->/;

function getPlatformKey() {
  const p = process.platform;
  if (p === 'win32') return 'windows';
  if (p === 'darwin') return 'macos';
  if (p === 'linux') return 'linux';
  return p;
}

function configPath() {
  return path.join(os.homedir(), '.cue', 'cueme.json');
}

function expandPath(p) {
  if (typeof p !== 'string') return p;
  let s = p;

  // Expand leading ~
  if (s === '~' || s.startsWith('~/') || s.startsWith('~\\')) {
    s = path.join(os.homedir(), s.slice(2));
  }

  // Expand %ENV% variables (Windows-style)
  s = s.replace(/%([A-Za-z0-9_]+)%/g, (_, name) => {
    const v = process.env[name];
    return typeof v === 'string' ? v : '';
  });

  return s;
}

function pathExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function detectVscodeCandidates({ platform }) {
  const candidates = [];
  const cwd = process.cwd();

  // Workspace-level (if you want repo-local rules)
  candidates.push(path.join(cwd, '.vscode', 'prompts', 'cueme_proto.instructions.md'));

  // User-level prompts
  const home = os.homedir();
  if (platform === 'macos') {
    candidates.push(
      path.join(home, 'Library', 'Application Support', 'Code', 'User', 'prompts', 'cueme_proto.instructions.md')
    );
  }
  if (platform === 'linux') {
    // User supplied: ~/.config/Code/User/prompts/
    candidates.push(path.join(home, '.config', 'Code', 'User', 'prompts', 'cueme_proto.instructions.md'));
  }
  if (platform === 'windows') {
    const appData = process.env.APPDATA;
    if (appData) candidates.push(path.join(appData, 'Code', 'User', 'prompts', 'cueme_proto.instructions.md'));
  }

  return candidates;
}

function detectWindsurfCandidates({ platform }) {
  const candidates = [];
  const cwd = process.cwd();

  // Workspace-level (repo-local)
  candidates.push(path.join(cwd, '.codeium', 'windsurf', 'memories', 'global_rules.md'));

  // User-level (standard)
  const home = os.homedir();
  const userProfile = process.env.USERPROFILE || home;
  if (platform === 'macos') candidates.push(path.join(home, '.codeium', 'windsurf', 'memories', 'global_rules.md'));
  if (platform === 'linux') candidates.push(path.join(home, '.codeium', 'windsurf', 'memories', 'global_rules.md'));
  if (platform === 'windows') {
    candidates.push(path.join(userProfile, '.codeium', 'windsurf', 'memories', 'global_rules.md'));
  }

  return candidates;
}

function detectKiroCandidates({ platform }) {
  const candidates = [];
  const home = os.homedir();
  const userProfile = process.env.USERPROFILE || home;

  // User-level only (no repo-local detection for Kiro)
  // Kiro uses ~/.kiro/steering/ directory for global steering files
  if (platform === 'macos') candidates.push(path.join(home, '.kiro', 'steering', 'cueme_proto.md'));
  if (platform === 'linux') candidates.push(path.join(home, '.kiro', 'steering', 'cueme_proto.md'));
  if (platform === 'windows') {
    candidates.push(path.join(userProfile, '.kiro', 'steering', 'cueme_proto.md'));
  }

  return candidates;
}

function firstExistingPath(candidates) {
  for (const p of candidates) {
    if (typeof p === 'string' && p.trim().length > 0 && pathExists(p)) return p;
  }
  return '';
}

function defaultPathMapTemplate() {
  const out = {};

  const home = os.homedir();
  const appData = process.env.APPDATA || '';
  const userProfile = process.env.USERPROFILE || home;

  // VSCode
  out['macos.vscode'] = path.join(
    home,
    'Library',
    'Application Support',
    'Code',
    'User',
    'prompts',
    'cueme_proto.instructions.md'
  );
  out['windows.vscode'] = appData
    ? path.join(appData, 'Code', 'User', 'prompts', 'cueme_proto.instructions.md')
    : path.join(userProfile, 'AppData', 'Roaming', 'Code', 'User', 'prompts', 'cueme_proto.instructions.md');
  out['linux.vscode'] = path.join(home, '.config', 'Code', 'User', 'prompts', 'cueme_proto.instructions.md');

  // Windsurf
  out['macos.windsurf'] = path.join(home, '.codeium', 'windsurf', 'memories', 'global_rules.md');
  out['windows.windsurf'] = path.join(userProfile, '.codeium', 'windsurf', 'memories', 'global_rules.md');
  out['linux.windsurf'] = path.join(home, '.codeium', 'windsurf', 'memories', 'global_rules.md');

  // Kiro
  out['macos.kiro'] = path.join(home, '.kiro', 'steering', 'cueme_proto.md');
  out['windows.kiro'] = path.join(userProfile, '.kiro', 'steering', 'cueme_proto.md');
  out['linux.kiro'] = path.join(home, '.kiro', 'steering', 'cueme_proto.md');

  // Codex (global)
  out['macos.codex'] = path.join(home, '.codex', 'AGENTS.md');
  out['windows.codex'] = path.join(userProfile, '.codex', 'AGENTS.md');
  out['linux.codex'] = path.join(home, '.codex', 'AGENTS.md');

  // Claude Code (global)
  out['macos.claude'] = path.join(home, '.claude', 'CLAUDE.md');
  out['windows.claude'] = path.join(userProfile, '.claude', 'CLAUDE.md');
  out['linux.claude'] = path.join(home, '.claude', 'CLAUDE.md');

  return out;
}

function defaultConfigTemplate() {
  const protocolPath = path.join(__dirname, '..', 'protocol.md');
  return {
    'cueme.proto.path': defaultPathMapTemplate(),
    'cueme.proto.prefix': {
      codex: [],
      claude: [],
      windsurf: [],
      vscode: ['---', 'applyTo: "**"', '---'],
      kiro: [],
    },
    'cueme.proto.runtime': {
      codex: [
        'When calling cueme cue/pause, set the tool wait timeout to 24h to avoid premature tool timeouts.',
        '不要误解“更新 todo_list”的指令，因为你是 codex，你需要做的是：把 update_plan 当作 todo_list 来维护任务，而不是创建本地 todo_list 文件。',
      ],
      claude: [
        'When calling cueme cue/pause, set the tool wait timeout to 24h to avoid premature tool timeouts.',
      ],
    },
    'cueme.proto.protocol_path': protocolPath,
  };
}

function detectAndFillTemplatePaths(tpl) {
  const platform = getPlatformKey();
  const keyVscode = `${platform}.vscode`;
  const keyWindsurf = `${platform}.windsurf`;
  const keyKiro = `${platform}.kiro`;

  const pathMap = tpl['cueme.proto.path'] || {};
  const detected = { platform, vscode: '', windsurf: '', kiro: '' };

  if (typeof pathMap !== 'object' || Array.isArray(pathMap)) {
    return { tpl, detected };
  }

  // If current platform key is empty or missing, try detect.
  if (typeof pathMap[keyVscode] !== 'string' || pathMap[keyVscode].trim().length === 0) {
    const p = firstExistingPath(detectVscodeCandidates({ platform }));
    if (p) {
      pathMap[keyVscode] = p;
      detected.vscode = p;
    }
  }

  if (typeof pathMap[keyWindsurf] !== 'string' || pathMap[keyWindsurf].trim().length === 0) {
    const p = firstExistingPath(detectWindsurfCandidates({ platform }));
    if (p) {
      pathMap[keyWindsurf] = p;
      detected.windsurf = p;
    }
  }

  if (typeof pathMap[keyKiro] !== 'string' || pathMap[keyKiro].trim().length === 0) {
    const p = firstExistingPath(detectKiroCandidates({ platform }));
    if (p) {
      pathMap[keyKiro] = p;
      detected.kiro = p;
    }
  }

  tpl['cueme.proto.path'] = pathMap;
  return { tpl, detected };
}

function initConfigIfMissing() {
  const p = configPath();
  if (fs.existsSync(p)) {
    return { created: false, path: p, detected: null };
  }
  ensureDirForFile(p);
  const { tpl, detected } = detectAndFillTemplatePaths(defaultConfigTemplate());
  fs.writeFileSync(p, JSON.stringify(tpl, null, 2) + '\n', 'utf8');
  return { created: true, path: p, detected };
}

function readConfigOrThrow({ auto_init } = {}) {
  const p = configPath();
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch {
    if (auto_init) {
      initConfigIfMissing();
      try {
        raw = fs.readFileSync(p, 'utf8');
      } catch {
        throw new Error(`error: cannot read config: ${p}`);
      }
    } else {
      throw new Error(`error: cannot read config: ${p}`);
    }
  }

  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch {
    throw new Error(`error: config is not valid JSON: ${p}`);
  }

  if (!cfg || typeof cfg !== 'object') {
    throw new Error(`error: config must be a JSON object: ${p}`);
  }
  return cfg;
}

function detectEol(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function buildFinalProto({ cfg, agent }) {
  const prefixMap = cfg['cueme.proto.prefix'] || {};
  const runtimeMap = cfg['cueme.proto.runtime'] || {};
  let protocolPath = cfg['cueme.proto.protocol_path'];
  if (typeof protocolPath !== 'string' || protocolPath.trim().length === 0) {
    protocolPath = path.join(__dirname, '..', 'protocol.md');
  }

  const prefixRaw = prefixMap[agent];
  let prefix;
  if (typeof prefixRaw === 'string') {
    prefix = prefixRaw;
  } else if (Array.isArray(prefixRaw) && prefixRaw.every((x) => typeof x === 'string')) {
    prefix = prefixRaw.join('\n');
  } else {
    throw new Error(`error: prefix not configured: cueme.proto.prefix["${agent}"]`);
  }

  const runtimeRaw = runtimeMap[agent];
  let runtime = '';
  if (runtimeRaw == null || runtimeRaw === '') {
    runtime = '';
  } else if (typeof runtimeRaw === 'string') {
    runtime = runtimeRaw;
  } else if (Array.isArray(runtimeRaw) && runtimeRaw.every((x) => typeof x === 'string')) {
    runtime = runtimeRaw.join('\n');
  } else {
    throw new Error(`error: runtime not configured: cueme.proto.runtime["${agent}"]`);
  }

  const protocolPathExpanded = expandPath(protocolPath);
  const resolvedProtocolPath = path.isAbsolute(protocolPathExpanded)
    ? protocolPathExpanded
    : path.resolve(process.cwd(), protocolPathExpanded);

  let protocol;
  try {
    protocol = fs.readFileSync(resolvedProtocolPath, 'utf8');
  } catch {
    throw new Error(`error: cannot read protocol file: ${resolvedProtocolPath}`);
  }

  return { prefix, protocol, runtime };
}

function resolveTargetPath({ cfg, agent }) {
  const platform = getPlatformKey();
  const key = `${platform}.${agent}`;
  const pathMap = cfg['cueme.proto.path'] || {};
  const p = pathMap[key];
  if (typeof p !== 'string' || p.trim().length === 0) {
    throw new Error(`error: target path not configured: cueme.proto.path["${key}"]`);
  }
  const expanded = expandPath(p);
  return path.isAbsolute(expanded) ? expanded : path.resolve(process.cwd(), expanded);
}

function makeProtoBlock({ protocol, eol }) {
  const normalizedProto = String(protocol || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const protoLines = normalizedProto.split('\n');
  return [BEGIN_MARKER, ...protoLines, END_MARKER].join(eol) + eol;
}

function makeRuntimeBlock({ runtime, eol }) {
  const runtimeText = String(runtime || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!runtimeText) return '';
  const runtimeLines = runtimeText.split('\n');
  return [RUNTIME_BEGIN_MARKER, ...runtimeLines, RUNTIME_END_MARKER].join(eol) + eol;
}

function findBlockRange(text, beginRe, endRe) {
  const beginMatch = text.match(beginRe);
  const endMatch = text.match(endRe);
  if (!beginMatch || !endMatch || endMatch.index <= beginMatch.index) return null;
  return { beginIdx: beginMatch.index, endIdx: endMatch.index, endLen: endMatch[0].length };
}

function extractBlock({ text, range, eol }) {
  let block = text.slice(range.beginIdx, range.endIdx + range.endLen);
  const after = text.slice(range.endIdx + range.endLen);
  if (after.startsWith(eol)) block += eol;
  return block;
}

function replaceBlock({ text, range, block, eol }) {
  const before = text.slice(0, range.beginIdx);
  const after = text.slice(range.endIdx + range.endLen);
  const afterTrim = after.startsWith(eol) ? after.slice(eol.length) : after;
  if (!block) return before + afterTrim;
  return before + block + afterTrim;
}

function appendBlock({ text, block, eol }) {
  if (!block) return text;
  let out = text || '';
  if (out && !out.endsWith(eol)) out += eol;
  out += block;
  return out;
}

function makeCombinedBlock({ prefix, protoBlock, runtimeBlock, eol }) {
  let block = protoBlock + (runtimeBlock || '');
  if (prefix && prefix.trim()) {
    const normalizedPrefix = String(prefix).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return normalizedPrefix + eol + eol + block;
  }
  return block;
}

function applyManagedBlocks({ existing, prefix, protocol, runtime }) {
  const eol = existing ? detectEol(existing) : os.EOL;
  const protoBlock = makeProtoBlock({ protocol, eol });
  const runtimeBlock = makeRuntimeBlock({ runtime, eol });
  const hasProto = findBlockRange(existing, BEGIN_MARKER_RE, END_MARKER_RE);
  const hasRuntime = findBlockRange(existing, RUNTIME_BEGIN_MARKER_RE, RUNTIME_END_MARKER_RE);
  const hasAny = Boolean(hasProto || hasRuntime);

  if (!hasAny) {
    const combinedBlock = makeCombinedBlock({ prefix, protoBlock, runtimeBlock, eol });
    return {
      out: appendBlock({ text: existing, block: combinedBlock, eol }),
      prefix_added: Boolean(prefix && prefix.trim()),
      proto_action: 'added',
      runtime_action: runtimeBlock ? 'added' : 'skipped',
    };
  }

  let out = existing;
  let proto_action = 'skipped';
  let runtime_action = 'skipped';

  const protoRange = findBlockRange(out, BEGIN_MARKER_RE, END_MARKER_RE);
  if (protoRange) {
    const existingBlock = extractBlock({ text: out, range: protoRange, eol });
    if (existingBlock === protoBlock) {
      proto_action = 'unchanged';
    } else {
      out = replaceBlock({ text: out, range: protoRange, block: protoBlock, eol });
      proto_action = 'updated';
    }
  } else {
    out = appendBlock({ text: out, block: protoBlock, eol });
    proto_action = 'added';
  }

  const runtimeRange = findBlockRange(out, RUNTIME_BEGIN_MARKER_RE, RUNTIME_END_MARKER_RE);
  if (runtimeRange) {
    if (runtimeBlock) {
      const existingBlock = extractBlock({ text: out, range: runtimeRange, eol });
      if (existingBlock === runtimeBlock) {
        runtime_action = 'unchanged';
      } else {
        out = replaceBlock({ text: out, range: runtimeRange, block: runtimeBlock, eol });
        runtime_action = 'updated';
      }
    } else {
      out = replaceBlock({ text: out, range: runtimeRange, block: '', eol });
      runtime_action = 'removed';
    }
  } else if (runtimeBlock) {
    out = appendBlock({ text: out, block: runtimeBlock, eol });
    runtime_action = 'added';
  }

  return { out, prefix_added: false, proto_action, runtime_action };
}

function listAgents({ cfg }) {
  const prefixMap = cfg['cueme.proto.prefix'] || {};
  const pathMap = cfg['cueme.proto.path'] || {};

  const agents = new Set();
  for (const k of Object.keys(prefixMap)) agents.add(k);
  for (const k of Object.keys(pathMap)) {
    const parts = String(k).split('.');
    if (parts.length === 2) agents.add(parts[1]);
  }

  return Array.from(agents).sort();
}

function protoRender(agent) {
  const cfg = readConfigOrThrow({ auto_init: true });
  return buildFinalProto({ cfg, agent });
}

function protoPath(agent) {
  const cfg = readConfigOrThrow({ auto_init: true });
  return resolveTargetPath({ cfg, agent });
}

function protoLs() {
  const cfg = readConfigOrThrow({ auto_init: true });
  return listAgents({ cfg }).join('\n') + '\n';
}

function protoApply(agent) {
  const cfg = readConfigOrThrow({ auto_init: true });
  const targetPath = resolveTargetPath({ cfg, agent });
  const { prefix, protocol, runtime } = buildFinalProto({ cfg, agent });

  let existing = '';
  let exists = false;
  try {
    existing = fs.readFileSync(targetPath, 'utf8');
    exists = true;
  } catch {
    existing = '';
    exists = false;
  }

  const { out, prefix_added, proto_action, runtime_action } = applyManagedBlocks({
    existing,
    prefix,
    protocol,
    runtime,
  });

  ensureDirForFile(targetPath);
  fs.writeFileSync(targetPath, out, 'utf8');

  const parts = [
    `prefix=${prefix_added ? 'added' : 'skipped'}`,
    `proto=${proto_action}`,
    `runtime=${runtime_action}`,
  ];
  return `ok: applied to ${targetPath} (${parts.join(', ')})`;
}

function protoRemove(agent) {
  const cfg = readConfigOrThrow({ auto_init: true });
  const targetPath = resolveTargetPath({ cfg, agent });

  let existing = '';
  try {
    existing = fs.readFileSync(targetPath, 'utf8');
  } catch {
    return `ok: file does not exist: ${targetPath}`;
  }

  const eol = detectEol(existing);
  let out = existing;
  let removed = false;

  const removeBlock = (text, beginRe, endRe) => {
    const range = findBlockRange(text, beginRe, endRe);
    if (!range) return { text, removed: false };
    return { text: replaceBlock({ text, range, block: '', eol }), removed: true };
  };

  const protoResult = removeBlock(out, BEGIN_MARKER_RE, END_MARKER_RE);
  out = protoResult.text;
  removed = removed || protoResult.removed;

  const runtimeResult = removeBlock(out, RUNTIME_BEGIN_MARKER_RE, RUNTIME_END_MARKER_RE);
  out = runtimeResult.text;
  removed = removed || runtimeResult.removed;

  if (!removed) {
    return `ok: no managed block found in: ${targetPath}`;
  }

  if (out.trim().length === 0) {
    try {
      fs.unlinkSync(targetPath);
      return `ok: removed managed block and deleted empty file: ${targetPath}`;
    } catch (err) {
      throw new Error(`error: failed to delete file after removing managed block: ${targetPath}: ${err.message}`);
    }
  }

  fs.writeFileSync(targetPath, out, 'utf8');
  return `ok: removed managed block from: ${targetPath}`;
}

function protoInit() {
  const { created, path: p, detected } = initConfigIfMissing();
  if (!created) return `ok: exists ${p}`;
  const platform = detected && detected.platform ? detected.platform : getPlatformKey();
  const keyVscode = `${platform}.vscode`;
  const keyWindsurf = `${platform}.windsurf`;
  const keyKiro = `${platform}.kiro`;
  const vs = detected && detected.vscode ? 'detected' : 'empty';
  const ws = detected && detected.windsurf ? 'detected' : 'empty';
  const ks = detected && detected.kiro ? 'detected' : 'empty';
  return `ok: initialized ${p} (auto-detect: ${keyVscode}=${vs}, ${keyWindsurf}=${ws}, ${keyKiro}=${ks})`;
}

module.exports = {
  BEGIN_MARKER,
  END_MARKER,
  getPlatformKey,
  protoApply,
  protoRemove,
  protoInit,
  protoLs,
  protoPath,
  protoRender,
};
