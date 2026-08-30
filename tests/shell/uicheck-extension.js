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

/** Long enough for the verification script to open a window on top. */
const STACKING_DELAY = 12;

function typeName(actor) {
  return actor.constructor?.$gtype?.name ?? '';
}

function isCard(actor) {
  return actor.has_style_class_name?.('claudeland-desktop-card') === true;
}

function actorsWithStyle(root, styleClass) {
  const matches = [];
  const visit = (actor) => {
    if (actor.has_style_class_name?.(styleClass) === true) {
      matches.push(actor);
    }
    for (const child of actor.get_children?.() ?? []) {
      visit(child);
    }
  };
  visit(root);
  return matches;
}

function checkProgressBars(indicator) {
  const expectedFractions = SNAPSHOT.limits.map((limit) => limit.remainingPercent / 100);
  const tracks = actorsWithStyle(indicator.menu.box, 'claudeland-progress-track');
  if (tracks.length !== expectedFractions.length) {
    return [`expected ${expectedFractions.length} progress tracks, found ${tracks.length}`];
  }

  const failures = [];
  for (const [index, track] of tracks.entries()) {
    const fill = track.get_first_child();
    const actualFraction = fill?.width / track.width;
    if (
      !Number.isFinite(actualFraction) ||
      Math.abs(actualFraction - expectedFractions[index]) > 0.01
    ) {
      failures.push(
        `progress ${index} is ${fill?.width ?? 'missing'}/${track.width}px, expected ${expectedFractions[index] * 100}%`,
      );
    }
  }
  return failures;
}

/**
 * Verifies where the card ended up: inside the wallpaper's own container, on
 * top of the wallpaper, with the whole container below every window.
 *
 * Being a sibling of the window actors is not good enough. Mutter restacks the
 * window group on every stacking change and moves the actors it owns around
 * any foreign child, which floats the card above the windows. Only a window
 * that appears after the card is built can catch that, so a missing window is
 * reported as a failure rather than silently passing.
 */
function checkStacking() {
  const siblings = global.window_group.get_children();
  const groups = siblings.filter((child) => typeName(child) === 'MetaBackgroundGroup');
  if (groups.length === 0) {
    return ['the wallpaper group was not found in the window group'];
  }

  const owner = groups.find((group) => group.get_children().some(isCard));
  if (!owner) {
    return [
      siblings.some(isCard)
        ? 'the desktop card is a sibling of the window actors instead of a child of the wallpaper group'
        : 'the desktop card was not added to the wallpaper group',
    ];
  }

  const failures = [];
  const children = owner.get_children();
  console.log(`CLAUDELAND UI LAYERS: ${children.map(typeName).join(',')}`);
  if (children.length < 2) {
    failures.push(
      'the wallpaper group holds no wallpaper actor, so the card layering is unverifiable',
    );
  }
  if (!isCard(children[children.length - 1])) {
    failures.push(
      `the desktop card is not on top of the wallpaper (${children.map(typeName).join(',')})`,
    );
  }

  const groupIndex = siblings.indexOf(owner);
  const windowIndexes = siblings
    .map((child, index) => (typeName(child).startsWith('MetaWindowActor') ? index : -1))
    .filter((index) => index >= 0);
  if (windowIndexes.length === 0) {
    failures.push('no window appeared, so the card stacking could not be verified');
  } else if (groupIndex > Math.min(...windowIndexes)) {
    failures.push(
      `the desktop card is not below application windows (wallpaper group ${groupIndex}, windows ${windowIndexes.join(',')})`,
    );
  }
  return failures;
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

  _progressTimeoutId = null;

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

      indicator.menu.open();
      this._progressTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
        this._progressTimeoutId = null;
        failures.push(...checkProgressBars(indicator));
        indicator.menu.close();
        return GLib.SOURCE_REMOVE;
      });
    } catch (error) {
      failures.push(String(error));
    }

    // The stacking is only observable once a window has appeared after the card
    // was built, so the check waits for the verification script to open one.
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
    if (this._progressTimeoutId) {
      GLib.Source.remove(this._progressTimeoutId);
      this._progressTimeoutId = null;
    }
    if (this._timeoutId) {
      GLib.Source.remove(this._timeoutId);
      this._timeoutId = null;
    }
  }
}
