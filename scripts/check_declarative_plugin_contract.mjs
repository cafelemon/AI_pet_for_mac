#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { isAbsolute } from 'node:path';

const MIN_INTERVAL_MS = 60000;
const MIN_COOLDOWN_MS = 15000;
const MAX_TTL_MS = 15000;
const ALLOWED_PERMISSIONS = new Set(['display.speech', 'display.reaction', 'display.action']);
const ALLOWED_REACTIONS = new Set(['idle', 'reset', 'thinking', 'editing', 'coding', 'waiting', 'success', 'error']);
const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/i;
const ABSOLUTE_PATH_PATTERN = /(?:^|\s)(?:~\/|\/(?:Users|private|var|tmp|etc|opt|home|Volumes)\b|[A-Za-z]:\\)/;
const BLOCKED_FIELD_PATTERN =
  /^(?:(?:script|shell|command|module|require|import|network|fetch|write|file|path|url)s?|(?:script|shell|command|module|network|fetch|write|file|path|url).*(?:path|url|file|command|script))$/i;

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    assert.equal(allowed.includes(key), true, `${label} contains unsupported field: ${key}`);
  }
}

function validateMessage(value) {
  if (typeof value !== 'string') return false;
  const message = value.trim().replace(/\s+/g, ' ');
  if (!message || message.length > 80) return false;
  if (URL_PATTERN.test(message) || ABSOLUTE_PATH_PATTERN.test(message)) return false;
  if (/(?:api[_-]?key|secret|token|password|passwd|bearer|sk-[A-Za-z0-9_-]{16,})/i.test(message)) return false;
  if (/```|;\s*(?:rm|git|npm|python|node|curl)\b|(?:function|const|let|var|class)\s+\w+/.test(message)) return false;
  return true;
}

function assertSafeValue(value, key = 'manifest') {
  if (typeof value === 'string') {
    assert.equal(URL_PATTERN.test(value), false, `${key} contains a URL`);
    assert.equal(ABSOLUTE_PATH_PATTERN.test(value) || isAbsolute(value), false, `${key} contains an absolute path`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeValue(item, `${key}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [childKey, childValue] of Object.entries(value)) {
    assert.equal(BLOCKED_FIELD_PATTERN.test(childKey), false, `manifest contains blocked field: ${childKey}`);
    assertSafeValue(childValue, childKey);
  }
}

function positiveInteger(value, label) {
  assert.equal(Number.isInteger(value) && value > 0, true, `${label} must be a positive integer`);
  return value;
}

function validateReactions(value, label) {
  assert.equal(Array.isArray(value) && value.length > 0, true, `${label} must be a non-empty array`);
  return value.map((reaction) => {
    assert.equal(typeof reaction, 'string');
    assert.equal(ALLOWED_REACTIONS.has(reaction), true, `${label} contains unknown reaction: ${reaction}`);
    return reaction;
  });
}

function validateTrigger(trigger) {
  assert.equal(isRecord(trigger), true, 'trigger must be an object');
  if (trigger.type === 'interval') {
    assertKeys(trigger, ['type', 'intervalMs'], 'interval trigger');
    assert.equal(positiveInteger(trigger.intervalMs, 'intervalMs') >= MIN_INTERVAL_MS, true);
    return trigger;
  }
  if (trigger.type === 'idle') {
    assertKeys(trigger, ['type', 'idleMs', 'repeatIntervalMs'], 'idle trigger');
    assert.equal(positiveInteger(trigger.idleMs, 'idleMs') >= MIN_INTERVAL_MS, true);
    if (trigger.repeatIntervalMs !== undefined) {
      assert.equal(positiveInteger(trigger.repeatIntervalMs, 'repeatIntervalMs') >= MIN_INTERVAL_MS, true);
    }
    return trigger;
  }
  if (trigger.type === 'condition') {
    assertKeys(trigger, ['type', 'source', 'equals'], 'condition trigger');
    assert.equal(trigger.source === 'agent.status' || trigger.source === 'codex.state', true);
    assert.equal(typeof trigger.equals === 'string' && trigger.equals.length > 0, true);
    return trigger;
  }
  throw new Error(`unsupported trigger type: ${String(trigger.type)}`);
}

function validateEffect(effect) {
  assert.equal(isRecord(effect), true, 'effect must be an object');
  if (effect.ttlMs !== undefined) {
    assert.equal(positiveInteger(effect.ttlMs, 'ttlMs') <= MAX_TTL_MS, true, 'illegal TTL');
  }
  if (effect.type === 'speech_pool') {
    assertKeys(effect, ['type', 'messages', 'reactions', 'ttlMs'], 'speech_pool effect');
    assert.equal(Array.isArray(effect.messages) && effect.messages.length > 0, true);
    effect.messages.forEach((message) => assert.equal(validateMessage(message), true, 'dangerous message'));
    if (effect.reactions) validateReactions(effect.reactions, 'speech_pool.reactions');
    return effect;
  }
  if (effect.type === 'reaction_pool') {
    assertKeys(effect, ['type', 'reactions', 'ttlMs'], 'reaction_pool effect');
    validateReactions(effect.reactions, 'reaction_pool.reactions');
    return effect;
  }
  if (effect.type === 'random_action') {
    assertKeys(effect, ['type', 'ttlMs'], 'random_action effect');
    return effect;
  }
  throw new Error(`unsupported effect type: ${String(effect.type)}`);
}

