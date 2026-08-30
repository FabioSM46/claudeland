import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { formatPercent, localizedLimitLabel } from '../domain/usage.js';
import type { UsageController, UsageState } from '../services/usage-controller.js';
import { setBoxLayoutVertical } from './compat.js';
import { formatMessage, localizedError, translate as _ } from './localization.js';

export class DesktopCard {
  private readonly actor: St.BoxLayout;
  private readonly title: St.Label;
  private readonly content: St.BoxLayout;
  private readonly unsubscribe: () => void;
  private positionSourceId: number | null = null;
  private backgroundGroup: Meta.BackgroundGroup | null = null;

  constructor(
    controller: UsageController,
    private readonly settings: Gio.Settings,
  ) {
    this.actor = new St.BoxLayout({
      reactive: false,
      can_focus: false,
      width: 300,
      style_class: 'claudeland-desktop-card',
    });
    setBoxLayoutVertical(this.actor);
    this.title = new St.Label({
      text: _('Claude plan'),
      style_class: 'claudeland-desktop-title',
    });
    this.content = new St.BoxLayout({
      style_class: 'claudeland-desktop-content',
    });
    setBoxLayoutVertical(this.content);
    this.actor.add_child(this.title);
    this.actor.add_child(this.content);

    // The card belongs above the wallpaper and below every application window,
    // so it lives inside the wallpaper's own container rather than beside it.
    // Mutter restacks the window group itself on every stacking change and
    // moves the actors it owns around any foreign sibling, which would float
    // the card above the windows; it never reorders inside the background
    // group. Locating that group by its public type keeps the same parent the
    // shell uses without reaching for LayoutManager's private field.
    this.backgroundGroup =
      global.window_group
        ?.get_children()
        .find((child): child is Meta.BackgroundGroup => child instanceof Meta.BackgroundGroup) ??
      null;
    if (!this.backgroundGroup) {
      throw new Error('The GNOME Shell background group is unavailable');
    }
    this.backgroundGroup.add_child(this.actor);
    this.raiseAboveWallpaper();

    Main.layoutManager.connectObject(
      'monitors-changed',
      () => {
        // A monitor change rebuilds the wallpaper actors in this same group.
        this.raiseAboveWallpaper();
        this.position();
      },
      this.actor,
    );
    this.unsubscribe = controller.subscribe((state) => this.render(state));
  }

  destroy(): void {
    this.unsubscribe();
    Main.layoutManager.disconnectObject(this.actor);
    this.backgroundGroup = null;
    if (this.positionSourceId !== null) {
      GLib.Source.remove(this.positionSourceId);
      this.positionSourceId = null;
    }
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
      this.content.add_child(
        new St.Label({
          text: state.renewing
            ? _('Renewing the Claude session…')
            : state.loading
              ? _('Loading…')
              : state.error
                ? localizedError(state.errorCode, state.error)
                : _('Data unavailable'),
          style_class: 'claudeland-desktop-empty',
        }),
      );
      this.queuePosition();
      return;
    }

    for (const limit of state.snapshot.limits) {
      const row = new St.BoxLayout({ style_class: 'claudeland-desktop-row' });
      row.add_child(
        new St.Label({
          text: localizedLimitLabel(limit, _),
          x_expand: true,
          style_class: 'claudeland-desktop-label',
        }),
      );
      row.add_child(
        new St.Label({
          text: formatPercent(limit.remainingPercent),
          style_class: `claudeland-desktop-value claudeland-${limit.severity}`,
        }),
      );
      this.content.add_child(row);
    }
    this.queuePosition();
  }

  /** Keeps the card on top of the wallpaper actors sharing its container. */
  private raiseAboveWallpaper(): void {
    this.backgroundGroup?.set_child_above_sibling(this.actor, null);
  }

  private queuePosition(): void {
    if (this.positionSourceId !== null) {
      return;
    }
    this.positionSourceId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
      this.positionSourceId = null;
      this.position();
      return GLib.SOURCE_REMOVE;
    });
  }

  private position(): void {
    const monitor = Main.layoutManager.primaryMonitor ?? Main.layoutManager.monitors[0];
    if (!monitor) {
      return;
    }
    const margin = 28;
    const cardWidth = 300;
    const [, naturalHeight] = this.actor.get_preferred_height(cardWidth);
    const cardHeight = Math.max(this.actor.height, naturalHeight, 140);
    const position = this.settings.get_string('desktop-position');
    const left = monitor.x + margin;
    const right = monitor.x + monitor.width - cardWidth - margin;
    const top = monitor.y + margin + Main.panel.height;
    const bottom = monitor.y + monitor.height - cardHeight - margin;

    let x: number;
    let y: number;
    switch (position) {
      case 'top-left':
        x = left;
        y = top;
        break;
      case 'bottom-left':
        x = left;
        y = bottom;
        break;
      case 'bottom-right':
        x = right;
        y = bottom;
        break;
      default:
        x = right;
        y = top;
        break;
    }

    if (this.actor.x !== x || this.actor.y !== y) {
      this.actor.set_position(x, y);
    }
  }
}
