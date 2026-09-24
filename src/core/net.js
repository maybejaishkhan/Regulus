import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

function sleep(ms) {
    return new Promise((resolve) => {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            resolve();
            return GLib.SOURCE_REMOVE;
        });
    });
}

function connectionRequestPdu() {
    const cookie = 'Cookie: mstshash=regulus\r\n';
    const x224Length = 1 + 5 + cookie.length;
    const total = 4 + 1 + x224Length;
    const pdu = new Uint8Array(total);

    pdu.set([3, 0, (total >> 8) & 0xff, total & 0xff, x224Length, 0xe0, 0, 0, 0, 0, 0], 0);
    for (let i = 0; i < cookie.length; i++)
        pdu[11 + i] = cookie.charCodeAt(i);

    return new GLib.Bytes(pdu);
}

function handshake(host, port, { connectTimeoutMs, responseMs }) {
    return new Promise((resolve) => {
        const client = new Gio.SocketClient({ timeout: Math.max(1, Math.round(connectTimeoutMs / 1000)) });
        let connection = null;
        let responseTimer = 0;
        let done = false;

        const settle = (open) => {
            if (done)
                return;
            done = true;
            if (responseTimer !== 0)
                GLib.Source.remove(responseTimer);
            try {
                connection?.close(null);
            } catch {
            }
            resolve(open);
        };

        client.connect_to_host_async(host, port, null, (self, result) => {
            if (done)
                return;
            try {
                connection = self.connect_to_host_finish(result);
            } catch {
                settle(false);
                return;
            }

            const output = connection.get_output_stream();
            output.write_bytes_async(connectionRequestPdu(), GLib.PRIORITY_DEFAULT, null, (writer, writeResult) => {
                if (done)
                    return;
                try {
                    writer.write_bytes_finish(writeResult);
                } catch {
                    settle(false);
                    return;
                }

                responseTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, responseMs, () => {
                    settle(false);
                    return GLib.SOURCE_REMOVE;
                });

                connection.get_input_stream().read_bytes_async(1, GLib.PRIORITY_DEFAULT, null, (reader, readResult) => {
                    if (done)
                        return;
                    let bytes = null;
                    try {
                        bytes = reader.read_bytes_finish(readResult);
                    } catch {
                        settle(false);
                        return;
                    }
                    settle(bytes !== null && bytes.get_size() > 0);
                });
            });
        });
    });
}

export function waitForRdp(host, port, { timeoutMs = 120000, intervalMs = 1000, connectTimeoutMs = 4000, responseMs = 8000 } = {}) {
    return new Promise((resolve) => {
        const deadline = GLib.get_monotonic_time() + timeoutMs * 1000;
        let settled = false;

        const finish = (open) => {
            settled = true;
            resolve(open);
        };

        (async () => {
            while (!settled) {
                if (GLib.get_monotonic_time() >= deadline) {
                    finish(false);
                    return;
                }

                if (await handshake(host, port, { connectTimeoutMs, responseMs })) {
                    finish(true);
                    return;
                }

                const remainingMs = (deadline - GLib.get_monotonic_time()) / 1000;
                if (remainingMs <= 0) {
                    finish(false);
                    return;
                }
                await sleep(Math.min(intervalMs, remainingMs));
            }
        })();
    });
}

export function isTcpPortOpen(host, port, { timeoutMs = 2000 } = {}) {
    const client = new Gio.SocketClient({ timeout: Math.max(1, Math.round(timeoutMs / 1000)) });

    try {
        const socket = client.connect_to_host(host, port, null);
        socket.close(null);
        return true;
    } catch {
        return false;
    }
}