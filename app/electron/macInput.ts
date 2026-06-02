import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';

import type { InputPermissionStatus, MouseHitRegion } from '../shared/types';

interface MacInputEvent {
  type: 'permission' | 'leftClick' | 'leftDown' | 'leftDragged' | 'leftUp' | 'rightDown';
  status?: InputPermissionStatus;
  x?: number;
  y?: number;
}

interface HitBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class MacInputService {
  private child: ChildProcessWithoutNullStreams | null = null;
  private stdoutBuffer = '';
  private status: InputPermissionStatus = process.platform === 'darwin' ? 'unknown' : 'denied';
  private modifier = 'Option';
  private clickCaptureEnabled = false;
  private bounds: HitBounds | null = null;
  private regions: MouseHitRegion[] = [];

  constructor(
    private readonly helperPath: string,
    private readonly onEvent: (event: MacInputEvent) => void,
    private readonly onStatus: (status: InputPermissionStatus) => void
  ) {}

  start(modifier: string): void {
    this.modifier = modifier || 'Option';

    if (process.platform !== 'darwin') {
      this.setStatus('denied');
      return;
    }

    this.stop();
    this.child = spawn('/usr/bin/swift', [this.helperPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => this.handleStdout(chunk));
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', (chunk: string) => {
      const message = chunk.trim();
      if (message) {
        console.warn(`Mac input helper: ${message}`);
      }
    });
    this.child.on('exit', (code) => {
      this.child = null;
      if (code !== 0 && this.status === 'unknown') {
        this.setStatus('denied');
      }
    });
    this.child.on('error', (error) => {
      console.warn('Failed to start Mac input helper.', error);
      this.setStatus('denied');
    });

    this.send({ type: 'config', modifier: this.modifier, clickCaptureEnabled: this.clickCaptureEnabled });
    this.syncHitRegions(this.bounds, this.regions);
  }

  stop(): void {
    if (!this.child) {
      return;
    }

    this.child.kill();
    this.child = null;
  }

  getStatus(): InputPermissionStatus {
    return this.status;
  }

  updateModifier(modifier: string): void {
    this.modifier = modifier || 'Option';
    this.send({ type: 'config', modifier: this.modifier });
  }

  setClickCaptureEnabled(enabled: boolean): void {
    this.clickCaptureEnabled = enabled;
    this.send({ type: 'config', clickCaptureEnabled: enabled });
  }

  syncHitRegions(bounds: HitBounds | null, regions: MouseHitRegion[]): void {
    this.bounds = bounds;
    this.regions = regions;
    this.send({
      type: 'regions',
      bounds,
      regions
    });
  }

  private handleStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    const lines = this.stdoutBuffer.split('\n');
    this.stdoutBuffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      try {
        const event = JSON.parse(trimmed) as MacInputEvent;
        if (event.type === 'permission' && event.status) {
          this.setStatus(event.status);
          continue;
        }
        this.onEvent(event);
      } catch (error) {
        console.warn('Invalid Mac input helper payload ignored.', error);
      }
    }
  }

  private setStatus(status: InputPermissionStatus): void {
    if (this.status === status) {
      return;
    }

    this.status = status;
    this.onStatus(status);
  }

  private send(payload: unknown): void {
    if (!this.child || this.child.killed || !this.child.stdin.writable) {
      return;
    }

    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
  }
}
