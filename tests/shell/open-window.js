// Opens one plain window inside the verification container.
//
// The desktop card must end up below application windows, and mutter only
// restacks the window group when a window actually appears. A window opened
// after the card is built is therefore the only way to catch a card that
// floats above the windows; this script provides one.
//
// It is test-only: it is never packaged and never runs on a real session.

import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';

Gtk.init();

const window = new Gtk.Window({
  title: `claudeland probe window ${ARGV[0] ?? ''}`.trim(),
  default_width: 400,
  default_height: 300,
});
window.present();

new GLib.MainLoop(null, false).run();
