import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';

import { writeAppLauncher } from '../core/launchers.js';

export const AppsPage = GObject.registerClass(
    {
        GTypeName: 'RegulusAppsPage',
    },
    class AppsPage extends Adw.PreferencesPage {
        constructor(controller, vmName, { onMessage = () => {} } = {}) {
            super();

            this._controller = controller;
            this._vmName = vmName;
            this._onMessage = onMessage;
            this._apps = [];

            this._buildHeader();
            this._buildGrid();
        }

        _buildHeader() {
            const group = new Adw.PreferencesGroup();

            this._search = new Gtk.SearchEntry({
                placeholder_text: 'Search applications',
                hexpand: true,
            });
            this._search.connect('search-changed', () => this._applyFilter());

            this._refreshButton = new Gtk.Button({
                icon_name: 'view-refresh-symbolic',
                tooltip_text: 'Scan the VM again',
            });
            this._refreshButton.connect('clicked', () => this.refresh());

            const bar = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 6,
                margin_bottom: 6,
            });
            bar.append(this._search);
            bar.append(this._refreshButton);

            group.add(bar);
            this.add(group);
        }

        _buildGrid() {
            this._appsGroup = new Adw.PreferencesGroup({
                title: 'Applications',
                description: `Programs found in "${this._vmName}". Click one to open it on this desktop.`,
            });

            this.add(this._appsGroup);
        }

        async refresh() {
            this._refreshButton.sensitive = false;

            try {
                this._apps = await this._controller.scanApps(this._vmName);
            } catch (error) {
                this._onMessage(`Could not scan the VM: ${error.message}`);
                this._apps = [];
            } finally {
                this._refreshButton.sensitive = true;
            }

            this._applyFilter();
        }

        _applyFilter() {
            const query = this._search.text.trim().toLowerCase();
            const apps = query.length === 0
                ? this._apps
                : this._apps.filter((app) => app.name.toLowerCase().includes(query));

            this._render(apps);
        }

        _render(apps) {
            for (const row of this._rows ?? [])
                this._appsGroup.remove(row);

            this._rows = [];

            if (apps.length === 0) {
                const row = new Adw.ActionRow({
                    title: this._apps.length === 0 ? 'No applications found' : 'No matches',
                    subtitle: this._apps.length === 0
                        ? 'Windows may still be installing, or the guest is unreachable.'
                        : 'Try a different search term.',
                });
                this._appsGroup.add(row);
                this._rows.push(row);
                return;
            }

            for (const app of apps) {
                const row = this._buildRow(app);
                this._appsGroup.add(row);
                this._rows.push(row);
            }
        }

        _buildRow(app) {
            const row = new Adw.ActionRow({
                title: app.name,
                subtitle: app.command,
                activatable: true,
            });

            const pin = new Gtk.Button({
                icon_name: 'pin-symbolic',
                tooltip_text: 'Add to the application list',
                valign: Gtk.Align.CENTER,
                css_classes: ['flat'],
            });
            pin.connect('clicked', () => this._addToDesktop(app));

            const options = new Gtk.MenuButton({
                icon_name: 'emblem-system-symbolic',
                tooltip_text: 'Options',
                valign: Gtk.Align.CENTER,
                css_classes: ['flat'],
            });
            options.set_popover(this._buildOptions(app));

            row.add_suffix(pin);
            row.add_suffix(options);
            row.connect('activated', () => this._open(app));

            return row;
        }

        _buildOptions(app) {
            const box = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 4,
                margin_top: 6,
                margin_bottom: 6,
                margin_start: 6,
                margin_end: 6,
            });

            for (const [label, handler] of [
                ['Open', () => this._open(app)],
                ['Add to the application list', () => this._addToDesktop(app)],
                ['Edit options…', () => this._edit(app)],
            ]) {
                const button = new Gtk.Button({ label, halign: Gtk.Align.FILL, css_classes: ['flat'] });
                button.connect('clicked', () => handler());
                box.append(button);
            }

            return new Gtk.Popover({ child: box });
        }

        _open(app) {
            this._onMessage(`Opening "${app.name}"…`);
            this._controller.openApp(this._vmName, app).then((result) => {
                if (!result.ok)
                    this._onMessage(result.reason);
            });
        }

        _addToDesktop(app) {
            try {
                const path = writeAppLauncher(this._vmName, app);
                this._onMessage(`"${app.name}" added to your applications (${path}).`);
            } catch (error) {
                this._onMessage(`Could not create the launcher: ${error.message}`);
            }
        }

        _edit(app) {
            const dialog = new Adw.AlertDialog({
                heading: `Options for ${app.name}`,
                body: 'These values are used for the RemoteApp launch and generated launchers.',
            });

            const box = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 6,
                margin_top: 6,
            });

            const name = new Adw.EntryRow({ title: 'Name' });
            name.text = app.name;

            const command = new Adw.EntryRow({ title: 'Program (Windows path)' });
            command.text = app.command;

            const args = new Adw.EntryRow({ title: 'Arguments' });
            args.text = app.arguments ?? '';

            for (const row of [name, command, args])
                box.append(row);

            const group = new Adw.PreferencesGroup();
            group.add(box);
            dialog.extra_child = group;

            dialog.add_response('cancel', 'Cancel');
            dialog.add_response('save', 'Save');
            dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);
            dialog.connect('response', (self, response) => {
                if (response !== 'save')
                    return;

                const updated = {
                    name: name.text.trim() || app.name,
                    command: command.text.trim() || app.command,
                    arguments: args.text.trim(),
                };

                this._controller.saveApp(this._vmName, app, updated);
                this.refresh();
            });

            dialog.present(this);
        }
    }
);