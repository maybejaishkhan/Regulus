import GLib from 'gi://GLib';

import { DEFAULT_OPTIONS } from '../../models/vm.js';

const CLIENT_NAMES = ['sdl-freerdp3', 'sdl-freerdp'];

export function resolveFreerdp() {
    for (const name of CLIENT_NAMES) {
        const path = GLib.find_program_in_path(name);
        if (path !== null)
            return { name, path };
    }

    return null;
}

function commonOptions(vm) {
    return [
        `/v:127.0.0.1`,
        `/port:${vm.port ?? DEFAULT_OPTIONS.port}`,
        `/u:${vm.username ?? DEFAULT_OPTIONS.username}`,
        `/p:${vm.password ?? DEFAULT_OPTIONS.password}`,
        '/cert:tofu',
    ];
}

export function buildDesktopArgv(vm, { fullscreen = true, width = 0, height = 0 } = {}) {
    const argv = [
        ...commonOptions(vm),
        '/sound:sys:pulse',
        '/microphone:format:1',
        '/gfx:avc444',
        '+clipboard',
        '/dynamic-resolution',
    ];

    if (width > 0 && height > 0)
        argv.push(`/w:${width}`, `/h:${height}`);
    else if (fullscreen)
        argv.push('/f');

    argv.push(`/t:${vm.name}`);
    return argv;
}

export function buildRemoteAppArgv(vm, app) {
    const argv = [
        ...commonOptions(vm),
        `/app:program:${app.command}`,
        `/app:name:${app.name}`,
        '/sound:sys:pulse',
        '+clipboard',
        '/dynamic-resolution',
        `/t:${app.name}`,
    ];

    if (app.arguments)
        argv.push(`/app:cmdline:${app.arguments}`);

    return argv;
}
