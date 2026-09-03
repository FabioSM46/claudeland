// The Extension base class arrived with the ES module port in GNOME Shell 45.
// Reproduce exactly the members Claudeland uses on top of the legacy
// ExtensionUtils helpers, so extension.ts stays identical in both builds.
const ExtensionUtils = imports.misc.extensionUtils;

export class Extension {
  constructor() {
    this._extension = ExtensionUtils.getCurrentExtension();
  }

  get uuid() {
    return this._extension.metadata.uuid;
  }

  get metadata() {
    return this._extension.metadata;
  }

  get path() {
    return this._extension.path;
  }

  get dir() {
    return this._extension.dir;
  }

  getSettings(schema) {
    return ExtensionUtils.getSettings(schema);
  }

  openPreferences() {
    ExtensionUtils.openPrefs();
  }
}

export function gettext(str) {
  return ExtensionUtils.gettext(str);
}