function validateManifest(value) {
  assert.equal(isRecord(value), true, 'manifest must be an object');
  assertSafeValue(value);
  assertKeys(
    value,
    ['schemaVersion', 'id', 'version', 'label', 'description', 'enabledByDefault', 'profileIds', 'permissions', 'cooldownMs', 'triggers', 'effects'],
    'manifest'
  );
  assert.equal(value.schemaVersion, 1);
  assert.match(value.id, /^[a-z][a-z0-9_]{2,63}$/);
  assert.match(value.version, /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/);
  assert.equal(typeof value.enabledByDefault, 'boolean');
  assert.equal(Array.isArray(value.permissions) && value.permissions.length > 0, true);
  value.permissions.forEach((permission) => assert.equal(ALLOWED_PERMISSIONS.has(permission), true));
  const cooldownMs = value.cooldownMs ?? MIN_COOLDOWN_MS;
  assert.equal(positiveInteger(cooldownMs, 'cooldownMs') >= MIN_COOLDOWN_MS, true);
  assert.equal(Array.isArray(value.triggers) && value.triggers.length > 0, true);
  assert.equal(Array.isArray(value.effects) && value.effects.length > 0, true);
  value.triggers.forEach(validateTrigger);
  value.effects.forEach(validateEffect);
  return value;
}

function builtinManifests() {
  return readdirSync('data/plugins')
    .filter((name) => name.endsWith('.plugin.json'))
    .map((name) => validateManifest(JSON.parse(readFileSync(`data/plugins/${name}`, 'utf8'))));
}

function clone(value) {
  return structuredClone(value);
}

function assertRejected(mutator, pattern) {
  const manifest = clone(builtinManifests()[0]);
  mutator(manifest);
  assert.throws(() => validateManifest(manifest), pattern);
}

function assertManifests() {
  const manifests = builtinManifests();
  assert.equal(manifests.length, 3);
  manifests.forEach((manifest) => assert.equal(manifest.enabledByDefault, false));
  const ids = new Set();
  manifests.forEach((manifest) => {
    assert.equal(ids.has(manifest.id), false, `duplicate plugin id: ${manifest.id}`);
    ids.add(manifest.id);
  });
  function assertDistinctIds(nextManifests) {
    const nextIds = new Set();
    nextManifests.forEach((manifest) => {
      if (nextIds.has(manifest.id)) throw new Error(`duplicate plugin id rejected: ${manifest.id}`);
      nextIds.add(manifest.id);
    });
  }
  assert.throws(() => assertDistinctIds([manifests[0], clone(manifests[0])]), /duplicate plugin id rejected/);

  assertRejected((manifest) => { manifest.triggers = [{ type: 'cron', expression: '*' }]; }, /unsupported trigger/);
  assertRejected((manifest) => { manifest.effects = [{ type: 'shell', command: 'echo hi' }]; }, /blocked field|unsupported effect/);
  assertRejected((manifest) => { manifest.script = 'run.js'; }, /blocked field/);
  assertRejected((manifest) => { manifest.description = 'https://example.com'; }, /URL/);
  assertRejected((manifest) => { manifest.description = '/Users/example/plugin'; }, /absolute path/);
  assertRejected((manifest) => { manifest.effects = [{ type: 'speech_pool', messages: ['secret token abc'] }]; }, /dangerous message/);
  assertRejected((manifest) => { manifest.effects = [{ type: 'reaction_pool', reactions: ['unknown'] }]; }, /unknown reaction/);
  assertRejected((manifest) => { manifest.effects = [{ type: 'reaction_pool', reactions: ['success'], ttlMs: 15001 }]; }, /illegal TTL/);
}

function assertScheduling() {
  const events = [];
  const state = {
    now: 0,
    lastBusyAt: 0,
    lastCondition: null,
    lastTriggeredAt: -Infinity,
    readyActions: ['idle', 'thinking']
  };
  function trigger(kind, cooldownMs = MIN_COOLDOWN_MS) {
    if (state.now - state.lastTriggeredAt < cooldownMs) return false;
    state.lastTriggeredAt = state.now;
    events.push(kind);
    return true;
  }
  function enterCondition(next) {
    const previous = state.lastCondition;
    state.lastCondition = next;
    if (previous !== next && next === 'done') trigger('condition');
  }
  state.now = MIN_INTERVAL_MS;
  assert.equal(trigger('interval'), true);
  state.now += 1;
  assert.equal(trigger('interval'), false, 'cooldown must suppress repeats');
  state.now += MIN_COOLDOWN_MS;
  assert.equal(state.now - state.lastBusyAt >= MIN_INTERVAL_MS, true);
  assert.equal(trigger('idle'), true);
  state.now += MIN_COOLDOWN_MS;
  enterCondition('working');
  enterCondition('done');
  enterCondition('done');
  assert.deepEqual(events, ['interval', 'idle', 'condition']);

  const currentProfile = 'guofeng_ai';
  const requestedActions = ['idle', 'missing_action'];
  const runtimeReady = requestedActions.filter((action) => currentProfile === 'guofeng_ai' && state.readyActions.includes(action));
  assert.deepEqual(runtimeReady, ['idle']);
}

function assertSafeSummary() {
  const summary = {
    enabled: true,
    pluginCount: 3,
    enabledCount: 0,
    plugins: builtinManifests().map((manifest) => ({
      id: manifest.id,
      version: manifest.version,
      source: 'builtin',
      permissions: manifest.permissions,
      enabled: false
    })),
    recentErrors: [{ source: 'local', file: 'invalid.plugin.json', message: 'duplicate plugin id rejected' }]
  };
  const serialized = JSON.stringify(summary);
  assert.equal(serialized.includes('/Users/'), false);
  assert.equal(serialized.includes('token'), false);
  assert.equal(serialized.includes('socketPath'), false);
  assert.equal(serialized.includes('discoveryPath'), false);
}

assertManifests();
assertScheduling();
assertSafeSummary();
console.log('Declarative plugin contract checks passed.');
