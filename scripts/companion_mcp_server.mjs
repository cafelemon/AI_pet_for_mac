#!/usr/bin/env node
import { createConnection } from 'node:net';
import { homedir } from 'node:os';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import readline from 'node:readline';

const DEFAULT_DISCOVERY_PATH = '~/.desktop-ai-companion/discovery/companion.json';
const TOOL_DEFINITIONS = [
  {
    name: 'companion_status',
    description: 'Read Desktop AI Companion status, active profile, and available protocol methods.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'companion_react',
    description: 'Trigger a safe companion reaction such as thinking, coding, waiting, success, error, or idle.',
    inputSchema: {
      type: 'object',
      properties: {
        reaction: { type: 'string' },
        ttlMs: { type: 'number' }
      },
      required: ['reaction'],
      additionalProperties: false
    }
  },
  {
    name: 'companion_say',
    description: 'Show a short safe companion bubble message, optionally with a reaction.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        reaction: { type: 'string' },
        ttlMs: { type: 'number' }
      },
      required: ['message'],
      additionalProperties: false
    }
  },
  {
    name: 'companion_agent_set_state',
    description: 'Set the semantic agent status shown by Desktop AI Companion, such as working, testing, waiting_auth, blocked, done, or idle.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        message: { type: 'string' },
        ttlMs: { type: 'number' }
      },
      required: ['status'],
      additionalProperties: false
    }
  },
  {
    name: 'companion_agent_get_state',
    description: 'Read the current semantic agent state shown by Desktop AI Companion.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'companion_agent_clear_state',
    description: 'Clear the current semantic agent state without waiting for cooldown.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'companion_confirm_request',
    description: 'Request a local user confirmation through Desktop AI Companion.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        message: { type: 'string' },
        ttlMs: { type: 'number' }
      },
      required: ['title', 'message'],
      additionalProperties: false
    }
  },
  {
    name: 'companion_confirm_get',
    description: 'Read the current or latest Desktop AI Companion confirmation result.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'companion_confirm_cancel',
    description: 'Cancel the pending Desktop AI Companion confirmation request.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'companion_context_summary',
    description: 'Read a safe summary of Desktop AI Companion profile, agent, confirmation, Codex, and video supply state.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'companion_activity_list',
    description: 'Read recent in-memory Desktop AI Companion activity entries.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'companion_permissions_summary',
    description: 'Read Desktop AI Companion MCP permission policy groups, blocked methods, and confirmation requirements.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'companion_plugins_summary',
    description: 'Read the safe Desktop AI Companion declarative plugin runtime summary.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'companion_profile_list',
    description: 'List available Desktop AI Companion pet profiles and readiness.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'companion_profile_capabilities',
    description: 'Read a safe profile capability manifest for the active or requested Desktop AI Companion profile.',
    inputSchema: {
      type: 'object',
      properties: {
        profileId: { type: 'string' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'companion_profile_select',
    description: 'Select a ready Desktop AI Companion pet profile.',
    inputSchema: {
      type: 'object',
      properties: {
        profileId: { type: 'string' }
      },
      required: ['profileId'],
      additionalProperties: false
    }
  }
];

const TOOL_METHODS = {
  companion_status: 'companion.status',
  companion_react: 'companion.react',
  companion_say: 'companion.say',
  companion_agent_set_state: 'companion.agent.set_state',
  companion_agent_get_state: 'companion.agent.get_state',
  companion_agent_clear_state: 'companion.agent.clear_state',
  companion_confirm_request: 'companion.confirm.request',
  companion_confirm_get: 'companion.confirm.get',
  companion_confirm_cancel: 'companion.confirm.cancel',
  companion_context_summary: 'companion.context.summary',
  companion_activity_list: 'companion.activity.list',
  companion_permissions_summary: 'companion.permissions.summary',
  companion_plugins_summary: 'companion.plugins.summary',
  companion_profile_list: 'companion.profile.list',
  companion_profile_capabilities: 'companion.profile.capabilities',
  companion_profile_select: 'companion.profile.select'
};

function expandPath(path) {
  if (path === '~') {
    return homedir();
  }
  if (path.startsWith('~/')) {
    return join(homedir(), path.slice(2));
  }
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

async function readDiscovery() {
  const discoveryPath = expandPath(process.env.COMPANION_DISCOVERY_PATH || DEFAULT_DISCOVERY_PATH);
  return JSON.parse(await readFile(discoveryPath, 'utf8'));
}

function callCompanion(discovery, method, params = {}) {
  if (process.env.COMPANION_MCP_FAKE_RESULT === '1') {
    return Promise.resolve({ method, params, discoveryTransport: discovery.transport });
  }

  return new Promise((resolvePromise, rejectPromise) => {
    const socket = createConnection(discovery.socketPath);
    let buffer = '';
    const request = {
      id: `mcp-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      token: discovery.token,
      method,
      params
    };

    socket.setEncoding('utf8');
    socket.on('connect', () => {
      socket.write(`${JSON.stringify(request)}\n`);
    });
    socket.on('data', (chunk) => {
      buffer += chunk;
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex === -1) {
        return;
      }
      const line = buffer.slice(0, newlineIndex).trim();
      socket.end();
      try {
        const response = JSON.parse(line);
        if (response.ok) {
          resolvePromise(response.result);
        } else {
          rejectPromise(new Error(response.error || 'companion request failed'));
        }
      } catch (error) {
        rejectPromise(error);
      }
    });
    socket.on('error', rejectPromise);
  });
}

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function toolContent(result) {
  return {
    content: [
      {
        type: 'text',
        text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
      }
    ]
  };
}

async function handleJsonRpc(message) {
  if (message.method === 'initialize') {
    return jsonRpcResult(message.id, {
      protocolVersion: message.params?.protocolVersion || '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'desktop-ai-companion', version: '1.4.0' }
    });
  }
  if (message.method === 'tools/list') {
    return jsonRpcResult(message.id, { tools: TOOL_DEFINITIONS });
  }
  if (message.method === 'tools/call') {
    const toolName = message.params?.name;
    const method = TOOL_METHODS[toolName];
    if (!method) {
      return jsonRpcError(message.id, -32602, `Unknown tool: ${toolName}`);
    }
    const discovery = await readDiscovery();
    const result = await callCompanion(discovery, method, message.params?.arguments || {});
    return jsonRpcResult(message.id, toolContent(result));
  }
  if (message.id === undefined) {
    return null;
  }
  return jsonRpcError(message.id, -32601, `Unknown method: ${message.method}`);
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }

  void (async () => {
    try {
      const response = await handleJsonRpc(JSON.parse(trimmed));
      if (response) {
        process.stdout.write(`${JSON.stringify(response)}\n`);
      }
    } catch (error) {
      const id = (() => {
        try {
          return JSON.parse(trimmed).id ?? null;
        } catch {
          return null;
        }
      })();
      process.stdout.write(`${JSON.stringify(jsonRpcError(id, -32000, error instanceof Error ? error.message : 'request failed'))}\n`);
    }
  })();
});
