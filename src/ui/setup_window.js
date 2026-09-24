import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';

import { DEFAULT_OPTIONS, WINDOWS_RELEASES } from '../models/vm.js';

export const SetupWindow = GObject.registerClass(
    {
        GTypeName: 'RegulusSetupWindow',
        Signals: {
            'vm-created': { param_types: [GObject.TYPE_STRING] },
        },
    },
    class SetupWindow extends Adw.Window {
        constructor(controller, { application = null, transientFor = null, startPage = 'checks' } = {}) {
            super({
                modal: true,
                title: startPage === 'welcome' ? 'Welcome to Regulus' : 'Create a Windows VM',
                default_width: 560,
                default_height: 720,
                ...(application ? { application } : {}),
                ...(transientFor ? { transient_for: transientFor } : {}),
            });

            this._controller = controller;
            this._application = application;
            this._startPage = startPage;
            this._checks = new Map();

            const toolbarView = new Adw.ToolbarView();
            toolbarView.add_top_bar(new Adw.HeaderBar());

            this._stack = new Gtk.Stack();
            this._stack.add_named(this._pageWelcome(), 'welcome');
            this._stack.add_named(this._pageChecks(), 'checks');
            this._stack.add_named(this._pageForm(), 'form');

            this._toastOverlay = new Adw.ToastOverlay({ child: this._stack });
            toolbarView.set_content(this._toastOverlay);
            this.set_content(toolbarView);

            this._stack.visible_child_name = startPage;
            if (startPage !== 'welcome')
                this._refreshChecks();

            this.connect('close-request', () => {
                this._markOnboardingDone();
                return false;
            });
        }

        _markOnboardingDone() {
            if (this._application)
                this._application.settings.onboardingDone = true;
        }

        _pageWelcome() {
            const box = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 24,
                margin_top: 48,
                margin_bottom: 48,
                margin_start: 24,
                margin_end: 24,
            });

            box.append(new Adw.StatusPage({
                icon_name: 'start-here-symbolic',
                title: 'Welcome to Regulus',
                description: 'Regulus runs Windows on your Linux desktop. ' +
                    'It boots Windows inside a container and streams its desktop and individual apps ' +
                    'straight into your own windows — no dual-boot, no giant VM window.',
            }));

            const actions = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 6,
                halign: Gtk.Align.CENTER,
            });

            const later = new Gtk.Button({ label: 'Not now' });
            later.connect('clicked', () => {
                this._markOnboardingDone();
                this.close();
            });
            actions.append(later);

            const start = new Gtk.Button({
                label: 'Get Started',
                icon_name: 'go-next-symbolic',
                css_classes: ['suggested-action', 'pill'],
            });
            start.connect('clicked', () => {
                this._markOnboardingDone();
                this._stack.visible_child_name = 'checks';
                this._refreshChecks();
            });
            actions.append(start);

            box.append(actions);
            return box;
        }

        _pageChecks() {
            const box = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 12,
                margin_top: 24,
                margin_bottom: 24,
                margin_start: 24,
                margin_end: 24,
            });

            this._heading = new Adw.StatusPage({
                icon_name: 'utilities-system-monitor-symbolic',
                title: 'Getting ready',
                description: 'Regulus needs a container runtime, KVM and the FreeRDP SDL client.',
            });
            box.append(this._heading);

            this._checksGroup = new Adw.PreferencesGroup({ title: 'Prerequisites' });
            for (const [id, title] of [
                ['runtime', 'Container runtime'],
                ['kvm', 'Hardware acceleration'],
                ['freerdp', 'FreeRDP SDL client'],
            ]) {
                const row = new Adw.ExpanderRow({ title, show_enable_switch: false });
                const spinner = new Gtk.Spinner({ spinning: true, valign: Gtk.Align.CENTER });
                row.add_suffix(spinner);
                const detail = new Adw.ActionRow({ title: 'Checking…' });
                row.add_row(detail);

                this._checks.set(id, { row, spinner, detail });
                this._checksGroup.add(row);
            }
            box.append(this._checksGroup);

            this._guidance = new Adw.ActionRow({ title: 'Guidance', visible: false });
            this._copyButton = new Gtk.Button({
                icon_name: 'edit-paste-symbolic',
                tooltip_text: 'Copy the command',
                valign: Gtk.Align.CENTER,
            });
            this._copyButton.connect('clicked', () => {
                if (this._guidanceCommand)
                    this.get_clipboard().set_text(this._guidanceCommand);
            });
            this._guidance.add_suffix(this._copyButton);
            this._checksGroup.add(this._guidance);

            const actions = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 });

            const refresh = new Gtk.Button({ label: 'Check again', icon_name: 'view-refresh-symbolic' });
            refresh.connect('clicked', () => this._refreshChecks());

            this._continueButton = new Gtk.Button({
                label: 'Continue',
                icon_name: 'go-next-symbolic',
                hexpand: true,
                halign: Gtk.Align.END,
                css_classes: ['suggested-action'],
            });
            this._continueButton.connect('clicked', () => { this._stack.visible_child_name = 'form'; });

            actions.append(refresh);
            actions.append(this._continueButton);
            box.append(actions);

            return box;
        }

        _pageForm() {
            this._form = new Adw.PreferencesPage();

            const general = new Adw.PreferencesGroup({
                title: 'Windows',
                description: 'What to install and how to sign in.',
            });

            this._nameRow = new Adw.EntryRow({ title: 'Name' });
            this._nameRow.text = suggestVmName(this._controller);
            general.add(this._nameRow);

            this._releaseRow = new Adw.ComboRow({
                title: 'Windows release',
                model: Gtk.StringList.new(WINDOWS_RELEASES.map((release) => release.label)),
            });
            this._releaseRow.selected = WINDOWS_RELEASES.findIndex(
                (release) => release.value === DEFAULT_OPTIONS.release,
            );
            general.add(this._releaseRow);

            this._usernameRow = new Adw.EntryRow({ title: 'Windows username' });
            this._usernameRow.text = DEFAULT_OPTIONS.username;
            general.add(this._usernameRow);

            this._passwordRow = new Adw.PasswordEntryRow({ title: 'Windows password' });
            this._passwordRow.text = DEFAULT_OPTIONS.password;
            general.add(this._passwordRow);

            this._form.add(general);

            const hardware = new Adw.PreferencesGroup({ title: 'Hardware' });

            this._ramRow = new Adw.SpinRow({
                title: 'Memory (MB)',
                adjustment: new Gtk.Adjustment({
                    lower: 1024, upper: 65536, step_increment: 512, page_increment: 1024,
                    value: DEFAULT_OPTIONS.ramMb,
                }),
            });
            this._cpuRow = new Adw.SpinRow({
                title: 'CPU cores',
                adjustment: new Gtk.Adjustment({
                    lower: 1, upper: 32, step_increment: 1, page_increment: 2, value: DEFAULT_OPTIONS.cpus,
                }),
            });
            this._diskRow = new Adw.SpinRow({
                title: 'Disk size (GB)',
                adjustment: new Gtk.Adjustment({
                    lower: 16, upper: 2048, step_increment: 8, page_increment: 32, value: DEFAULT_OPTIONS.diskGb,
                }),
            });

            hardware.add(this._ramRow);
            hardware.add(this._cpuRow);
            hardware.add(this._diskRow);
            this._form.add(hardware);

            const network = new Adw.PreferencesGroup({
                title: 'Network',
                description: 'Ports on this machine that reach the VM.',
            });

            this._portRow = new Adw.SpinRow({
                title: 'RDP port (TCP and UDP)',
                adjustment: new Gtk.Adjustment({
                    lower: 1024, upper: 65535, step_increment: 1, page_increment: 100,
                    value: DEFAULT_OPTIONS.port,
                }),
            });
            this._webPortRow = new Adw.SpinRow({
                title: 'Web console port',
                subtitle: 'Follow the Windows installation in a browser',
                adjustment: new Gtk.Adjustment({
                    lower: 1024, upper: 65535, step_increment: 1, page_increment: 100,
                    value: DEFAULT_OPTIONS.webPort,
                }),
            });

            network.add(this._portRow);
            network.add(this._webPortRow);
            this._form.add(network);

            const advanced = new Adw.PreferencesGroup({
                title: 'Advanced',
                description: 'Passed straight through to dockur/windows.',
            });

            this._languageRow = new Adw.EntryRow({ title: 'LANGUAGE (e.g. en-US)' });
            this._keyboardRow = new Adw.EntryRow({ title: 'KEYBOARD (e.g. en-US)' });
            this._isoRow = new Adw.EntryRow({ title: 'Local ISO path (/boot.iso)' });
            this._manualRow = new Adw.SwitchRow({ title: 'MANUAL', subtitle: 'Install Windows by hand instead of unattended' });
            this._extraRow = new Adw.EntryRow({ title: 'Extra environment (KEY=VALUE) — one per line' });

            for (const row of [this._languageRow, this._keyboardRow, this._isoRow, this._manualRow, this._extraRow])
                advanced.add(row);

            this._form.add(advanced);

            const create = new Gtk.Button({
                label: 'Create',
                icon_name: 'list-add-symbolic',
                halign: Gtk.Align.END,
                margin_top: 12,
                margin_bottom: 24,
                margin_start: 24,
                margin_end: 24,
                css_classes: ['suggested-action'],
            });
            create.connect('clicked', () => this._create());
            this._createButton = create;

            const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
            box.append(this._form);
            box.append(create);

            const scrolled = new Gtk.ScrolledWindow({ vexpand: true, child: box });
            return scrolled;
        }

        async _refreshChecks() {
            let result;
            try {
                result = await this._controller.checkRequirements();
            } catch (error) {
                this._toast(`Could not check prerequisites: ${error.message}`);
                return;
            }

            for (const check of result.checks) {
                const entry = this._checks.get(check.id);
                if (!entry)
                    continue;

                entry.spinner.spinning = false;
                entry.spinner.visible = false;
                entry.row.subtitle = check.detail;
                entry.detail.title = check.ok ? 'Ready' : (check.hint ?? 'Not available');
                entry.detail.subtitle = !check.ok && check.command ? check.command : '';
                entry.row.remove_css_class('error');
                entry.row.remove_css_class('success');
                entry.row.add_css_class(check.ok ? 'success' : 'error');

                if (entry.fix)
                    entry.fix.visible = !check.ok && Boolean(check.fix);
                else if (!check.ok && check.fix) {
                    entry.fix = new Gtk.Button({
                        label: 'Fix',
                        valign: Gtk.Align.CENTER,
                        css_classes: ['suggested-action'],
                    });
                    entry.fix.connect('clicked', () => this._runFix(check));
                    entry.row.add_suffix(entry.fix);
                }
            }

            const blocked = result.checks.some((check) => check.severity === 'error' && !check.ok);
            this._renderHeading(result.checks, blocked);

            const failing = result.checks.find((check) => check.severity === 'error' && !check.ok)
                ?? result.checks.find((check) => !check.ok);
            this._guidance.visible = blocked && failing !== undefined;
            if (blocked && failing) {
                this._guidance.subtitle = failing.hint ?? '';
                this._guidanceCommand = failing.command;
                this._copyButton.visible = Boolean(failing.command);
            }

            this._continueButton.sensitive = !blocked;
            this._continueButton.label = blocked ? 'Continue' : 'Create My First VM';
            this._continueButton.tooltip_text = blocked
                ? 'Fix the failing prerequisites first'
                : '';
        }

        _renderHeading(checks, blocked) {
            this._heading.remove_css_class('error');
            this._heading.remove_css_class('success');

            if (blocked) {
                const missing = checks
                    .filter((check) => !check.ok && check.severity === 'error')
                    .map((check) => check.label.toLowerCase());
                this._heading.icon_name = 'computer-fail-symbolic';
                this._heading.title = "You're missing essentials";
                this._heading.description = `Regulus needs ${missing.join(' and ')} before it can run Windows here.`;
                this._heading.add_css_class('error');
                return;
            }

            this._heading.icon_name = 'starred-symbolic';
            this._heading.title = "You're all set!";
            this._heading.description = 'Regulus has everything it needs to run Windows on this computer.';
            this._heading.add_css_class('success');
        }

        async _runFix(check) {
            const pkexec = GLib.find_program_in_path('pkexec');
            if (pkexec === null) {
                if (check.fix)
                    this.get_clipboard().set_text(check.fix);
                this._toast('pkexec is not installed — the fix command was copied; run it in a terminal.');
                return;
            }

            this._toast(`Fixing: ${check.label.toLowerCase()}…`);
            try {
                const proc = Gio.Subprocess.new(
                    [pkexec, '/bin/sh', '-c', check.fix],
                    Gio.SubprocessFlags.NONE,
                );
                proc.wait_check_async(null, (source, res) => {
                    try {
                        proc.wait_check_finish(res);
                        this._toast('Fix applied — checking again…');
                    } catch (error) {
                        this._toast(`The fix did not succeed: ${error.message}`);
                    }
                    this._refreshChecks();
                });
            } catch (error) {
                this._toast(`Could not run the fix: ${error.message}`);
            }
        }

        async _create() {
            const name = this._nameRow.text.trim();
            if (name.length === 0) {
                this._toast('Give the VM a name first.');
                return;
            }

            const releaseIndex = Math.max(0, this._releaseRow.selected);
            const release = WINDOWS_RELEASES[releaseIndex]?.value ?? DEFAULT_OPTIONS.release;

            this._createButton.sensitive = false;

            try {
                await this._controller.createVm({
                    onProgress: (message) => this._toast(message),
                    name,
                    release,
                    ramMb: Math.round(this._ramRow.value),
                    cpus: Math.round(this._cpuRow.value),
                    diskGb: Math.round(this._diskRow.value),
                    port: Math.round(this._portRow.value),
                    webPort: Math.round(this._webPortRow.value),
                    username: this._usernameRow.text,
                    password: this._passwordRow.text,
                    language: this._languageRow.text.trim(),
                    keyboard: this._keyboardRow.text.trim(),
                    isoPath: this._isoRow.text.trim(),
                    manual: this._manualRow.active,
                    extraEnv: this._extraRow.text,
                });

                this.emit('vm-created', name);
                this.close();
            } catch (error) {
                this._createButton.sensitive = true;
                this._toast(`Could not create the VM: ${error.message}`);
            }
        }

        _toast(text) {
            this._toastOverlay.add_toast(new Adw.Toast({ title: text }));
        }
    }
);

function suggestVmName(controller) {
    const taken = new Set(controller.profiles().map((profile) => profile.name));
    if (!taken.has('windows'))
        return 'windows';

    for (let i = 2; i < 100; i += 1) {
        if (!taken.has(`windows${i}`))
            return `windows${i}`;
    }

    return 'windows';
}