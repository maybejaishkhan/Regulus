import Gio from 'gi://Gio';

import { DockerEngine } from '../../core/engine.js';
import { ProfileStore } from '../../core/profiles.js';
import { waitForRdp as waitForRdpHandshake } from '../../core/net.js';
import { removeVmLaunchers } from '../../core/launchers.js';
import { CONTAINER_PREFIX, DEFAULT_OPTIONS, assertVmName, containerName, createVmProfile, volumeName } from '../../models/vm.js';
import { collectRequirements } from '../setup/requirements.js';
import { buildCreateArgs, webConsoleUrl } from './dockur.js';
import { buildDesktopArgv, buildRemoteAppArgv, resolveFreerdp } from './freerdp.js';
import { scanApps } from '../apps/discovery.js';

const DEFAULT_RDP_TIMEOUT_MS = 180000;

export class VmController {
    constructor({
        store = new ProfileStore(),
        engine = new DockerEngine(),
        freerdp = resolveFreerdp(),
    } = {}) {
        this.store = store;
        this.engine = engine;
        this.freerdp = freerdp;
        this._clients = new Set();
    }

    checkRequirements() {
        return collectRequirements({ engine: this.engine, freerdp: this.freerdp });
    }

    profiles() {
        return this.store.list()
            .map((name) => this.store.get(name))
            .filter((profile) => profile !== null);
    }

    async adoptExistingVms() {
        if (!this.engine.available)
            return [];

        try {
            const result = await this.engine.containers();
            if (!result.ok)
                return [];

            const imageIdResult = await this.engine.cli([
                'image', 'inspect', 'dockurr/windows:latest', '--format', '{{.Id}}',
            ]);
            const dockurId = imageIdResult.ok ? imageIdResult.stdout.trim() : null;

            const adopted = [];
            for (const container of result.containers) {
                const names = namesOf(container);
                if (names.length === 0)
                    continue;

                const containerId = names[0];
                const image = String(container.Image ?? '');
                let matchesImage = image.includes('dockur');
                if (!matchesImage && dockurId !== null) {
                    const inspect = await this.engine.cli(['inspect', containerId, '--format', '{{.Image}}']);
                    matchesImage = inspect.ok && inspect.stdout.trim() === dockurId;
                }
                if (!matchesImage)
                    continue;
                const profileName = containerId.startsWith(CONTAINER_PREFIX)
                    ? containerId.slice(CONTAINER_PREFIX.length)
                    : containerId;

                try { assertVmName(profileName); }
                catch { continue; }

                if (this.store.get(profileName) !== null)
                    continue;

                const info = await this.engine.inspect(containerId);
                const profile = {
                    ...createVmProfile({
                        name: profileName,
                        port: hostPort(info, '3389/tcp') ?? DEFAULT_OPTIONS.port,
                        webPort: hostPort(info, '8006/tcp') ?? DEFAULT_OPTIONS.webPort,
                    }),
                    container: containerId,
                    adopted: true,
                };
                this.store.save(profile);
                adopted.push(profile);
            }
            return adopted;
        } catch (error) {
            return [];
        }
    }

    _containerOf(name) {
        const profile = this.store.get(name);
        return profile?.container ?? containerName(name);
    }

    async containersByName() {
        const byName = new Map();
        const result = await this.engine.containers();
        if (!result.ok)
            return byName;

        for (const container of result.containers) {
            for (const name of namesOf(container))
                byName.set(name, container);
        }

        return byName;
    }

    async listVms() {
        await this.adoptExistingVms();
        const containers = await this.containersByName();

        return this.profiles().map((profile) => {
            const container = containers.get(profile.container ?? containerName(profile.name)) ?? null;
            return {
                name: profile.name,
                profile,
                container,
                running: container?.State === 'running',
            };
        });
    }

