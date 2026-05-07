import { globalShortcut } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import type { ControlCenterModule, ShortcutBinding } from '../shared/types';

interface ShortcutSettingsFile {
  shortcuts?: Array<Partial<ShortcutBinding> & { id?: string }>;
}

export const DEFAULT_SHORTCUTS: ShortcutBinding[] = [
  {
    id: 'control-center.toggle',
    label: '打开/关闭控制中心',
    accelerator: 'CommandOrControl+Shift+Space',
    defaultAccelerator: 'CommandOrControl+Shift+Space',
    editable: true,
    enabled: true
  },
  {
    id: 'control-center.status',
    label: '打开状态切换',
    accelerator: 'F2',
    defaultAccelerator: 'F2',
    editable: true,
    enabled: false
  },
  {
    id: 'control-center.settings',
    label: '打开设置',
    accelerator: 'F3',
    defaultAccelerator: 'F3',
    editable: true,
    enabled: false
  },
  {
    id: 'control-center.reminders',
    label: '打开提醒',
    accelerator: 'F4',
    defaultAccelerator: 'F4',
    editable: true,
    enabled: false
  },
  {
    id: 'control-center.tasks',
    label: '打开任务中心',
    accelerator: 'F5',
    defaultAccelerator: 'F5',
    editable: true,
    enabled: false
  },
  {
    id: 'pet.interactionModifier',
    label: '宠物鼠标交互修饰键',
    accelerator: 'Option',
    defaultAccelerator: 'Option',
    editable: true,
    enabled: true
  }
];

export function shortcutSettingsPath(): string {
  return join(homedir(), '.desktop-ai-companion', 'settings', 'shortcuts.json');
}

export function moduleForShortcutId(id: string): ControlCenterModule | null {
  switch (id) {
    case 'control-center.status':
      return 'status';
    case 'control-center.reminders':
      return 'reminders';
    case 'control-center.tasks':
      return 'tasks';
    case 'control-center.settings':
      return 'settings';
    default:
      return null;
  }
}

function normalizeAccelerator(accelerator: string): string {
  return accelerator.trim().replace(/\s+/g, '');
}

function cloneBinding(binding: ShortcutBinding): ShortcutBinding {
  return { ...binding };
}

function mergeBinding(defaultBinding: ShortcutBinding, override: Partial<ShortcutBinding>): ShortcutBinding {
  const accelerator =
    typeof override.accelerator === 'string' ? normalizeAccelerator(override.accelerator) : defaultBinding.accelerator;
  const enabled = typeof override.enabled === 'boolean' ? override.enabled : defaultBinding.enabled;

  return {
    ...defaultBinding,
    accelerator,
    enabled
  };
}

export class ShortcutService {
  private bindings = DEFAULT_SHORTCUTS.map(cloneBinding);
  private registeredAccelerators: string[] = [];

  constructor(private readonly settingsPath = shortcutSettingsPath()) {}

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.settingsPath, 'utf8');
      const parsed = JSON.parse(raw) as ShortcutSettingsFile;
      const overrides = new Map((parsed.shortcuts ?? []).filter((binding) => binding.id).map((binding) => [binding.id, binding]));
      this.bindings = DEFAULT_SHORTCUTS.map((binding) => {
        const override = overrides.get(binding.id);
        return override ? mergeBinding(binding, override) : cloneBinding(binding);
      });
      this.validateDuplicates(this.bindings);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
        this.bindings = DEFAULT_SHORTCUTS.map(cloneBinding);
        return;
      }

      console.warn('Failed to load shortcut settings; using defaults.', error);
      this.bindings = DEFAULT_SHORTCUTS.map(cloneBinding);
    }
  }

  list(): ShortcutBinding[] {
    return this.bindings.map(cloneBinding);
  }

  interactionModifier(): string {
    return this.bindings.find((binding) => binding.id === 'pet.interactionModifier')?.accelerator ?? 'Option';
  }

  async updateShortcut(id: string, accelerator: string): Promise<ShortcutBinding[]> {
    const nextBindings = this.bindings.map((binding) => {
      if (binding.id !== id) {
        return cloneBinding(binding);
      }

      if (!binding.editable) {
        throw new Error('快捷键不可编辑');
      }

      const nextAccelerator = normalizeAccelerator(accelerator);
      return {
        ...binding,
        accelerator: nextAccelerator || binding.defaultAccelerator,
        enabled: nextAccelerator.length > 0
      };
    });

    if (!nextBindings.some((binding) => binding.id === id)) {
      throw new Error('未知快捷键');
    }

    this.validateDuplicates(nextBindings);
    this.bindings = nextBindings;
    await this.save();
    return this.list();
  }

  async resetShortcut(id: string): Promise<ShortcutBinding[]> {
    const defaultBinding = DEFAULT_SHORTCUTS.find((binding) => binding.id === id);
    if (!defaultBinding) {
      throw new Error('未知快捷键');
    }

    this.bindings = this.bindings.map((binding) => (binding.id === id ? cloneBinding(defaultBinding) : cloneBinding(binding)));
    this.validateDuplicates(this.bindings);
    await this.save();
    return this.list();
  }

  register(actions: Map<string, () => void>): void {
    this.unregister();

    for (const binding of this.bindings) {
      if (!binding.enabled || binding.id === 'pet.interactionModifier') {
        continue;
      }

      const action = actions.get(binding.id);
      if (!action) {
        continue;
      }

      const registered = globalShortcut.register(binding.accelerator, action);
      if (registered) {
        this.registeredAccelerators.push(binding.accelerator);
      } else {
        console.warn(`Failed to register shortcut: ${binding.label} (${binding.accelerator})`);
      }
    }
  }

  unregister(): void {
    for (const accelerator of this.registeredAccelerators) {
      globalShortcut.unregister(accelerator);
    }
    this.registeredAccelerators = [];
  }

  private validateDuplicates(bindings: ShortcutBinding[]): void {
    const seen = new Map<string, string>();

    for (const binding of bindings) {
      if (!binding.enabled || binding.id === 'pet.interactionModifier') {
        continue;
      }

      const key = binding.accelerator.toLowerCase();
      const duplicate = seen.get(key);
      if (duplicate) {
        throw new Error(`快捷键冲突：${duplicate} / ${binding.label}`);
      }
      seen.set(key, binding.label);
    }
  }

  private async save(): Promise<void> {
    await mkdir(dirname(this.settingsPath), { recursive: true });
    await writeFile(
      this.settingsPath,
      `${JSON.stringify(
        {
          shortcuts: this.bindings.map(({ id, accelerator, enabled }) => ({ id, accelerator, enabled }))
        },
        null,
        2
      )}\n`,
      'utf8'
    );
  }
}
