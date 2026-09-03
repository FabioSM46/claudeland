import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';

/**
 * GNOME Shell 45 and later always run against libsoup 3, so the modern build
 * only ever takes the `send_and_read_async` path below. Shell 42 predates the
 * migration and ships on distributions where only the libsoup 2.4 typelib is
 * installed, so the legacy build has to drive the older session API. Both
 * generations expose the same `Soup.Session`, `Soup.Message`, status codes and
 * header objects; only reading the response body differs, so that single
 * difference is isolated here instead of forking the usage client.
 */

// The project types against libsoup 3. The 2.4 surface used below is described
// structurally rather than imported, so the modern build keeps full type
// checking and the legacy path stays explicit about what it relies on.
interface Soup2Session {
  send_async(
    message: Soup.Message,
    cancellable: Gio.Cancellable | null,
    callback: (source: Soup2Session | null, result: Gio.AsyncResult) => void,
  ): void;
  send_finish(result: Gio.AsyncResult): Gio.InputStream;
}

function usesLegacySoup(): boolean {
  return Soup.get_major_version() < 3;
}

export function sendAndRead(session: Soup.Session, message: Soup.Message): Promise<GLib.Bytes> {
  return usesLegacySoup()
    ? sendAndReadSoup2(session as unknown as Soup2Session, message)
    : sendAndReadSoup3(session, message);
}

function sendAndReadSoup3(session: Soup.Session, message: Soup.Message): Promise<GLib.Bytes> {
  return new Promise((resolve, reject) => {
    session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (source, result) => {
      try {
        resolve(source!.send_and_read_finish(result));
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function sendAndReadSoup2(session: Soup2Session, message: Soup.Message): Promise<GLib.Bytes> {
  const stream = await new Promise<Gio.InputStream>((resolve, reject) => {
    session.send_async(message, null, (source, result) => {
      try {
        resolve(source!.send_finish(result));
      } catch (error) {
        reject(error);
      }
    });
  });

  // libsoup 2.4 hands back a stream rather than the finished body, so drain it
  // into memory before the caller inspects the response.
  const body = Gio.MemoryOutputStream.new_resizable();
  await new Promise<void>((resolve, reject) => {
    body.splice_async(
      stream,
      Gio.OutputStreamSpliceFlags.CLOSE_SOURCE | Gio.OutputStreamSpliceFlags.CLOSE_TARGET,
      GLib.PRIORITY_DEFAULT,
      null,
      (source, result) => {
        try {
          source!.splice_finish(result);
          resolve();
        } catch (error) {
          reject(error);
        }
      },
    );
  });

  return body.steal_as_bytes();
}
