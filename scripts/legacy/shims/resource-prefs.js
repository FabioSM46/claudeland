// The preferences process of GNOME Shell 42 to 44 has no ExtensionPreferences
// class; it calls the module-level init() and fillPreferencesWindow() that the
// legacy build appends. This shim supplies the same base class prefs.ts
// extends in the modern build.
const ExtensionUtils = imports.misc.extensionUtils;

export class ExtensionPreferences {
  constructor() {
    this._extension = ExtensionUtils.getCurrentExtension();
  }

  get metadata() {
    return this._extension.metadata;
  }

  get path() {
    return this._extension.path;
  }

  getSettings(schema) {
    return ExtensionUtils.getSettings(schema);
  }
}

export function gettext(str) {
  return ExtensionUtils.gettext(str);
}
