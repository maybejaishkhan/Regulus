import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';

export const PreferencesWindow = GObject.registerClass(
    {
        GTypeName: 'RegulusPreferencesWindow',
    },
    class PreferencesWindow extends Adw.PreferencesWindow {
        constructor(application) {
            super({
                transient_for: application.active_window,
                default_width: 460,
                default_height: 420,
                search_enabled: true,
            });

            const page = new Adw.PreferencesPage({
                title: 'General',
                icon_name: 'preferences-system-symbolic',
            });

            page.add(this._appearanceGroup(application));
            page.add(this._shortcutsGroup(application));

            this.add(page);
        }

        _appearanceGroup(application) {
            const group = new Adw.PreferencesGroup({
                title: 'Appearance',
                description: 'How Regulus looks on your screen.',
            });

            const darkRow = new Adw.SwitchRow({
                title: 'Dark mode',
                subtitle: 'Use the dark color scheme',
            });
            darkRow.active = application.settings.darkMode;
            darkRow.connect('notify::active', () => {
                application.settings.darkMode = darkRow.active;
            });

            group.add(darkRow);
            return group;
        }

        _shortcutsGroup(application) {
            const group = new Adw.PreferencesGroup({
                title: 'Keyboard shortcuts',
            });

            const row = new Adw.ActionRow({
                title: 'Show all keyboard shortcuts',
                activatable: true,
            });
            row.add_suffix(new Gtk.Image({
                icon_name: 'go-next-symbolic',
                css_classes: ['dim-label'],
            }));
            row.connect('activated', () => {
                application.activate_action('shortcuts', null);
            });

            group.add(row);
            return group;
        }
    }
);
