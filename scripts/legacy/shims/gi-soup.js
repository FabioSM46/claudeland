// GNOME Shell moved to libsoup 3 in release 43. Ubuntu 22.04, which carries
// GNOME Shell 42, installs only the libsoup 2.4 typelib by default, so prefer
// libsoup 3 and fall back to 2.4 rather than requiring an extra package. The
// two generations differ only in how a response body is read; see
// src/services/soup-transport.ts.
let loaded = null;

for (const version of ['3.0', '2.4']) {
  try {
    imports.gi.versions.Soup = version;
    loaded = imports.gi.Soup;
    break;
  } catch {
    // Try the next libsoup generation shipped by this distribution.
  }
}

if (loaded === null) {
  throw new Error('Claudeland needs the libsoup 3 or libsoup 2.4 introspection data');
}

export default loaded;
