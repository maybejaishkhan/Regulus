import { RegulusApplication } from './app/application.js';
import { runCommand } from './cli.js';

export async function main(argv) {
    const command = await runCommand(argv);
    if (command.handled)
        return command.exitCode;

    return new RegulusApplication().runAsync(argv);
}
