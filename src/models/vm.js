export const CONTAINER_PREFIX = 'regulus-';
export const DOCKUR_IMAGE = 'dockurr/windows:latest';

export const WINDOWS_RELEASES = [
    { value: '11', label: 'Windows 11 Pro' },
    { value: '11l', label: 'Windows 11 LTSC' },
    { value: '11e', label: 'Windows 11 Enterprise' },
    { value: '10', label: 'Windows 10 Pro' },
    { value: '10l', label: 'Windows 10 LTSC' },
    { value: '10e', label: 'Windows 10 Enterprise' },
    { value: '2022', label: 'Windows Server 2022' },
    { value: '2019', label: 'Windows Server 2019' },
    { value: '2016', label: 'Windows Server 2016' },
    { value: '8e', label: 'Windows 8.1 Enterprise' },
    { value: '7u', label: 'Windows 7 Ultimate' },
    { value: 'xp', label: 'Windows XP Professional' },
];

export const DEFAULT_OPTIONS = {
    release: '11',
    ramMb: 4096,
    cpus: 2,
    diskGb: 64,
    port: 3389,
    webPort: 8006,
    username: 'Docker',
    password: 'admin',
    language: '',
    region: '',
    keyboard: '',
    isoPath: '',
    manual: false,
    extraEnv: '',
    powerOnWithApp: false,
    powerOffWithApp: false,
};

const NAME_RE = /^[a-zA-Z0-9._-]+$/;

export function assertVmName(name) {
    if (typeof name !== 'string' || !NAME_RE.test(name))
        throw new Error(`Invalid VM name: ${JSON.stringify(name)} (allowed: A-Za-z0-9._-)`);
    return name;
}

export function containerName(name) {
    return CONTAINER_PREFIX + assertVmName(name);
}

export function volumeName(name) {
    return `${containerName(name)}-storage`;
}

export function createVmProfile({ name, ...options }) {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    return {
        name: assertVmName(name),
        release: opts.release,
        ramMb: Math.round(opts.ramMb),
        cpus: Math.round(opts.cpus),
        diskGb: Math.round(opts.diskGb),
        port: Math.round(opts.port),
        webPort: Math.round(opts.webPort),
        username: opts.username,
        password: opts.password,
        language: opts.language,
        region: opts.region,
        keyboard: opts.keyboard,
        isoPath: opts.isoPath,
        manual: Boolean(opts.manual),
        extraEnv: opts.extraEnv,
        powerOnWithApp: Boolean(opts.powerOnWithApp),
        powerOffWithApp: Boolean(opts.powerOffWithApp),
        createdAt: new Date().toISOString(),
    };
}

export function ramSize(vm) {
    const mb = vm.ramMb ?? DEFAULT_OPTIONS.ramMb;
    return mb % 1024 === 0 ? `${mb / 1024}G` : `${mb}M`;
}

export function diskSize(vm) {
    return `${vm.diskGb ?? DEFAULT_OPTIONS.diskGb}G`;
}

export function parseExtraEnv(text) {
    const env = {};
    for (const line of String(text ?? '').split('\n')) {
        const trimmed = line.trim();
        if (trimmed.length === 0 || trimmed.startsWith('#'))
            continue;
        const eq = trimmed.indexOf('=');
        if (eq < 1)
            throw new Error(`Extra environment must be KEY=VALUE, got: ${trimmed}`);
        env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    return env;
}

export function releaseLabel(value) {
    return WINDOWS_RELEASES.find((release) => release.value === value)?.label ?? `Windows ${value}`;
}
