import Gtk from 'gi://Gtk?version=4.0';

import { RESOURCE_PATH } from '../app/config.js';

export function showShortcutsDialog(parent) {
    const builder = Gtk.Builder.new_from_resource(`${RESOURCE_PATH}/shortcuts-dialog.ui`);
    const dialog = builder.get_object('shortcuts_dialog');

    dialog.present(parent);
}
