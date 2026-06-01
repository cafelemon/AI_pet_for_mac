#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REACTION_TO_STATE = {
  idle: 'idle',
  reset: 'idle',
  thinking: 'thinking',
  editing: 'coding',
  coding: 'coding',
  waiting: 'reminder',
  success: 'success',
  error: 'error'
};

const AGENT_STATUS_TO_STATE = {
  idle: 'idle',
  working: 'coding',
  testing: 'thinking',
  waiting_auth: 'waiting_auth',
  blocked: 'error',
  done: 'success'
};

function validateMessage(value, maxChars = 80) {
  if (typeof value !== 'string') return false;
  const message = value.trim().replace(/\s+/g, ' ');
  if (!message || message.length > maxChars) return false;
  if (value.split(/\r?\n/).length > 2) return false;
  if (/\b(?:https?:\/\/|www\.)\S+/i.test(message)) return false;
  if (/(?:^|\s)(?:~\/|\/(?:Users|private|var|tmp|etc|opt|home|Volumes)\b|[A-Za-z]:\\)/.test(message)) return false;
  if (/(?:api[_-]?key|secret|token|password|passwd|bearer|sk-[A-Za-z0-9_-]{16,}|xox[baprs]-[A-Za-z0-9-]{10,})/i.test(message)) return false;
  if (/\b(?:at\s+\S+\s+\(|Traceback \(most recent call last\)|File ".+", line \d+)/.test(message)) return false;
  if (/```|;\s*(?:rm|git|npm|python|node|curl)\b|(?:function|const|let|var|class)\s+\w+/.test(message)) return false;
  return true;
}

function assertValidator() {
  assert.equal(validateMessage('我在看结果'), true);
  assert.equal(validateMessage('Working on the plan'), true);
  assert.equal(validateMessage(''), false);
  assert.equal(validateMessage('https://example.com'), false);
  assert.equal(validateMessage('/Users/example/secret.txt'), false);
  assert.equal(validateMessage('api_key=sk-1234567890abcdefghijkl'), false);
  assert.equal(validateMessage('```\nconst x = 1\n```'), false);
  assert.equal(validateMessage('at run (/Users/a/app.js:1:1)'), false);
  assert.equal(validateMessage('line1\nline2\nline3'), false);
}

function assertReactions() {
  assert.equal(REACTION_TO_STATE.thinking, 'thinking');
  assert.equal(REACTION_TO_STATE.editing, 'coding');
  assert.equal(REACTION_TO_STATE.coding, 'coding');
  assert.equal(REACTION_TO_STATE.waiting, 'reminder');
  assert.equal(REACTION_TO_STATE.success, 'success');
  assert.equal(REACTION_TO_STATE.error, 'error');
  assert.equal(REACTION_TO_STATE.reset, 'idle');
  assert.equal(REACTION_TO_STATE.unknown, undefined);
}

function assertAgentStatuses() {
  assert.equal(AGENT_STATUS_TO_STATE.working, 'coding');
  assert.equal(AGENT_STATUS_TO_STATE.testing, 'thinking');
  assert.equal(AGENT_STATUS_TO_STATE.waiting_auth, 'waiting_auth');
  assert.equal(AGENT_STATUS_TO_STATE.blocked, 'error');
  assert.equal(AGENT_STATUS_TO_STATE.done, 'success');
  assert.equal(AGENT_STATUS_TO_STATE.idle, 'idle');
  assert.equal(AGENT_STATUS_TO_STATE.unknown, undefined);
  assert.equal(validateMessage('正在处理任务'), true);
  assert.equal(validateMessage('secret token abc'), false);
  assert.equal(validateMessage('/Users/example/project'), false);
}

function assertConfirmations() {
  let confirmation = null;

  function requestConfirmation(input) {
    if (confirmation?.status === 'pending') {
      throw new Error('confirmation request already pending');
    }
    if (!validateMessage(input.title) || !validateMessage(input.message)) {
      throw new Error('invalid confirmation text');
    }
    confirmation = {
      requestId: 'confirm-contract',
      status: 'pending',
      title: input.title.trim(),
      message: input.message.trim()
    };
    return confirmation;
  }

  function cancelConfirmation() {
    if (!confirmation || confirmation.status !== 'pending') {
      throw new Error('no pending confirmation request');
    }
    confirmation = { ...confirmation, status: 'cancelled' };
    return confirmation;
  }

  assert.equal(requestConfirmation({ title: '需要确认', message: '允许继续执行吗？' }).status, 'pending');
  assert.throws(() => requestConfirmation({ title: '再次确认', message: '应该被拒绝' }), /already pending/);
  assert.equal(cancelConfirmation().status, 'cancelled');
  assert.equal(requestConfirmation({ title: 'Confirm', message: 'Safe short message' }).status, 'pending');
  confirmation = { ...confirmation, status: 'expired' };
  assert.equal(confirmation.status, 'expired');
  assert.throws(() => requestConfirmation({ title: 'https://example.com', message: 'unsafe' }), /invalid/);
  assert.throws(() => requestConfirmation({ title: '路径', message: '/Users/example/project' }), /invalid/);
  assert.throws(() => requestConfirmation({ title: '密钥', message: 'secret token abc' }), /invalid/);
  assert.throws(() => requestConfirmation({ title: '代码', message: '```\nconst x = 1\n```' }), /invalid/);
}

function assertContextAndActivity() {
  const profileCapabilitiesSummary = {
    profileId: 'guofeng_ai',
    stage: 'in_progress',
    ready: true,
    mcpLayers: ['L1_basic_remote_control', 'L2_agent_state_panel', 'L3_confirmation_flow', 'L4_readonly_context'],
    readyInteractions: ['mouse_hover_look', 'mouse_shy_loop', 'mouse_leave_back', 'drag_hold_lift'],
    missingSourceActions: ['click_head_happy', 'click_body_confused', 'drag_start_lift', 'drag_end_dizzy'],
    blockedByVideoActions: ['click_head_happy', 'click_body_confused', 'drag_start_lift', 'drag_end_dizzy'],
    confirmationEntry: 'control_center_temp',
    videoLedger: 'docs/10_video_supply_progress.md'
  };
  const contextSummary = {
    appVersion: '1.1.8',
    activeProfileId: 'guofeng_ai',
    profiles: [{ id: 'guofeng_ai', ready: true }],
    profileCapabilitiesSummary,
    videoSupply: {
      ledger: 'docs/10_video_supply_progress.md',
      v12BlockedActions: ['click_head_happy', 'click_body_confused', 'drag_start_lift', 'drag_end_dizzy']
    }
  };
  const serialized = JSON.stringify(contextSummary);
  assert.equal(serialized.includes('token'), false);
  assert.equal(serialized.includes('socketPath'), false);
  assert.equal(serialized.includes('discoveryPath'), false);
  assert.equal(serialized.includes('/Users/'), false);
  assert.equal(profileCapabilitiesSummary.missingSourceActions.includes('click_head_happy'), true);
  assert.equal(profileCapabilitiesSummary.readyInteractions.includes('mouse_shy_loop'), true);

  const activities = [];
  function activityList(input = {}) {
    const limit = input.limit ?? 20;
    if (!Number.isInteger(limit) || limit < 0 || limit > 50) {
      throw new Error('limit must be an integer between 0 and 50');
    }
    return activities.slice(-limit);
  }

  assert.deepEqual(activityList(), []);
  assert.deepEqual(activityList({ limit: 0 }), []);
  assert.throws(() => activityList({ limit: 51 }), /limit/);
  assert.throws(() => activityList({ limit: -1 }), /limit/);
  assert.throws(() => activityList({ limit: 1.5 }), /limit/);

  activities.push({ type: 'say', summary: '我在看结果' });
  activities.push({ type: 'agent_state', summary: 'agent working' });
  assert.deepEqual(activityList({ limit: 1 }).map((entry) => entry.type), ['agent_state']);
}

function assertProfileCapabilities() {
  const guofengCapabilities = JSON.parse(readFileSync('data/profiles/guofeng_ai/profile_manifest.config.json', 'utf8'));
  const legacyCapabilities = JSON.parse(readFileSync('data/profiles/legacy_real/profile_manifest.config.json', 'utf8'));

  assert.equal(guofengCapabilities.profileId, 'guofeng_ai');
  assert.equal(legacyCapabilities.profileId, 'legacy_real');
  assert.equal(guofengCapabilities.capabilities.interactions.ready.includes('mouse_shy_loop'), true);
  assert.equal(guofengCapabilities.assets.missingSourceActions.includes('drag_start_lift'), true);
  assert.equal(guofengCapabilities.assets.blockedByVideoActions.includes('drag_end_dizzy'), true);
  assert.equal(legacyCapabilities.capabilities.interactions.ready.includes('mouse_shy_loop'), false);
  assert.equal(legacyCapabilities.assets.missingSourceActions.includes('click_head_happy'), false);

  const serialized = JSON.stringify({ guofengCapabilities, legacyCapabilities });
  assert.equal(serialized.includes('token'), false);
  assert.equal(serialized.includes('socketPath'), false);
  assert.equal(serialized.includes('discoveryPath'), false);
  assert.equal(serialized.includes('/Users/'), false);
}

async function assertMcpAdapter() {
  const tempDir = await mkdtemp(join(tmpdir(), 'companion-mcp-contract-'));
  const socketPath = join(tempDir, 'companion.sock');
  const discoveryPath = join(tempDir, 'companion.json');
  const token = 'contract-token';
  await writeFile(
    discoveryPath,
    JSON.stringify({ socketPath, token, transport: 'unix-socket', methods: ['companion.status'] }),
    'utf8'
  );

  const child = spawn(process.execPath, ['scripts/companion_mcp_server.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, COMPANION_DISCOVERY_PATH: discoveryPath, COMPANION_MCP_FAKE_RESULT: '1' },
    stdio: ['pipe', 'pipe', 'inherit']
  });
  let stdoutBuffer = '';

  function readJsonLine() {
    return new Promise((resolvePromise, rejectPromise) => {
      const tryRead = () => {
        const newlineIndex = stdoutBuffer.indexOf('\n');
        if (newlineIndex === -1) {
          return false;
        }
        const line = stdoutBuffer.slice(0, newlineIndex);
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        resolvePromise(JSON.parse(line));
        return true;
      };
      if (tryRead()) {
        return;
      }
      const onData = (chunk) => {
        stdoutBuffer += chunk.toString();
        if (tryRead()) {
          child.stdout.off('data', onData);
          child.off('exit', onExit);
        }
      };
      const onExit = () => {
        child.stdout.off('data', onData);
        rejectPromise(new Error('MCP adapter exited before writing a response.'));
      };
      child.stdout.on('data', onData);
      child.once('exit', onExit);
    });
  }

  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })}\n`);
  const tools = await readJsonLine();
  assert.equal(tools.result.tools.some((tool) => tool.name === 'companion_status'), true);
  assert.equal(tools.result.tools.some((tool) => tool.name === 'companion_agent_set_state'), true);
  assert.equal(tools.result.tools.some((tool) => tool.name === 'companion_agent_get_state'), true);
  assert.equal(tools.result.tools.some((tool) => tool.name === 'companion_agent_clear_state'), true);
  assert.equal(tools.result.tools.some((tool) => tool.name === 'companion_confirm_request'), true);
  assert.equal(tools.result.tools.some((tool) => tool.name === 'companion_confirm_get'), true);
  assert.equal(tools.result.tools.some((tool) => tool.name === 'companion_confirm_cancel'), true);
  assert.equal(tools.result.tools.some((tool) => tool.name === 'companion_context_summary'), true);
  assert.equal(tools.result.tools.some((tool) => tool.name === 'companion_activity_list'), true);
  assert.equal(tools.result.tools.some((tool) => tool.name === 'companion_profile_capabilities'), true);

  child.stdin.write(
    `${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'companion_status', arguments: {} } })}\n`
  );
  const call = await readJsonLine();
  assert.equal(call.result.content[0].type, 'text');
  assert.match(call.result.content[0].text, /companion\.status/);

  child.stdin.write(
    `${JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'companion_agent_set_state', arguments: { status: 'working', message: '正在处理任务', ttlMs: 3000 } } })}\n`
  );
  const setStateCall = await readJsonLine();
  assert.match(setStateCall.result.content[0].text, /companion\.agent\.set_state/);
  assert.match(setStateCall.result.content[0].text, /working/);

  child.stdin.write(
    `${JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'companion_agent_get_state', arguments: {} } })}\n`
  );
  const getStateCall = await readJsonLine();
  assert.match(getStateCall.result.content[0].text, /companion\.agent\.get_state/);

  child.stdin.write(
    `${JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'companion_agent_clear_state', arguments: {} } })}\n`
  );
  const clearStateCall = await readJsonLine();
  assert.match(clearStateCall.result.content[0].text, /companion\.agent\.clear_state/);

  child.stdin.write(
    `${JSON.stringify({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'companion_confirm_request', arguments: { title: '需要确认', message: '允许继续执行吗？', ttlMs: 60000 } } })}\n`
  );
  const confirmRequestCall = await readJsonLine();
  assert.match(confirmRequestCall.result.content[0].text, /companion\.confirm\.request/);
  assert.match(confirmRequestCall.result.content[0].text, /需要确认/);

  child.stdin.write(
    `${JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'companion_confirm_get', arguments: {} } })}\n`
  );
  const confirmGetCall = await readJsonLine();
  assert.match(confirmGetCall.result.content[0].text, /companion\.confirm\.get/);

  child.stdin.write(
    `${JSON.stringify({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'companion_confirm_cancel', arguments: {} } })}\n`
  );
  const confirmCancelCall = await readJsonLine();
  assert.match(confirmCancelCall.result.content[0].text, /companion\.confirm\.cancel/);

  child.stdin.write(
    `${JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'companion_context_summary', arguments: {} } })}\n`
  );
  const contextSummaryCall = await readJsonLine();
  assert.match(contextSummaryCall.result.content[0].text, /companion\.context\.summary/);

  child.stdin.write(
    `${JSON.stringify({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'companion_activity_list', arguments: { limit: 5 } } })}\n`
  );
  const activityListCall = await readJsonLine();
  assert.match(activityListCall.result.content[0].text, /companion\.activity\.list/);
  assert.match(activityListCall.result.content[0].text, /"limit": 5/);

  child.stdin.write(
    `${JSON.stringify({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'companion_profile_capabilities', arguments: { profileId: 'guofeng_ai' } } })}\n`
  );
  const profileCapabilitiesCall = await readJsonLine();
  assert.match(profileCapabilitiesCall.result.content[0].text, /companion\.profile\.capabilities/);
  assert.match(profileCapabilitiesCall.result.content[0].text, /guofeng_ai/);

  child.kill();
  await rm(tempDir, { recursive: true, force: true });
}

assertValidator();
assertReactions();
assertAgentStatuses();
assertConfirmations();
assertContextAndActivity();
assertProfileCapabilities();
await assertMcpAdapter();
console.log('Agent protocol contract checks passed.');
