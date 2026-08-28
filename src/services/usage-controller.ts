import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import type { UsageSnapshot } from '../domain/usage.js';
import { ClaudeAuth } from './claude-auth.js';
import { ClaudeUsageClient } from './claude-usage-client.js';
import { ClaudelandError, errorMessage } from './errors.js';

export interface UsageState {
  snapshot: UsageSnapshot | null;
  loading: boolean;
  stale: boolean;
  error: string | null;
  errorCode: ClaudelandError['code'] | null;
  planLabel: string | null;
}

type StateListener = (state: Readonly<UsageState>) => void;

export class UsageController {
  private readonly listeners = new Set<StateListener>();
  private readonly client = new ClaudeUsageClient();
  private readonly auth = new ClaudeAuth();
  private timeoutId: number | null = null;
  private destroyed = false;
  private state: UsageState = {
    snapshot: null,
    loading: false,
    stale: false,
    error: null,
    errorCode: null,
    planLabel: null,
  };

  constructor(private readonly settings: Gio.Settings) {}

  start(): void {
    void this.refresh();
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  async refresh(): Promise<void> {
    if (this.destroyed || this.state.loading) {
      return;
    }

    this.setState({ loading: true, error: null, errorCode: null });
    let nextDelay = this.baseIntervalSeconds();

    try {
      const authStatus = await this.auth.status();
      if (!authStatus.installed) {
        throw new ClaudelandError(
          'claude-cli-missing',
          'Install Claude Code to authenticate.',
        );
      }
      if (!authStatus.loggedIn) {
        throw new ClaudelandError(
          'not-authenticated',
          'Sign in to Claude Code to view usage.',
        );
      }

      const result = await this.client.fetch({
        warningRemaining: this.settings.get_uint('warning-remaining'),
        criticalRemaining: this.settings.get_uint('critical-remaining'),
      });
      this.setState({
        snapshot: result.snapshot,
        planLabel: result.planLabel,
        loading: false,
        stale: false,
        error: null,
        errorCode: null,
      });
    } catch (error) {
      if (error instanceof ClaudelandError && error.code === 'rate-limited') {
        nextDelay = Math.max(nextDelay, error.retryAfterSeconds ?? nextDelay * 2);
      }
      this.setState({
        loading: false,
        stale: this.state.snapshot !== null,
        error: errorMessage(error),
        errorCode: error instanceof ClaudelandError ? error.code : 'network-error',
      });
    } finally {
      this.schedule(nextDelay);
    }
  }

  launchLogin(): void {
    this.auth.launchLogin();
  }

  destroy(): void {
    this.destroyed = true;
    if (this.timeoutId !== null) {
      GLib.source_remove(this.timeoutId);
      this.timeoutId = null;
    }
    this.listeners.clear();
    this.client.destroy();
  }

  private setState(patch: Partial<UsageState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  private schedule(seconds: number): void {
    if (this.destroyed) {
      return;
    }
    if (this.timeoutId !== null) {
      GLib.source_remove(this.timeoutId);
    }
    this.timeoutId = GLib.timeout_add_seconds(
      GLib.PRIORITY_DEFAULT,
      Math.max(60, Math.round(seconds)),
      () => {
        this.timeoutId = null;
        void this.refresh();
        return GLib.SOURCE_REMOVE;
      },
    );
  }

  private baseIntervalSeconds(): number {
    return Math.max(1, this.settings.get_uint('refresh-interval')) * 60;
  }
}
