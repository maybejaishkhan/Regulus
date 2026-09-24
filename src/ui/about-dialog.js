import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';

import {
    APP_DESCRIPTION,
    APP_DEVELOPERS,
    APP_ID,
    APP_NAME,
    APP_VERSION,
    APP_WEBSITE,
} from '../app/config.js';

export function showAboutDialog(parent) {
    const dialog = new Adw.AboutDialog({
        application_name: APP_NAME,
        application_icon: APP_ID,
        developer_name: APP_DEVELOPERS[0],
        version: APP_VERSION,
        comments: APP_DESCRIPTION,
        website: APP_WEBSITE,
        developers: APP_DEVELOPERS,
        license_type: Gtk.License.GPL_3_0,
    });

    dialog.present(parent);
}
