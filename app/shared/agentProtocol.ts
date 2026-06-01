import type { CompanionState } from './types';

export const COMPANION_PROTOCOL_VERSION = 1;
export const COMPANION_PROTOCOL_METHODS = [
  'companion.status',
  'companion.react',
  'companion.say',
  'companion.agent.set_state',
  'companion.agent.get_state',
  'companion.agent.clear_state',
  'companion.confirm.request',
  'companion.confirm.get',
  'companion.confirm.cancel',
  'companion.context.summary',
  'companion.activity.list',
  'companion.profile.list',
  'companion.profile.capabilities',
  'companion.profile.select'
] as const;

export type CompanionProtocolMethod = (typeof COMPANION_PROTOCOL_METHODS)[number];

export type AgentReaction = 'idle' | 'reset' | 'thinking' | 'editing' | 'coding' | 'waiting' | 'success' | 'error';
export type AgentSemanticStatus = 'idle' | 'working' | 'testing' | 'waiting_auth' | 'blocked' | 'done';

export const AGENT_REACTION_TO_STATE: Record<AgentReaction, CompanionState> = {
  idle: 'idle',
  reset: 'idle',
  thinking: 'thinking',
  editing: 'coding',
  coding: 'coding',
  waiting: 'reminder',
  success: 'success',
  error: 'error'
};

export const AGENT_STATUS_TO_STATE: Record<AgentSemanticStatus, CompanionState> = {
  idle: 'idle',
  working: 'coding',
  testing: 'thinking',
  waiting_auth: 'waiting_auth',
  blocked: 'error',
  done: 'success'
};

export interface MessageValidationOptions {
  maxChars: number;
}

export interface MessageValidationResult {
  ok: boolean;
  message?: string;
  error?: string;
}

const SECRET_PATTERN =
  /(?:api[_-]?key|secret|token|password|passwd|bearer|sk-[A-Za-z0-9_-]{16,}|xox[baprs]-[A-Za-z0-9-]{10,})/i;
const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/i;
const ABSOLUTE_PATH_PATTERN = /(?:^|\s)(?:~\/|\/(?:Users|private|var|tmp|etc|opt|home|Volumes)\b|[A-Za-z]:\\)/;
const STACK_PATTERN = /\b(?:at\s+\S+\s+\(|Traceback \(most recent call last\)|File ".+", line \d+)/;
const CODE_PATTERN = /```|;\s*(?:rm|git|npm|python|node|curl)\b|(?:function|const|let|var|class)\s+\w+/;

export function mapAgentReaction(reaction: string): CompanionState | null {
  const normalizedReaction = reaction.trim().toLowerCase() as AgentReaction;
  return AGENT_REACTION_TO_STATE[normalizedReaction] ?? null;
}

export function mapAgentStatus(status: string): CompanionState | null {
  const normalizedStatus = status.trim().toLowerCase() as AgentSemanticStatus;
  return AGENT_STATUS_TO_STATE[normalizedStatus] ?? null;
}

export function normalizeAgentStatus(status: string): AgentSemanticStatus | null {
  const normalizedStatus = status.trim().toLowerCase() as AgentSemanticStatus;
  return AGENT_STATUS_TO_STATE[normalizedStatus] ? normalizedStatus : null;
}

export function validateAgentMessage(
  value: unknown,
  options: MessageValidationOptions
): MessageValidationResult {
  if (typeof value !== 'string') {
    return { ok: false, error: 'message must be a string' };
  }

  const message = value.trim().replace(/\s+/g, ' ');
  if (!message) {
    return { ok: false, error: 'message is empty' };
  }
  if (message.length > options.maxChars) {
    return { ok: false, error: `message exceeds ${options.maxChars} characters` };
  }
  if (value.split(/\r?\n/).length > 2) {
    return { ok: false, error: 'message looks like multi-line output' };
  }
  if (URL_PATTERN.test(message)) {
    return { ok: false, error: 'message contains a URL' };
  }
  if (ABSOLUTE_PATH_PATTERN.test(message)) {
    return { ok: false, error: 'message contains a local path' };
  }
  if (SECRET_PATTERN.test(message)) {
    return { ok: false, error: 'message may contain a secret' };
  }
  if (STACK_PATTERN.test(message)) {
    return { ok: false, error: 'message looks like a stack trace' };
  }
  if (CODE_PATTERN.test(message)) {
    return { ok: false, error: 'message looks like code or a shell command' };
  }

  return { ok: true, message };
}
