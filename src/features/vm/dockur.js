import GLib from 'gi://GLib';

import {
    DEFAULT_OPTIONS,
    DOCKUR_IMAGE,
    containerName,
    diskSize,
    parseExtraEnv,
    ramSize,
    volumeName,
} from '../../models/vm.js';

export function dockurEnv(vm) {
    const env = {
        USERNAME: vm.username ?? DEFAULT_OPTIONS.username,
        PASSWORD: vm.password ?? DEFAULT_OPTIONS.password,
        RAM_SIZE: ramSize(vm),
        CPU_CORES: String(vm.cpus ?? DEFAULT_OPTIONS.cpus),
        DISK_SIZE: diskSize(vm),
    };

    if (!vm.isoPath)
        env.VERSION = vm.release ?? DEFAULT_OPTIONS.release;
    if (vm.language)
        env.LANGUAGE = vm.language;
    if (vm.region)
        env.REGION = vm.region;
    if (vm.keyboard)
        env.KEYBOARD = vm.keyboard;
    if (vm.manual)
        env.MANUAL = 'Y';

    return { ...env, ...parseExtraEnv(vm.extraEnv) };
}

export function buildCreateArgs(vm) {
    const args = [
        '-d',
        '--name', containerName(vm.name),
        '--cap-add', 'NET_ADMIN',
        '--restart', 'unless-stopped',
        '--stop-timeout', '120',
        '-p', `${vm.port ?? DEFAULT_OPTIONS.port}:3389/tcp`,
        '-p', `${vm.port ?? DEFAULT_OPTIONS.port}:3389/udp`,
        '-p', `${vm.webPort ?? DEFAULT_OPTIONS.webPort}:8006`,
        '-v', `${volumeName(vm.name)}:/storage`,
    ];

    if (GLib.file_test('/dev/kvm', GLib.FileTest.EXISTS))
        args.push('--device=/dev/kvm');
    if (GLib.file_test('/dev/net/tun', GLib.FileTest.EXISTS))
        args.push('--device=/dev/net/tun');

    for (const [key, value] of Object.entries(dockurEnv(vm)))
        args.push('-e', `${key}=${value}`);

    if (vm.isoPath)
        args.push('-v', `${vm.isoPath}:/boot.iso:ro`);

    return [...args, DOCKUR_IMAGE];
}

export function webConsoleUrl(vm) {
    return `http://127.0.0.1:${vm.webPort ?? DEFAULT_OPTIONS.webPort}/`;
}
