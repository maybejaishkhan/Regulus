import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';
import Pango from 'gi://Pango';
import Adw from 'gi://Adw?version=1';

import { RESOURCE_PATH } from '../app/config.js';
import { AppsPage } from './apps_page.js';
import { SetupWindow } from './setup_window.js';
import { VmOverview } from './vm_overview.js';

export const RegulusWindow = GObject.registerClass(
    {
        GTypeName: 'RegulusWindow',
        Template: `resource://${RESOURCE_PATH}/window.ui`,
        InternalChildren: [
            'toast_overlay',
            'split_view',
            'sidebar_stack',
            'vm_list',
            'new_vm_button',
            'sidebar_create_button',
            'content_stack',
            'sidebar_toggle',
            'prereq_banner',
        ],
    },
    class RegulusWindow extends Adw.ApplicationWindow {
        constructor(application) {
            super({ application });

            this._controller = application.vm;
            this._selected = null;

            this._overview = new VmOverview(this._controller);
            this._connectOverview();

            this._new_vm_button.connect('clicked', () => this._showSetup({ startPage: 'checks' }));
            this._sidebar_create_button.connect('clicked', () => this._showSetup({ startPage: 'checks' }));
            this._sidebar_toggle.bind_property(
                'active',
                this._split_view,
                'show_sidebar',
                GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE,
            );
            this._prereq_banner.connect('button-clicked', () => this._showSetup({ startPage: 'checks' }));

            const condition = Adw.BreakpointCondition.parse('(max-width: 720px)');
            if (condition !== null) {
                const breakpoint = new Adw.Breakpoint({ condition });
                breakpoint.add_setter(this._split_view, 'collapsed', true);
                this.add_breakpoint(breakpoint);
            }

            this._vm_list.connect('row-selected', (list, row) => {
                this._select(row?.vmName ?? null);
            });

            this.refresh();
        }

        _connectOverview() {
            this._overview.connect('request-state', (self, name, run) => this._setState(name, run));
            this._overview.connect('request-desktop', (self, name) => this._openDesktop(name));
            this._overview.connect('request-web-console', (self, name) => this._openWebConsole(name));
            this._overview.connect('request-apps', (self, name) => this._showApps(name));
            this._overview.connect('request-delete', (self, name) => this._confirmDelete(name));
        }

        toast(text) {
            this._toast_overlay.add_toast(new Adw.Toast({ title: text }));
        }

        async refresh() {
            let vms = [];
            try {
                vms = await this._controller.listVms();
            } catch (error) {
                this.toast(`Could not list VMs: ${error.message}`);
            }

            this._renderSidebar(vms);
            this._syncSelection(vms);
            this._refreshPrereqs();

            if (!this.application.settings.onboardingDone) {
                if (!this._startedOnboarding) {
                    this._startedOnboarding = true;
                    this._offeredSetup = true;
                    this._showSetup({ startPage: 'welcome' });
                }
            } else if (vms.length === 0 && !this._offeredSetup) {
                this._offeredSetup = true;
                this._showSetup({ startPage: 'checks' });
            }
        }

        async _refreshPrereqs() {
            if (this._prereqBusy)
                return;
            this._prereqBusy = true;

            try {
                const result = await this._controller.checkRequirements();
                const missing = result.checks
                    .filter((check) => !check.ok && check.severity === 'error')
                    .map((check) => check.label);
                this._prereq_banner.revealed = missing.length > 0;
                this._prereq_banner.title = missing.length > 0
                    ? `Missing prerequisites: ${missing.join(', ')}`
                    : '';
            } catch (error) {
                this._prereq_banner.revealed = false;
            } finally {
                this._prereqBusy = false;
            }
        }

        _renderSidebar(vms) {
            for (const row of this._rows?.values() ?? [])
                this._vm_list.remove(row);

            this._rows = new Map();

            for (const vm of vms) {
                const row = this._buildRow(vm);
                this._vm_list.append(row);
                this._rows.set(vm.name, row);
            }

            this._sidebar_stack.visible_child_name = vms.length === 0 ? 'empty' : 'list';
        }

        _buildRow(vm) {
            const row = new Gtk.ListBoxRow({ activatable: true });
            row.vmName = vm.name;

            const box = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 6,
                margin_top: 6,
                margin_bottom: 6,
                margin_start: 6,
                margin_end: 6,
            });

            const labels = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, hexpand: true });
            labels.append(new Gtk.Label({
                label: vm.name,
                halign: Gtk.Align.START,
                ellipsize: Pango.EllipsizeMode.END,
            }));
            labels.append(new Gtk.Label({
                label: vm.running ? 'Running' : 'Stopped',
                halign: Gtk.Align.START,
                css_classes: ['dim-label', 'caption'],
            }));

            const toggle = new Gtk.Button({
                icon_name: vm.running ? 'media-playback-stop-symbolic' : 'media-playback-start-symbolic',
                tooltip_text: vm.running ? 'Stop' : 'Start',
                valign: Gtk.Align.CENTER,
                css_classes: ['flat'],
            });
            toggle.connect('clicked', () => this._setState(vm.name, !vm.running));

            box.append(labels);
            box.append(toggle);
            row.set_child(box);

            return row;
        }

        _syncSelection(vms) {
            if (vms.length === 0) {
                this._select(null);
                return;
            }

            const stillThere = vms.some((vm) => vm.name === this._selected);
            if (!stillThere)
                this._select(vms[0].name);
            else
                this._select(this._selected);
        }

        async _select(name) {
            this._selected = name;

            if (name === null) {
                this._overview.clear();
                this._content_stack.visible_child_name = 'empty';
                return;
            }

            const vm = await this._controller.getVm(name);
            if (vm === null) {
                this._content_stack.visible_child_name = 'empty';
                return;
            }

            this._ensureOverviewPage();
            this._content_stack.visible_child_name = 'overview';
            this._overview.setVm(vm);

            const row = this._rows?.get(name);
            if (row && this._vm_list.get_selected_row() !== row)
                this._vm_list.select_row(row);
        }

        _ensureOverviewPage() {
            if (this._overviewPage !== undefined)
                return;
            this._overviewPage = this._content_stack.add_named(this._overview, 'overview');
        }

        async _showApps(name) {
            const page = new AppsPage(this._controller, name, {
                onMessage: (text) => this.toast(text),
            });

            this._appsPage = this._content_stack.add_named(page, 'apps');
            this._content_stack.visible_child_name = 'apps';
            this.toast(`Scanning "${name}" for installed applications…`);
            await page.refresh();
        }

        async _setState(name, run) {
            try {
                if (run)
                    await this._controller.startVm(name);
                else
                    await this._controller.stopVm(name);

                this.toast(`"${name}" is ${run ? 'starting' : 'stopping'}…`);
            } catch (error) {
                this.toast(`Could not ${run ? 'start' : 'stop'} "${name}": ${error.message}`);
            }

            this.refresh();
        }

        _openDesktop(name) {
            this.toast('Opening the Windows desktop…');
            this._controller.openDesktop(name).then((result) => {
                if (!result.ok)
                    this.toast(result.reason);
                this.refresh();
            });
        }

        _openWebConsole(name) {
            Gtk.UriLauncher.new(this._controller.webConsoleUrl(name)).launch(this, null, null);
        }

        _showSetup({ startPage = 'checks' } = {}) {
            const setup = new SetupWindow(this._controller, {
                application: this.application,
                transientFor: this,
                startPage,
            });
            setup.connect('vm-created', (self, name) => {
                this.refresh();
                this._select(name);
                this.toast(`"${name}" created — Windows is installing itself in the VM.`);
            });
            setup.present();
        }

        _confirmDelete(name) {
            const dialog = new Adw.AlertDialog({
                heading: `Delete "${name}"?`,
                body: 'The container and its Windows disk are removed. This cannot be undone.',
            });

            dialog.add_response('cancel', 'Cancel');
            dialog.add_response('delete', 'Delete');
            dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);

            dialog.connect('response', async (self, response) => {
                if (response !== 'delete')
                    return;

                try {
                    await this._controller.removeVm(name);
                    this._selected = null;
                    this.toast(`"${name}" deleted.`);
                } catch (error) {
                    this.toast(`Could not delete "${name}": ${error.message}`);
                }

                this.refresh();
            });

            dialog.present(this);
        }
    }
);