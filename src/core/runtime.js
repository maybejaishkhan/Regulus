import GLib from 'gi://GLib';

export const RUNTIMES = ['docker', 'podman'];

export function findRuntime() {
    for (const name of RUNTIMES) {
        const path = GLib.find_program_in_path(name);
        if (path !== null)
            return { name, path };
    }
    return null;
}
