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
  private client: ClaudeUsageClient | null = new ClaudeUsageClient();
  private auth: ClaudeAuth | null = new ClaudeAuth();
  private timeoutId: number | null = null;
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
    const client = this.client;
    const auth = this.auth;
    if (!client || !auth || this.state.loading) {
      return;
    }

    this.setState({ loading: true, error: null, errorCode: null });
    let nextDelay = this.baseIntervalSeconds();

    try {
      const authStatus = await auth.status();
      if (this.client !== client) {
        return;
      }
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

      const result = await client.fetch({
        warningRemaining: this.settings.get_uint('warning-remaining'),
        criticalRemaining: this.settings.get_uint('critical-remaining'),
      });
      if (this.client !== client) {
        return;
      }
      this.setState({
        snapshot: result.snapshot,
        planLabel: result.planLabel,
        loading: false,
        stale: false,
        error: null,
        errorCode: null,
      });
    } catch (error) {
      if (this.client !== client) {
        return;
      }
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
      if (this.client === client) {
        this.schedule(nextDelay);
      }
    }
  }

  launchLogin(): void {
    this.auth?.launchLogin();
  }

  destroy(): void {
    const client = this.client;
    const auth = this.auth;
    this.client = null;
    this.auth = null;
    if (this.timeoutId !== null) {
      GLib.Source.remove(this.timeoutId);
      this.timeoutId = null;
    }
    this.listeners.clear();
    auth?.destroy();
    client?.destroy();
  }

  private setState(patch: Partial<UsageState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  private schedule(seconds: number): void {
    if (!this.client) {
      return;
    }
    if (this.timeoutId !== null) {
      GLib.Source.remove(this.timeoutId);
      this.timeoutId = null;
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
