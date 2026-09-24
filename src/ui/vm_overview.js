import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';

const POLL_SECONDS = 3;

export const VmOverview = GObject.registerClass(
    {
        GTypeName: 'RegulusVmOverview',
        Signals: {
            'request-delete': { param_types: [GObject.TYPE_STRING] },
            'request-apps': { param_types: [GObject.TYPE_STRING] },
            'request-state': { param_types: [GObject.TYPE_STRING, GObject.TYPE_BOOLEAN] },
            'request-desktop': { param_types: [GObject.TYPE_STRING] },
            'request-web-console': { param_types: [GObject.TYPE_STRING] },
        },
    },
    class VmOverview extends Adw.PreferencesPage {
        constructor(controller) {
            super();

            this._controller = controller;
            this._name = null;
            this._sourceId = 0;
            this._rows = {};

            this.add(this._actionsGroup());
            this.add(this._metricsGroup());
            this.add(this._automationGroup());
            this.add(this._dangerGroup());
        }

        _actionsGroup() {
            const group = new Adw.PreferencesGroup({ title: 'Actions' });

            const buttons = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 6,
                margin_top: 6,
                margin_bottom: 6,
            });

            this._toggleButton = new Gtk.Button({
                label: 'Start',
                css_classes: ['suggested-action'],
            });
            this._toggleButton.connect('clicked', () => {
                this.emit('request-state', this._name, !this._running);
            });

            const openButton = new Gtk.Button({ label: 'Open Desktop', icon_name: 'display-symbolic' });
            openButton.connect('clicked', () => this.emit('request-desktop', this._name));

            const appsButton = new Gtk.Button({ label: 'Applications', icon_name: 'view-app-grid-symbolic' });
            appsButton.connect('clicked', () => this.emit('request-apps', this._name));

            this._consoleButton = new Gtk.Button({ label: 'Web Console', icon_name: 'web-browser-symbolic' });
            this._consoleButton.connect('clicked', () => this.emit('request-web-console', this._name));

            buttons.append(this._toggleButton);
            buttons.append(openButton);
            buttons.append(appsButton);
            buttons.append(this._consoleButton);

            group.add(buttons);
            return group;
        }

        _metricsGroup() {
            const group = new Adw.PreferencesGroup({ title: 'Metrics' });

            for (const [id, title] of [
                ['status', 'State'],
                ['cpu', 'CPU'],
                ['memory', 'Memory'],
                ['disk', 'Container disk'],
                ['network', 'Network'],
            ]) {
                const row = new Adw.ActionRow({ title });
                this._rows[id] = row;
                group.add(row);
            }

            return group;
        }

        _automationGroup() {
            const group = new Adw.PreferencesGroup({ title: 'Automation' });

            this._powerOnRow = new Adw.SwitchRow({
                title: 'Start with Regulus',
                subtitle: 'Power this VM on when Regulus opens',
            });
            this._powerOnRow.connect('notify::active', () => this._saveLifecycle());

            this._powerOffRow = new Adw.SwitchRow({
                title: 'Stop with Regulus',
                subtitle: 'Power this VM off when Regulus closes',
            });
            this._powerOffRow.connect('notify::active', () => this._saveLifecycle());

            group.add(this._powerOnRow);
            group.add(this._powerOffRow);
            return group;
        }

        _dangerGroup() {
            const group = new Adw.PreferencesGroup({ title: 'Maintenance' });

            const deleteRow = new Adw.ActionRow({
                title: 'Delete this VM',
                subtitle: 'Removes the container and its Windows disk',
                activatable: true,
            });

            const icon = new Gtk.Image({ icon_name: 'user-trash-symbolic', css_classes: ['error'] });
            deleteRow.add_suffix(icon);
            deleteRow.connect('activated', () => this.emit('request-delete', this._name));

            group.add(deleteRow);
            return group;
        }

        setVm(vm) {
            this._name = vm.name;
            this._powerOnRow.active = Boolean(vm.profile.powerOnWithApp);
            this._powerOffRow.active = Boolean(vm.profile.powerOffWithApp);

            this._apply(vm);
            this._startPolling();
            this._poll();
        }

        clear() {
            this._name = null;
            this._stopPolling();
        }

        _saveLifecycle() {
            if (this._name === null)
                return;

            this._controller.setLifecycle(this._name, {
                powerOnWithApp: this._powerOnRow.active,
                powerOffWithApp: this._powerOffRow.active,
            });
        }

        _startPolling() {
            this._stopPolling();
            this._sourceId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, POLL_SECONDS, () => {
                this._poll();
                return GLib.SOURCE_CONTINUE;
            });
        }

        _stopPolling() {
            if (this._sourceId !== 0) {
                GLib.Source.remove(this._sourceId);
                this._sourceId = 0;
            }
        }

        async _poll() {
            const name = this._name;
            if (name === null)
                return;

            const vm = await this._controller.getVm(name);
            if (vm === null || this._name !== name)
                return;

            this._apply(vm);

            const metrics = await this._controller.metrics(name);
            if (this._name !== name)
                return;

            for (const key of ['cpu', 'disk', 'network'])
                this._rows[key].subtitle = metrics[key] ?? '—';

            this._rows.memory.subtitle = metrics.memory
                ? `${metrics.memory} (${metrics.memoryPercent})`
                : '—';
        }

        _apply(vm) {
            this._running = vm.running;
            this._rows.status.subtitle = vm.running ? 'Running' : 'Stopped';

            this._toggleButton.label = vm.running ? 'Stop' : 'Start';
            this._toggleButton.remove_css_class('suggested-action');
            this._toggleButton.remove_css_class('destructive-action');
            this._toggleButton.add_css_class(vm.running ? 'destructive-action' : 'suggested-action');

            this._consoleButton.sensitive = vm.running;
        }
    }
);
