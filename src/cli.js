import { VmController } from './features/vm/vm_controller.js';

export const USAGE = [
    'Usage:',
    '  --open-app VM APP NAME   Open a Windows app via RemoteApp',
    '  --open-desktop VM        Open the VM desktop',
].join('\n');

export async function runCommand(argv) {
    const args = argv.slice(1);
    const command = args[0];

    if (command !== '--open-app' && command !== '--open-desktop' && command !== '--help')
        return { handled: false };

    if (command === '--help') {
        print(USAGE);
        return { handled: true, exitCode: 0 };
    }

    const controller = new VmController();
    const vm = args[1];

    if (!vm) {
        printerr(`${command} requires a VM name`);
        return { handled: true, exitCode: 2 };
    }

    if (command === '--open-desktop') {
        const result = await controller.openDesktop(vm);
        if (!result.ok)
            printerr(result.reason);
        return { handled: true, exitCode: result.ok ? 0 : 1 };
    }

    const appName = args.slice(2).join(' ').trim();
    const profile = controller.store.get(vm);
    const app = profile?.apps?.find((entry) => entry.name === appName);

    if (!app) {
        printerr(`No application named "${appName}" is recorded for VM "${vm}"`);
        return { handled: true, exitCode: 1 };
    }

    const result = await controller.openApp(vm, app);
    if (!result.ok)
        printerr(result.reason);

    return { handled: true, exitCode: result.ok ? 0 : 1 };
}