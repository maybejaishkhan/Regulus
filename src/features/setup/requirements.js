import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { resolveFreerdp } from '../vm/freerdp.js';

export function detectDistro() {
    let text = '';
    const file = Gio.File.new_for_path('/etc/os-release');
    if (file.query_exists(null)) {
        try {
            const [, bytes] = file.load_contents(null);
            text = new TextDecoder().decode(bytes);
        } catch (error) {
            text = '';
        }
    }

    const fields = {};
    for (const line of text.split('\n')) {
        const eq = line.indexOf('=');
        if (eq > 0)
            fields[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^"|"$/g, '');
    }

    const id = fields.ID ?? 'linux';
    const like = (fields.ID_LIKE ?? '').split(/\s+/).filter((part) => part.length > 0);

    if (['arch', 'archlinux', 'manjaro', 'endeavouros', 'cachyos'].includes(id) || like.includes('arch'))
        return { id, family: 'arch' };
    if (['debian', 'ubuntu', 'linuxmint', 'pop', 'elementary'].includes(id) || like.includes('debian'))
        return { id, family: 'debian' };
    if (['fedora', 'rhel', 'centos', 'rocky', 'almalinux'].includes(id) || like.includes('fedora'))
        return { id, family: 'fedora' };
    if (id.startsWith('opensuse') || ['suse', 'sles'].includes(id) || like.includes('suse'))
        return { id, family: 'suse' };

    return { id, family: 'unknown' };
}

function fixCommands(family) {
    switch (family) {
        case 'arch':
            return {
                runtime: 'pacman -Sy --noconfirm docker && systemctl enable --now docker',
                freerdp: 'pacman -Sy --noconfirm freerdp',
            };
        case 'debian':
            return {
                runtime: 'apt-get update && apt-get install -y docker.io && systemctl enable --now docker',
                freerdp: 'apt-get update && apt-get install -y freerdp3-sdl',
            };
        case 'fedora':
            return {
                runtime: 'dnf install -y docker && systemctl enable --now docker',
                freerdp: 'dnf install -y freerdp',
            };
        case 'suse':
            return {
                runtime: 'zypper --non-interactive install docker && systemctl enable --now docker',
                freerdp: 'zypper --non-interactive install freerdp3',
            };
        default:
            return { runtime: null, freerdp: null };
    }
}

function kvmModule() {
    try {
        const [, bytes] = GLib.file_get_contents('/proc/cpuinfo');
        const text = new TextDecoder().decode(bytes);
        if (/\bvmx\b/.test(text))
            return 'kvm_intel';
        if (/\bsvm\b/.test(text))
            return 'kvm_amd';
    } catch (error) {
        return null;
    }
    return null;
}

export async function collectRequirements({
    engine,
    kvmPath = '/dev/kvm',
    freerdp = resolveFreerdp(),
} = {}) {
    if (!engine)
        throw new Error('collectRequirements: an engine is required');

    const distro = detectDistro();
    const fixes = fixCommands(distro.family);
    const runtime = await engine.negotiateHostRuntime();
    const kvmAvailable = Gio.File.new_for_path(kvmPath).query_exists(null);

    let runtimeFix = fixes.runtime;
    let runtimeHint = 'Install Docker or Podman, then make sure its service is running.';
    const runtimeError = String(runtime.stderr ?? '');

    if (/permission denied/i.test(runtimeError)) {
        runtimeHint = 'Your user cannot reach the container runtime socket — add yourself to its group, then log out and back in.';
        runtimeFix = 'usermod -aG docker $USER';
    } else if (/not running|cannot connect|is the docker daemon running/i.test(runtimeError)) {
        runtimeHint = 'The runtime is installed but its service is not running.';
        runtimeFix = 'systemctl enable --now docker';
    }

    const module = kvmModule();
    const kvmFix = [module !== null ? `modprobe ${module}` : null, 'usermod -aG kvm $USER']
        .filter((part) => part !== null)
        .join('; ');

    const checks = [
        {
            id: 'runtime',
            label: 'Container runtime',
            ok: runtime.ok,
            detail: runtime.ok
                ? `${runtime.name} ${runtime.version}`
                : (runtime.stderr || 'the container runtime is not reachable'),
            severity: 'error',
            hint: runtimeHint,
            command: runtimeFix !== null ? `sudo ${runtimeFix}` : null,
            fix: runtimeFix,
        },
        {
            id: 'kvm',
            label: 'Hardware acceleration (KVM)',
            ok: kvmAvailable,
            detail: kvmAvailable
                ? 'KVM device available'
                : 'No /dev/kvm — Windows would run without hardware acceleration',
            severity: 'warning',
            hint: 'Enable Intel VT-x or AMD-V in your firmware, load the KVM module, and make sure your user is in the kvm group.',
            command: `sudo ${kvmFix}`,
            fix: kvmFix,
        },
        {
            id: 'freerdp',
            label: 'FreeRDP SDL client',
            ok: freerdp !== null,
            detail: freerdp !== null ? freerdp.path : 'Not installed',
            severity: 'error',
            hint: 'Install the FreeRDP 3 SDL client (sdl-freerdp3 / freerdp3-sdl) to open VM desktops and apps.',
            command: fixes.freerdp !== null ? `sudo ${fixes.freerdp}` : null,
            fix: fixes.freerdp,
        },
    ];

    return {
        checks,
        distro,
        allOk: checks.every((check) => check.ok),
        blocked: checks.some((check) => check.severity === 'error' && !check.ok),
    };
}
