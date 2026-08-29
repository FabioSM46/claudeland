// GNOME Shell UI regression probe for Claudeland.
//
// The unit tests cover pure logic and the GJS harnesses cover the services.
// Neither can touch St, Clutter, or PopupMenu, which is exactly where a new
// GNOME Shell release breaks an extension. This probe is installed as a
// throwaway extension next to a build of Claudeland, drives its actors through
// every render path with a synthetic snapshot, and reports one line to the
// journal.
//
// It is test-only: it is never packaged and never installed on a real session.

import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { DesktopCard } from './ui/desktop-card.js';
import { UsageIndicator } from './ui/usage-indicator.js';

const ROLE = 'claudeland-uicheck';

/** Long enough for the shell to settle after the probe is enabled. */
const STACKING_DELAY = 8;

function typeName(actor) {
  return actor.constructor?.$gtype?.name ?? '';
}

/**
 * Verifies where the card ended up: above the wallpaper, below every window.
 * A missing window is reported as a failure, so the check cannot pass by
 * simply never having anything to compare against.
 */
function checkStacking() {
  const siblings = global.window_group.get_children();
  const cardIndex = siblings.findIndex(
    (child) => child.has_style_class_name?.('claudeland-desktop-card'),
  );
  const backgroundIndex = siblings.findIndex(
    (child) => typeName(child) === 'MetaBackgroundGroup',
  );
  const windowIndexes = siblings
    .map((child, index) => (typeName(child).startsWith('MetaWindowActor') ? index : -1))
    .filter((index) => index >= 0);

  if (cardIndex < 0) {
    return ['the desktop card was not added to the window group'];
  }
  if (backgroundIndex < 0) {
    return ['the wallpaper group was not found in the window group'];
  }
  if (cardIndex <= backgroundIndex) {
    return [`the desktop card is not above the wallpaper (card ${cardIndex}, wallpaper ${backgroundIndex})`];
  }
  if (windowIndexes.length === 0) {
    return ['no window appeared, so the card stacking could not be verified'];
  }
  if (cardIndex > Math.min(...windowIndexes)) {
    return [`the desktop card is not below application windows (card ${cardIndex}, windows ${windowIndexes.join(',')})`];
  }
  return [];
}

const SNAPSHOT = {
  fetchedAt: new Date().toISOString(),
  limits: [
    {
      id: 'five_hour',
      label: 'Current session',
      consumedPercent: 20,
      remainingPercent: 80,
      resetsAt: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
      scopeModel: null,
      severity: 'ok',
    },
    {
      id: 'seven_day',
      label: 'Weekly limit',
      consumedPercent: 82,
      remainingPercent: 18,
      resetsAt: new Date(Date.now() + 4 * 24 * 3600 * 1000).toISOString(),
      scopeModel: null,
      severity: 'warning',
    },
    {
      id: 'seven_day:some-model',
      label: 'Weekly limit',
      consumedPercent: 95,
      remainingPercent: 5,
      resetsAt: null,
      scopeModel: 'some-model',
      severity: 'critical',
    },
  ],
};

const STATES = [
  { name: 'loading', patch: { loading: true } },
  { name: 'renewing', patch: { loading: true, renewing: true } },
  {
    name: 'renewal failed',
    patch: {
      error: 'The Claude session could not be renewed automatically. Retrying later.',
      errorCode: 'renewal-failed',
    },
  },
  {
    name: 'stale after error',
    patch: {
      snapshot: SNAPSHOT,
      stale: true,
      error: 'Could not reach Anthropic. Check your connection.',
      errorCode: 'network-error',
      planLabel: 'Claude Max 5x',
    },
  },
  {
    name: 'snapshot',
    patch: { snapshot: SNAPSHOT, planLabel: 'Claude Max 5x' },
  },
];

function emptyState() {
  return {
    snapshot: null,
    loading: false,
    renewing: false,
    stale: false,
    error: null,
    errorCode: null,
    planLabel: null,
  };
}

class ProbeController {
  constructor() {
    this._listeners = new Set();
    this._state = emptyState();
  }

  subscribe(listener) {
    this._listeners.add(listener);
    listener(this._state);
    return () => this._listeners.delete(listener);
  }

  emit(patch) {
    this._state = { ...emptyState(), ...patch };
    for (const listener of this._listeners) {
      listener(this._state);
    }
  }

  refresh() {}

  launchLogin() {}
}

export default class ClaudelandUiCheck extends Extension {
  _timeoutId = null;

  enable() {
    const failures = [];
    const settings = this.getSettings();
    const controller = new ProbeController();

    let indicator = null;
    let card = null;
    try {
      indicator = new UsageIndicator(controller, settings, () => {});
      Main.panel.addToStatusArea(ROLE, indicator);
      card = new DesktopCard(controller, settings);

      for (const compact of [false, true]) {
        settings.set_boolean('compact-panel', compact);
        for (const state of STATES) {
          try {
            controller.emit(state.patch);
          } catch (error) {
            failures.push(`${state.name} (compact=${compact}): ${error}`);
          }
        }
      }

      // The card must sit above the wallpaper and below application windows.
      // That placement is the whole point of the card, and it is reached
      // through public API, so assert it rather than trusting it.
      indicator.menu.open();
      indicator.menu.close();
    } catch (error) {
      failures.push(String(error));
    }

    // The card must end up above the wallpaper and below application windows.
    // That ordering is only observable once a real window exists, so the check
    // waits for the verification script to open one.
    this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, STACKING_DELAY, () => {
      this._timeoutId = null;
      failures.push(...checkStacking());
      try {
        card?.destroy();
        indicator?.destroy();
      } catch (error) {
        failures.push(`teardown: ${error}`);
      }
      settings.reset('compact-panel');

      if (failures.length > 0) {
        console.error(`CLAUDELAND UI CHECK FAILED: ${failures.join(' | ')}`);
      } else {
        console.log('CLAUDELAND UI CHECK OK');
      }
      return GLib.SOURCE_REMOVE;
    });
  }

  disable() {
    if (this._timeoutId) {
      GLib.Source.remove(this._timeoutId);
      this._timeoutId = null;
    }
  }
}
