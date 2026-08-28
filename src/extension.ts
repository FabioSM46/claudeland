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

  enable(): void {
    this.settings = this.getSettings();
    this.controller = new UsageController(this.settings);

    this.settings.connectObject(
      'changed::show-panel', () => this.syncSurfaces(),
      'changed::show-desktop-widget', () => this.syncSurfaces(),
      'changed::desktop-position', () => this.recreateDesktopCard(),
      'changed::compact-panel', () => void this.controller?.refresh(),
      'changed::refresh-interval', () => void this.controller?.refresh(),
      'changed::warning-remaining', () => void this.controller?.refresh(),
      'changed::critical-remaining', () => void this.controller?.refresh(),
      this,
    );

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

    this.settings?.disconnectObject(this);
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
          _('Claudeland'),
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
