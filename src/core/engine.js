import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { findRuntime } from './runtime.js';

export class DockerEngine {
    constructor({ binary = null, sudo = false } = {}) {
        const runtime = binary !== null ? { path: binary, name: 'docker' } : findRuntime();
        this.binary = runtime?.path ?? null;
        this.runtimeName = runtime?.name ?? null;
        this.sudo = sudo;
    }

    get available() { return this.binary !== null; }

    async probeVersion() {
        const result = await this.cli(['version', '--format', '{{.Server.Version}}'], { timeoutMs: 8000 });

        return {
            ok: result.ok && result.stdout.trim().length > 0,
            name: this.runtimeName,
            version: result.stdout.trim() || null,
            stderr: result.stderr.trim() || (result.ok ? 'the runtime did not report a server version' : ''),
        };
    }

    async negotiateHostRuntime() {
        if (!this.available)
            return { ok: false, name: null, version: null, stderr: 'no container runtime installed' };

        const primary = await this.probeVersion();
        if (primary.ok)
            return primary;

        const fallbackName = this.runtimeName === 'docker' ? 'podman' : 'docker';
        const fallbackPath = GLib.find_program_in_path(fallbackName);
        if (fallbackPath === null)
            return primary;

        const savedBinary = this.binary;
        const savedName = this.runtimeName;
        this.binary = fallbackPath;
        this.runtimeName = fallbackName;

        const fallback = await this.probeVersion();
        if (fallback.ok)
            return fallback;

        this.binary = savedBinary;
        this.runtimeName = savedName;
        return primary;
    }

    _argv(args) {
        return [...(this.sudo ? ['sudo'] : []), this.binary, ...args];
    }

    cli(args, { timeoutMs = 12000 } = {}) {
        if (!this.available) return Promise.resolve({ ok: false, status: -1, stdout: '', stderr: 'no container runtime found' });

        return new Promise((resolve) => {
            let proc;
            let timedOut = false;

            try {
                proc = Gio.Subprocess.new(
                    this._argv(args),
                    Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
                );
            } catch (error) {
                resolve({ ok: false, status: -1, stdout: '', stderr: String(error.message ?? error) });
                return;
            }

            if (timeoutMs > 0) {
                const timeoutId = GLib.timeout_source_new(timeoutMs);
                timeoutId.set_callback(() => {
                    timedOut = true;
                    proc.force_exit();
                });
                timeoutId.attach(null);
            }

            proc.communicate_utf8_async(null, null, (subprocess, result) => {
                try {
                    const [ioOk, stdout, stderr] = subprocess.communicate_utf8_finish(result);
                    const status = subprocess.get_exit_status();
                    resolve({
                        ok: ioOk && status === 0,
                        status,
                        stdout: stdout ?? '',
                        stderr: stderr ? stderr : (timedOut ? 'command timed out after ' + timeoutMs + 'ms' : ''),
                    });
                } catch (error) {
                    resolve({
                        ok: false,
                        status: subprocess.get_exit_status(),
                        stdout: '',
                        stderr: String(error.message ?? error),
                    });
                }
            });
        });
    }

    async version() {
        if (!this.available) return { ok: false, version: null, stderr: 'no container runtime found' };

        const result = await this.cli(['version', '--format', '{{.Server.Version}}']);
        return { ok: result.ok, version: result.stdout.trim() || null, stderr: result.stderr.trim() };
    }

    async containers() {
        const result = await this.cli(['ps', '-a', '--no-trunc', '--format', '{{json .}}']);
        if (!result.ok) return { ok: false, containers: [], stderr: result.stderr.trim() };

        const containers = [];
        for (const line of result.stdout.split('\n')) {
            const trimmed = line.trim();
            if (trimmed.length === 0) continue;
            try { containers.push(JSON.parse(trimmed)); } 
            catch (error) { console.warn(`Skipping unparseable container line: ${error.message}`); }
        }
        return { ok: true, containers, stderr: '' };
    }

    async inspect(name, { size = false } = {}) {
        const result = await this.cli(['inspect', ...(size ? ['--size'] : []), name]);
        if (!result.ok) return null;
        try { return JSON.parse(result.stdout)[0] ?? null; } 
        catch (error) {
            console.warn(`docker inspect ${name} returned unparseable JSON: ${error.message}`);
            return null;
        }
    }

    async stats(name) {
        const result = await this.cli(['stats', '--no-stream', '--format', '{{json .}}', name]);
        if (!result.ok) return null;
        try { return JSON.parse(result.stdout.trim().split('\n')[0]) ?? null; } 
        catch (error) { return null; }
    }

    async hasImage(image) {
        return (await this.cli(['image', 'inspect', image])).ok;
    }

    async pull(image) {
        const result = await this.cli(['pull', image]);
        if (!result.ok) throw new Error(result.stderr.trim() || `could not pull ${image}`);
        return result;
    }

    async create(args) {
        const result = await this.cli(['run', ...args]);
        if (!result.ok) throw new Error(result.stderr.trim() || 'could not create the container');
        return result.stdout.trim();
    }

    async start(name) {
        const result = await this.cli(['start', name]);
        if (!result.ok) throw new Error(result.stderr.trim() || `could not start ${name}`);
    }

    async stop(name) {
        const result = await this.cli(['stop', name]);
        if (!result.ok && !/is not running|No such container/i.test(result.stderr))
            throw new Error(result.stderr.trim() || `could not stop ${name}`);
    }

    async remove(name, { volumes = false } = {}) {
        const result = await this.cli(['rm', '-f', ...(volumes ? ['-v'] : []), name]);
        if (!result.ok && !/no such container/i.test(result.stderr))
            throw new Error(result.stderr.trim() || `could not remove ${name}`);
    }

    async removeVolume(name) {
        const result = await this.cli(['volume', 'rm', name]);
        if (!result.ok && !/no such volume/i.test(result.stderr))
            throw new Error(result.stderr.trim() || `could not remove volume ${name}`);
    }

    async exec(name, argv) { return this.cli(['exec', name, ...argv]); }

    async execOutput(name, argv) {
        const result = await this.cli(['exec', name, ...argv]);
        if (!result.ok) throw new Error(result.stderr.trim() || `command failed inside ${name}`);
        return result.stdout;
    }

    static deviceAvailable(path) { return GLib.file_test(path, GLib.FileTest.EXISTS); }
}
