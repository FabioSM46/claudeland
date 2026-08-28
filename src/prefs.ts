import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const POSITIONS = ['top-right', 'top-left', 'bottom-right', 'bottom-left'] as const;

export default class ClaudelandPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window: Adw.PreferencesWindow): void {
    const settings = this.getSettings();
    const page = new Adw.PreferencesPage({
      title: 'Claudeland',
      icon_name: 'network-transmit-receive-symbolic',
    });
    window.add(page);

    const appearance = new Adw.PreferencesGroup({
      title: 'Aspetto',
      description: 'Scegli dove mostrare la capacità Claude rimanente.',
    });
    page.add(appearance);

    appearance.add(boundSwitch(
      settings,
      'show-panel',
      'Indicatore nel pannello',
      'Mostra le percentuali nella barra superiore di GNOME.',
    ));
    appearance.add(boundSwitch(
      settings,
      'compact-panel',
      'Pannello compatto',
      'Mostra soltanto il limite con meno capacità rimanente.',
    ));
    appearance.add(boundSwitch(
      settings,
      'show-desktop-widget',
      'Card sul desktop',
      'Mostra una card non interattiva sotto le finestre.',
    ));

    const positionRow = new Adw.ComboRow({
      title: 'Posizione card',
      subtitle: 'Angolo del monitor principale.',
      model: Gtk.StringList.new([
        'In alto a destra',
        'In alto a sinistra',
        'In basso a destra',
        'In basso a sinistra',
      ]),
    });
    positionRow.selected = Math.max(0, POSITIONS.indexOf(
      settings.get_string('desktop-position') as typeof POSITIONS[number],
    ));
    positionRow.connect('notify::selected', () => {
      settings.set_string('desktop-position', POSITIONS[positionRow.selected] ?? 'top-right');
    });
    appearance.add(positionRow);

    const behavior = new Adw.PreferencesGroup({
      title: 'Aggiornamento e soglie',
    });
    page.add(behavior);
    behavior.add(boundSpin(
      settings,
      'refresh-interval',
      'Intervallo di aggiornamento',
      'Minuti tra una richiesta e la successiva.',
      1,
      60,
      1,
    ));
    behavior.add(boundSpin(
      settings,
      'warning-remaining',
      'Avviso capacità rimanente',
      'La percentuale sotto cui usare il colore di avviso.',
      1,
      99,
      1,
    ));
    behavior.add(boundSpin(
      settings,
      'critical-remaining',
      'Capacità critica rimanente',
      'La percentuale sotto cui usare il colore critico.',
      0,
      98,
      1,
    ));

    const account = new Adw.PreferencesGroup({
      title: 'Account Claude',
      description: 'Il login viene gestito dalla CLI ufficiale Claude Code.',
    });
    page.add(account);

    const loginRow = new Adw.ActionRow({
      title: 'Accedi o rinnova la sessione',
      subtitle: 'Apre il login Claude nel browser tramite Claude Code.',
    });
    const loginButton = new Gtk.Button({
      label: 'Accedi',
      valign: Gtk.Align.CENTER,
      css_classes: ['suggested-action'],
    });
    loginButton.connect('clicked', () => launchLogin());
    loginRow.add_suffix(loginButton);
    loginRow.activatable_widget = loginButton;
    account.add(loginRow);

    const about = new Adw.PreferencesGroup({ title: 'Informazioni' });
    page.add(about);
    const sourceRow = new Adw.ActionRow({
      title: 'Codice sorgente e segnalazioni',
      subtitle: 'github.com/FabioSM46/claudeland',
      activatable: true,
    });
    sourceRow.add_suffix(new Gtk.Image({ icon_name: 'go-next-symbolic' }));
    sourceRow.connect('activated', () => {
      Gtk.show_uri(window, 'https://github.com/FabioSM46/claudeland', 0);
    });
    about.add(sourceRow);
  }
}

function boundSwitch(
  settings: Gio.Settings,
  key: string,
  title: string,
  subtitle: string,
): Adw.SwitchRow {
  const row = new Adw.SwitchRow({ title, subtitle });
  settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
  return row;
}

function boundSpin(
  settings: Gio.Settings,
  key: string,
  title: string,
  subtitle: string,
  lower: number,
  upper: number,
  step: number,
): Adw.SpinRow {
  const adjustment = new Gtk.Adjustment({
    lower,
    upper,
    step_increment: step,
    page_increment: step * 5,
  });
  const row = new Adw.SpinRow({ title, subtitle, adjustment, digits: 0 });
  settings.bind(key, adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
  return row;
}

function launchLogin(): void {
  const candidates: string[][] = [
    ['kgx', '--', 'claude', 'auth', 'login', '--claudeai'],
    ['gnome-terminal', '--', 'claude', 'auth', 'login', '--claudeai'],
    ['x-terminal-emulator', '-e', 'claude', 'auth', 'login', '--claudeai'],
  ];

  for (const argv of candidates) {
    try {
      Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
      return;
    } catch {
      // Try the next terminal available in this desktop environment.
    }
  }
}