    async getVm(name) {
        const profile = this.store.get(name);
        if (profile === null)
            return null;

        const containers = await this.containersByName();
        const container = containers.get(this._containerOf(name)) ?? null;

        return { name, profile, container, running: container?.State === 'running' };
    }

    async createVm({ onProgress = () => {}, ...options }) {
        if (!this.engine.available)
            throw new Error('No container runtime (docker or podman) was found');

        const profile = createVmProfile(options);

        if (this.store.get(profile.name) !== null)
            throw new Error(`A VM named "${profile.name}" already exists`);

        if (!(await this.engine.hasImage('dockurr/windows:latest'))) {
            onProgress('Downloading the Windows container image (one-time, ~1 GB)');
            await this.engine.pull('dockurr/windows:latest');
        }

        onProgress(`Creating "${profile.name}" — Windows installs itself on first boot`);
        await this.engine.create(buildCreateArgs(profile));

        this.store.save(profile);
        return profile;
    }

    async startVm(name) {
        if (this.store.get(name) === null)
            throw new Error(`Unknown VM "${name}"`);
        await this.engine.start(this._containerOf(name));
    }

    async stopVm(name) {
        if (this.store.get(name) === null)
            throw new Error(`Unknown VM "${name}"`);
        await this.engine.stop(this._containerOf(name));
    }

    async removeVm(name, { volumes = true } = {}) {
        const container = this._containerOf(name);
        let volume = null;

        if (volumes) {
            const info = await this.engine.inspect(container);
            const mount = (info?.Mounts ?? []).find((entry) => entry.Destination === '/storage');
            volume = mount?.Type === 'bind' ? null : (mount?.Name ?? volumeName(name));
        }

        await this.engine.remove(container, { volumes });
        if (volume !== null)
            await this.engine.removeVolume(volume);

        const launchers = removeVmLaunchers(name);
        this.store.remove(name);
        return { launchers };
    }

    async state(name) {
        const info = await this.engine.inspect(this._containerOf(name));
        return {
            running: info?.State?.Running ?? false,
            status: info?.State?.Status ?? 'missing',
            startedAt: info?.State?.StartedAt ?? null,
        };
    }

    async metrics(name) {
        const container = this._containerOf(name);
        const stats = await this.engine.stats(container);
        const info = await this.engine.inspect(container, { size: true });

        return {
            cpu: stats?.CPUPerc ?? null,
            memory: stats?.MemUsage ?? null,
            memoryPercent: stats?.MemPerc ?? null,
            network: stats?.NetIO ?? null,
            blockIo: stats?.BlockIO ?? null,
            disk: info?.SizeRw != null ? formatBytes(info.SizeRw) : null,
            running: info?.State?.Running ?? false,
            status: info?.State?.Status ?? 'missing',
        };
    }

    async recentLogs(name, { tail = 20 } = {}) {
        const result = await this.engine.cli(['logs', '--tail', String(tail), this._containerOf(name)]);
        return `${result.stdout}${result.stderr}`.trim();
    }

    async scanApps(name, { mock = false } = {}) {
        const profile = this.store.get(name);
        if (profile === null)
            throw new Error(`Unknown VM "${name}"`);

        const apps = await scanApps({
            engine: this.engine,
            container: this._containerOf(name),
            mock,
        });

        if (apps.length > 0) {
            profile.apps = apps;
            this.store.save(profile);
            return apps;
        }

        return profile.apps ?? [];
    }

    saveApp(name, app, updated) {
        const profile = this.store.get(name);
        if (profile === null)
            throw new Error(`Unknown VM "${name}"`);

        profile.apps = (profile.apps ?? []).filter((entry) => entry.name !== app.name);
        profile.apps.push(updated);
        this.store.save(profile);
        return updated;
    }

    openDesktop(name, options = {}) {
        const { timeoutMs } = options;
        return this._launch(
            name,
            (profile) => buildDesktopArgv(profile, options),
            { timeoutMs },
        );
    }

    openApp(name, app) {
        return this._launch(name, (profile) => buildRemoteAppArgv(profile, app));
    }

