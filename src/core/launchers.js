import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { APP_ID, APP_NAME } from '../app/config.js';

export function launcherDir() { return GLib.build_filenamev([GLib.get_user_data_dir(), 'applications']); }
export function launcherFileName(vmName, appName) { return `${APP_ID}-${vmName}-${slug(appName)}.desktop`; }
export function launcherCommand(vmName, appName) {
    const binary = GLib.find_program_in_path(APP_ID) ?? APP_ID;
    return `${escapeExecArg(binary)} --open-app ${escapeExecArg(vmName)} ${escapeExecArg(appName)}`;
}

export function escapeExecArg(text) {
    const escaped = String(text)
        .replaceAll('\\', '\\\\')
        .replaceAll('"', '\\"')
        .replaceAll('`', '\\`')
        .replaceAll('$', '\\$')
        .replace(/%(?![fFuUdDnNickvm])/g, '%%');
    return `"${escaped}"`;
}

export function escapeValue(text) { return String(text).replace(/[\n\r\t]/g, ' ').trim(); }
export function buildLauncherEntry(vmName, app) {
    return [
        '[Desktop Entry]',
        'Type=Application',
        `Name=${escapeValue(app.name)}`,
        `Comment=${escapeValue(`${APP_NAME}: ${app.command}`)}`,
        `Exec=${launcherCommand(vmName, app.name)}`,
        `Icon=${APP_ID}`,
        'Terminal=false',
        'Categories=Utility;',
        'StartupNotify=true',
        `X-Regulus-VM=${escapeValue(vmName)}`,
        `X-Regulus-Command=${escapeValue(app.command)}`,
        '',
    ].join('\n');
}

export function writeAppLauncher(vmName, app) {
    const dir = Gio.File.new_for_path(launcherDir());
    if (!dir.query_exists(null)) dir.make_directory_with_parents(null);
    const file = dir.get_child(launcherFileName(vmName, app.name));
    file.replace_contents(buildLauncherEntry(vmName, app), null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    return file.get_path();
}

export function removeAppLauncher(vmName, appName) {
    const file = Gio.File.new_for_path(GLib.build_filenamev([launcherDir(), launcherFileName(vmName, appName)]));
    if (file.query_exists(null)) file.delete(null);
}

export function launcherPrefix(vmName) { return `${APP_ID}-${vmName}-`; }

export function listVmLaunchers(vmName) {
    const dir = Gio.File.new_for_path(launcherDir());
    if (!dir.query_exists(null)) return [];

    const enumerator = dir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
    const prefix = launcherPrefix(vmName);
    const paths = [];

    for (let info = enumerator.next_file(null); info !== null; info = enumerator.next_file(null)) {
        const base = info.get_name();
        if (base.startsWith(prefix) && base.endsWith('.desktop')) paths.push(dir.get_child(base).get_path());
    }
    enumerator.close(null);
    return paths.sort();
}

export function removeVmLaunchers(vmName) {
    const removed = [];

    for (const path of listVmLaunchers(vmName)) {
        const file = Gio.File.new_for_path(path);
        if (!file.query_exists(null)) continue;
        file.delete(null);
        removed.push(path);
    }
    return removed;
}

function slug(text) {
    return String(text)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'app';
}