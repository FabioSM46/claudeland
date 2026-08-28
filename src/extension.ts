import Gio from 'gi://Gio';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {
  Extension,
  gettext as _,
} from 'resource:///org/gnome/shell/extensions/extension.js';

import { UsageController } from './services/usage-controller.js';
import { DesktopCard } from './ui/desktop-card.js';
import { UsageIndicator } from './ui/usage-indicator.js';

export default class ClaudelandExtension extends Extension {
  private settings: Gio.Settings | null = null;
  private controller: UsageController | null = null;
  private indicator: InstanceType<typeof UsageIndicator> | null = null;
  private desktopCard: DesktopCard | null = null;
  private settingSignalIds: number[] = [];

  enable(): void {
    this.settings = this.getSettings();
    this.controller = new UsageController(this.settings);

    this.settingSignalIds = [
      this.settings.connect('changed::show-panel', () => this.syncSurfaces()),
      this.settings.connect('changed::show-desktop-widget', () => this.syncSurfaces()),
      this.settings.connect('changed::desktop-position', () => this.recreateDesktopCard()),
      this.settings.connect('changed::compact-panel', () => void this.controller?.refresh()),
      this.settings.connect('changed::refresh-interval', () => void this.controller?.refresh()),
      this.settings.connect('changed::warning-remaining', () => void this.controller?.refresh()),
      this.settings.connect('changed::critical-remaining', () => void this.controller?.refresh()),
    ];

    this.syncSurfaces();
    this.controller.start();
  }

  disable(): void {
    this.indicator?.destroy();
    this.indicator = null;
    this.desktopCard?.destroy();
    this.desktopCard = null;
    this.controller?.destroy();
    this.controller = null;

    if (this.settings) {
      for (const signalId of this.settingSignalIds) {
        this.settings.disconnect(signalId);
      }
    }
    this.settingSignalIds = [];
    this.settings = null;
  }

  private syncSurfaces(): void {
    if (!this.settings || !this.controller) {
      return;
    }

    const showPanel = this.settings.get_boolean('show-panel');
    if (showPanel && !this.indicator) {
      this.indicator = new UsageIndicator(
        this.controller,
        this.settings,
        () => this.openPreferences(),
      );
      Main.panel.addToStatusArea(this.uuid, this.indicator);
    } else if (!showPanel && this.indicator) {
      this.indicator.destroy();
      this.indicator = null;
    }

    const showDesktop = this.settings.get_boolean('show-desktop-widget');
    if (showDesktop && !this.desktopCard) {
      try {
        this.desktopCard = new DesktopCard(this.controller, this.settings);
      } catch (error) {
        logError(
          error instanceof Error ? error : new Error(String(error)),
          'Claudeland could not create the desktop card',
        );
        Main.notifyError(
          'Claudeland',
          _('The desktop card is unavailable on this GNOME version.'),
        );
      }
    } else if (!showDesktop && this.desktopCard) {
      this.desktopCard.destroy();
      this.desktopCard = null;
    }
  }

  private recreateDesktopCard(): void {
    this.desktopCard?.destroy();
    this.desktopCard = null;
    this.syncSurfaces();
  }
}
