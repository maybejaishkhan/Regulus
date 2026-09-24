import Gio from 'gi://Gio';
import Adw from 'gi://Adw?version=1';

import { APP_ID } from './config.js';

export class Settings {
    constructor() {
        let settings = null;
        try {
            settings = new Gio.Settings({ schema_id: APP_ID });
        } catch (error) {
            console.warn(`Regulus: GSettings schema "${APP_ID}" is unavailable ` + `(${error.message}); preferences will not be persisted.`);
        }
        this._settings = settings;
    }

    get darkMode() {
        return this._settings?.get_boolean('dark-mode') ?? false;
    }

    set darkMode(dark) {
        this._settings?.set_boolean('dark-mode', dark);
        this.applyColorScheme();
    }

    get onboardingDone() {
        return this._settings?.get_boolean('onboarding-done') ?? true;
    }

    set onboardingDone(done) {
        this._settings?.set_boolean('onboarding-done', Boolean(done));
    }

    applyColorScheme() {
        Adw.StyleManager.get_default().color_scheme = this.darkMode ? Adw.ColorScheme.PREFER_DARK : Adw.ColorScheme.PREFER_LIGHT;
    }
}
