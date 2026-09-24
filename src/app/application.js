import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Adw from 'gi://Adw?version=1';

import { APP_ID, BUS_ID, RESOURCE_PATH } from './config.js';
import { Settings } from './settings.js';
import { VmController } from '../features/vm/vm_controller.js';
import { RegulusWindow } from '../ui/window.js';
import { PreferencesWindow } from '../ui/preferences.js';
import { showAboutDialog } from '../ui/about-dialog.js';
import { showShortcutsDialog } from '../ui/shortcuts-dialog.js';

export const RegulusApplication = GObject.registerClass(
    { GTypeName: 'RegulusApplication', },
    class RegulusApplication extends Adw.Application {
        constructor() {
            super({
                application_id: BUS_ID,
                flags: Gio.ApplicationFlags.DEFAULT_FLAGS,
                resource_base_path: RESOURCE_PATH,
            });

            this.settings = new Settings();
            this.vm = new VmController();
            this._setupActions();
        }

        async vfunc_startup() {
            super.vfunc_startup();
            this.settings.applyColorScheme();
            const results = await this.vm.startLifecycleVms();
            for (const result of results) {
                if (!result.ok) console.warn(`Could not start "${result.name}": ${result.error}`);
            }
        }

        vfunc_shutdown() {
            this.vm.stopLifecycleVms();
            super.vfunc_shutdown();
        }

        _setupActions() {
            this._addAction('quit', () => { this.quit(); }, ['<Control>q']);
            this._addAction('about', () => { this.showAbout(); });
            this._addAction('preferences', () => { this.showPreferences(); }, ['<Control>comma']);
            this._addAction('shortcuts', () => { this.showShortcuts(); }, ['<Control>question']);
        }

        _addAction(name, handler, accels = null) {
            const action = new Gio.SimpleAction({ name });
            action.connect('activate', handler);
            this.add_action(action);
            if (accels) this.set_accels_for_action(`app.${name}`, accels);
        }

        showToast(text) {
            const window = this.active_window;
            if (window?.toast) window.toast(text);
            else console.warn(`Regulus: ${text}`);
        }

        showAbout() { showAboutDialog(this.active_window); }
        showPreferences() { new PreferencesWindow(this).present(); }
        showShortcuts() { showShortcutsDialog(this.active_window); }

        vfunc_activate() {
            let { active_window } = this;
            if (!active_window) active_window = new RegulusWindow(this);
            active_window.present();
        }
    }
);
