import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {
  compactLimitLabel,
  formatPercent,
  formatTimeRemaining,
  type UsageLimit,
} from '../domain/usage.js';
import type { UsageController, UsageState } from '../services/usage-controller.js';

class UsageIndicatorImpl extends PanelMenu.Button {
  private readonly panelLabel: St.Label;
  private readonly statusItem: PopupMenu.PopupMenuItem;
  private readonly limitsSection: PopupMenu.PopupMenuSection;
  private readonly loginItem: PopupMenu.PopupMenuItem;
  private readonly popupMenu: PopupMenu.PopupMenu;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly controller: UsageController,
    private readonly settings: Gio.Settings,
    openPreferences: () => void,
  ) {
    super(0, 'Claudeland', false);
    this.popupMenu = this.menu as PopupMenu.PopupMenu;

    const box = new St.BoxLayout({
      style_class: 'panel-status-menu-box claudeland-panel',
      y_align: Clutter.ActorAlign.CENTER,
    });
    box.add_child(new St.Icon({
      icon_name: 'network-transmit-receive-symbolic',
      style_class: 'system-status-icon claudeland-panel-icon',
    }));
    this.panelLabel = new St.Label({
      text: 'Claude --',
      y_align: Clutter.ActorAlign.CENTER,
    });
    box.add_child(this.panelLabel);
    this.add_child(box);

    this.statusItem = new PopupMenu.PopupMenuItem('Caricamento…', {
      reactive: false,
      can_focus: false,
    });
    this.statusItem.add_style_class_name('claudeland-status');
    this.popupMenu.addMenuItem(this.statusItem);
    this.popupMenu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    this.limitsSection = new PopupMenu.PopupMenuSection();
    this.popupMenu.addMenuItem(this.limitsSection);
    this.popupMenu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    this.loginItem = new PopupMenu.PopupMenuItem('Accedi / rinnova sessione');
    this.loginItem.connect('activate', () => {
      try {
        this.controller.launchLogin();
      } catch (error) {
        Main.notifyError('Claudeland', error instanceof Error ? error.message : String(error));
      }
    });
    this.popupMenu.addMenuItem(this.loginItem);

    const refreshItem = new PopupMenu.PopupMenuItem('Aggiorna ora');
    refreshItem.connect('activate', () => void this.controller.refresh());
    this.popupMenu.addMenuItem(refreshItem);

    const settingsItem = new PopupMenu.PopupMenuItem('Preferenze');
    settingsItem.connect('activate', openPreferences);
    this.popupMenu.addMenuItem(settingsItem);

    this.unsubscribe = controller.subscribe((state) => this.render(state));
  }

  override destroy(): void {
    this.unsubscribe();
    super.destroy();
  }

  private render(state: Readonly<UsageState>): void {
    this.renderPanel(state);
    this.renderMenu(state);
  }

  private renderPanel(state: Readonly<UsageState>): void {
    if (!state.snapshot) {
      this.panelLabel.text = state.loading ? 'Claude …' : 'Claude --';
      return;
    }

    const suffix = state.stale ? ' *' : '';
    if (this.settings.get_boolean('compact-panel')) {
      const worst = [...state.snapshot.limits]
        .sort((left, right) => left.remainingPercent - right.remainingPercent)[0];
      this.panelLabel.text = `Claude ${formatPercent(worst.remainingPercent)}${suffix}`;
      return;
    }

    this.panelLabel.text = state.snapshot.limits
      .map((limit) => `${compactLimitLabel(limit)} ${formatPercent(limit.remainingPercent)}`)
      .join(' · ') + suffix;
  }

  private renderMenu(state: Readonly<UsageState>): void {
    this.limitsSection.removeAll();

    if (state.loading && !state.snapshot) {
      this.statusItem.label.text = 'Caricamento utilizzo Claude…';
    } else if (state.error) {
      this.statusItem.label.text = state.stale
        ? `Dati non aggiornati · ${state.error}`
        : state.error;
    } else if (state.snapshot) {
      const updated = new Date(state.snapshot.fetchedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      this.statusItem.label.text = `Capacità rimanente · aggiornato ${updated}`;
    }

    if (state.snapshot) {
      for (const limit of state.snapshot.limits) {
        this.limitsSection.addMenuItem(createLimitRow(limit));
      }
    }

    const needsLogin = state.errorCode === 'not-authenticated'
      || state.errorCode === 'credentials-missing'
      || state.errorCode === 'credentials-expired'
      || state.errorCode === 'unauthorized';
    this.loginItem.visible = needsLogin;
  }
}

// The GNOME 46 Shell typings and generated GObject typings can resolve through
// different @girs dependency instances. At runtime they are the same GObject
// namespace; preserve the concrete constructor type across that type boundary.
export const UsageIndicator = GObject.registerClass(
  UsageIndicatorImpl as any,
) as typeof UsageIndicatorImpl;

function createLimitRow(limit: UsageLimit): PopupMenu.PopupBaseMenuItem {
  const item = new PopupMenu.PopupBaseMenuItem({
    reactive: false,
    can_focus: false,
  });
  item.add_style_class_name('claudeland-limit-item');

  const content = new St.BoxLayout({
    vertical: true,
    x_expand: true,
    style_class: 'claudeland-limit-content',
  });
  const header = new St.BoxLayout({ x_expand: true });
  header.add_child(new St.Label({
    text: limit.label,
    x_expand: true,
    style_class: 'claudeland-limit-label',
  }));
  const value = new St.Label({
    text: `${formatPercent(limit.remainingPercent)} rimasto`,
    style_class: `claudeland-limit-value claudeland-${limit.severity}`,
  });
  header.add_child(value);
  content.add_child(header);

  const track = new St.BoxLayout({ style_class: 'claudeland-progress-track' });
  const fill = new St.Widget({
    style_class: `claudeland-progress-fill claudeland-${limit.severity}`,
    width: Math.max(2, Math.round(limit.remainingPercent * 2.4)),
  });
  track.add_child(fill);
  content.add_child(track);
  content.add_child(new St.Label({
    text: formatTimeRemaining(limit.resetsAt),
    style_class: 'claudeland-reset-label',
  }));

  item.add_child(content);
  return item;
}
