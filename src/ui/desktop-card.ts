import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { formatPercent, localizedLimitLabel } from '../domain/usage.js';
import type { UsageController, UsageState } from '../services/usage-controller.js';
import { formatMessage, localizedError, translate as _ } from './localization.js';

type LayoutManagerWithBackground = typeof Main.layoutManager & {
  _backgroundGroup?: Clutter.Actor;
};

export class DesktopCard {
  private readonly actor: St.BoxLayout;
  private readonly title: St.Label;
  private readonly content: St.BoxLayout;
  private readonly unsubscribe: () => void;
  private readonly monitorsChangedId: number;

  constructor(
    controller: UsageController,
    private readonly settings: Gio.Settings,
  ) {
    this.actor = new St.BoxLayout({
      vertical: true,
      reactive: false,
      can_focus: false,
      width: 300,
      style_class: 'claudeland-desktop-card',
    });
    this.title = new St.Label({
      text: _('Claude plan'),
      style_class: 'claudeland-desktop-title',
    });
    this.content = new St.BoxLayout({
      vertical: true,
      style_class: 'claudeland-desktop-content',
    });
    this.actor.add_child(this.title);
    this.actor.add_child(this.content);

    const layoutManager = Main.layoutManager as LayoutManagerWithBackground;
    if (!layoutManager._backgroundGroup) {
      throw new Error('The GNOME Shell background group is unavailable');
    }
    layoutManager._backgroundGroup.add_child(this.actor);
    this.position();

    this.monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => this.position());
    this.unsubscribe = controller.subscribe((state) => this.render(state));
  }

  destroy(): void {
    this.unsubscribe();
    Main.layoutManager.disconnect(this.monitorsChangedId);
    this.actor.destroy();
  }

  private render(state: Readonly<UsageState>): void {
    this.content.destroy_all_children();
    if (state.snapshot) {
      const updated = new Date(state.snapshot.fetchedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      const title = formatMessage(
        _('%s · updated %s'),
        state.planLabel ?? _('Claude plan'),
        updated,
      );
      this.title.text = state.stale ? formatMessage(_('%s · stale'), title) : title;
    } else {
      this.title.text = _('Claude plan');
    }

    if (!state.snapshot) {
      this.content.add_child(new St.Label({
        text: state.loading
          ? _('Loading…')
          : (state.error ? localizedError(state.errorCode, state.error) : _('Data unavailable')),
        style_class: 'claudeland-desktop-empty',
      }));
      return;
    }

    for (const limit of state.snapshot.limits) {
      const row = new St.BoxLayout({ style_class: 'claudeland-desktop-row' });
      row.add_child(new St.Label({
        text: localizedLimitLabel(limit, _),
        x_expand: true,
        style_class: 'claudeland-desktop-label',
      }));
      row.add_child(new St.Label({
        text: formatPercent(limit.remainingPercent),
        style_class: `claudeland-desktop-value claudeland-${limit.severity}`,
      }));
      this.content.add_child(row);
    }
  }

  private position(): void {
    const monitor = Main.layoutManager.primaryMonitor ?? Main.layoutManager.monitors[0];
    if (!monitor) {
      return;
    }
    const margin = 28;
    const cardWidth = 300;
    const cardHeight = Math.max(this.actor.height, 140);
    const position = this.settings.get_string('desktop-position');
    const left = monitor.x + margin;
    const right = monitor.x + monitor.width - cardWidth - margin;
    const top = monitor.y + margin + Main.panel.height;
    const bottom = monitor.y + monitor.height - cardHeight - margin;

    switch (position) {
      case 'top-left':
        this.actor.set_position(left, top);
        break;
      case 'bottom-left':
        this.actor.set_position(left, bottom);
        break;
      case 'bottom-right':
        this.actor.set_position(right, bottom);
        break;
      default:
        this.actor.set_position(right, top);
        break;
    }
  }
}
