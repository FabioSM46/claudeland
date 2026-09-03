// GNOME Shell 42 to 44 expose ui/main.js through the legacy importer instead of
// a resource:// module. Only the members Claudeland uses are re-exported, so
// the legacy surface stays as small and reviewable as the modern import.
const Main = imports.ui.main;

export const panel = Main.panel;

export const layoutManager = Main.layoutManager;

export const notifyError = Main.notifyError;
