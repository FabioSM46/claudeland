import Clutter from 'gi://Clutter';
import St from 'gi://St';

export function setBoxLayoutVertical(layout: St.BoxLayout): void {
  if (layout.find_property('orientation')) {
    layout.set_property('orientation', Clutter.Orientation.VERTICAL);
    return;
  }

  // GNOME Shell 46 predates St.BoxLayout's orientation property.
  layout.set_property('vertical', true);
}