    async waitForRdp(name, { timeoutMs = DEFAULT_RDP_TIMEOUT_MS, intervalMs = 1000 } = {}) {
        const profile = this.store.get(name);
        if (profile === null)
            return false;

        return waitForRdpHandshake('127.0.0.1', profile.port ?? DEFAULT_OPTIONS.port, {
            timeoutMs,
            intervalMs,
        });
    }

    async _launch(name, buildArgv, { boot = true, timeoutMs = DEFAULT_RDP_TIMEOUT_MS } = {}) {
        const profile = this.store.get(name);
        if (profile === null)
            return { ok: false, reason: `Unknown VM "${name}"` };

        const freerdp = this.freerdp ?? resolveFreerdp();
        if (freerdp === null)
            return { ok: false, reason: 'SDL FreeRDP (sdl-freerdp3) is not installed on the host' };

        if (boot && !(await this.state(name)).running) {
            try {
                await this.startVm(name);
            } catch (error) {
                return { ok: false, reason: String(error.message ?? error) };
            }
        }

        if (boot && !(await this.waitForRdp(name, { timeoutMs }))) {
            return {
                ok: false,
                reason: `"${name}" did not answer on RDP port ${profile.port ?? DEFAULT_OPTIONS.port} ` +
                    `within ${Math.round(timeoutMs / 1000)}s — Windows may still be installing; ` +
                    'try again in a few minutes, or open the Web Console to watch the installer',
                started: true,
            };
        }

        try {
            const client = Gio.Subprocess.new(
                [freerdp.path, ...buildArgv(profile)],
                Gio.SubprocessFlags.NONE,
            );
            this._clients.add(client);
            client.wait_check_async(null, () => { this._clients.delete(client); });
            return { ok: true, binary: freerdp.path };
        } catch (error) {
            return { ok: false, reason: String(error.message ?? error) };
        }
    }

    webConsoleUrl(name) {
        const profile = this.store.get(name) ?? { webPort: DEFAULT_OPTIONS.webPort };
        return webConsoleUrl(profile);
    }

    setLifecycle(name, { powerOnWithApp, powerOffWithApp }) {
        const profile = this.store.get(name);
        if (profile === null)
            throw new Error(`Unknown VM "${name}"`);

        profile.powerOnWithApp = Boolean(powerOnWithApp);
        profile.powerOffWithApp = Boolean(powerOffWithApp);
        this.store.save(profile);
        return profile;
    }

    async startLifecycleVms() {
        return this._lifecycle('powerOnWithApp', (name) => this.engine.start(this._containerOf(name)));
    }

    async stopLifecycleVms() {
        return this._lifecycle('powerOffWithApp', (name) => this.engine.stop(this._containerOf(name)));
    }

    async _lifecycle(flag, action) {
        const results = [];
        for (const profile of this.profiles()) {
            if (!profile[flag])
                continue;
            try {
                await action(profile.name);
                results.push({ name: profile.name, ok: true });
            } catch (error) {
                results.push({ name: profile.name, ok: false, error: String(error.message ?? error) });
            }
        }
        return results;
    }
}

function namesOf(container) {
    const raw = container?.Names ?? container?.names ?? '';
    const list = Array.isArray(raw) ? raw : String(raw).split(',');

    return list
        .map((name) => name.trim())
        .filter((name) => name.length > 0)
        .map((name) => (name.startsWith('/') ? name.slice(1) : name));
}

function hostPort(info, key) {
    const entry = info?.HostConfig?.PortBindings?.[key]?.[0]?.HostPort;
    return entry != null ? Number(entry) : null;
}

function formatBytes(bytes) {
    const units = ['B', 'kB', 'MB', 'GB', 'TB'];
    let value = Number(bytes);
    let unit = 0;

    while (value >= 1000 && unit < units.length - 1) {
        value /= 1000;
        unit += 1;
    }

    return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}
