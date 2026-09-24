# Regulus

> A **GTK 4 + GJS** (GNOME JavaScript) app for running real Windows apps on
> Linux: the Windows VM lives in a Docker container (via
> [dockur/windows](https://github.com/dockur/windows)), and individual apps are
> streamed to the Wayland desktop with FreeRDP RemoteApp.

The app now implements the first six product phases: a first-run onboarding
wizard that checks prerequisites, an `Adw.OverlaySplitView` shell with a VM
sidebar, a per-VM overview with live container metrics and start/stop/delete,
an applications screen that discovers what is installed inside Windows and can
stream a single app to this desktop (or add it to your application list), and
per-VM automation so a VM can follow Regulus up and down.

> The current state of the project (what's done, doing, and next) lives in
> [`CHECKLIST.md`](CHECKLIST.md); the deep-dive GJS/dockur details are
> preserved in this file's sections below.

## Requirements

- `gjs` ≥ 1.72 (tested with 1.88)
- `gtk4` ≥ 4.4 (`libgtk-4`)
- `libadwaita` ≥ 1.4 (`libadwaita-1`)
- `meson` + `ninja` for the installable build
- at runtime: Docker or Podman, `/dev/kvm`, and the FreeRDP **SDL** client
  (`sdl-freerdp3`) for opening desktops and apps

## Run it (development)

```sh
meson setup build
meson compile -C build
meson devenv -C build ./src/regulus
```

The launcher registers the compiled `.gresource` bundles itself, so no
install step is needed for day-to-day work. (When `MESON_BUILD_ROOT` /
`MESON_SOURCE_ROOT` are set — e.g. under GNOME Builder or `meson test` —
GJS loads the bundles on its own and the launcher's manual registration is
skipped.)

Preferences are persisted with GSettings: the build compiles the schema into
`<build>/data`, which is exactly where GJS points `GSETTINGS_SCHEMA_DIR` for runs
out of a build tree, so a development run stores preferences like an installed
copy.

## Install it

```sh
meson setup build --prefix=/usr
meson compile -C build
sudo meson install -C build
```

### Distribution packages

Packages are built **natively inside each distro's own container**: the
[`packaging/debian/`](packaging/debian) tree with `dpkg-buildpackage`, [`packaging/regulus.spec`](packaging/regulus.spec)
with `rpmbuild`, and [`packaging/PKGBUILD`](packaging/PKGBUILD) with `makepkg`.
The AppImage is bundled with linuxdeploy + the GTK plugin (which also ships
`gjs` and a relocatable launcher). Pushing a `v*` tag runs
`.github/workflows/release.yml`, which spins up the four containers in
parallel, builds each package inside it, and attaches everything to the GitHub
release:

| Format | Artifact | Built with |
| ------ | -------- | ---------- |
| Debian/Ubuntu | `regulus_<version>_amd64.deb` | `dpkg-buildpackage` in a `debian:trixie` container |
| RPM (Fedora/openSUSE/RHEL) | `regulus-<version>-1.noarch.rpm` | `rpmbuild` in a `fedora:latest` container |
| Arch Linux | `regulus-<version>-1-x86_64.pkg.tar.zst` | `makepkg` in an `archlinux:latest` container |
| AppImage | `regulus-<version>-x86_64.AppImage` | linuxdeploy + appimagetool in a `debian:trixie` container |

The distro packages install that distro's native build dependencies (its
`gjs`, `gtk4`/`gtk4-devel`, `libadwaita`/`libadwaita-devel`, …), build the app
and run the validators with meson, then produce a canonical package whose
dependency metadata resolves against that distro's repository — the deb gets
`Depends: gjs (>= 1.72)`, the rpm `Requires: gjs` + `Recommends: docker freerdp`,
the Arch package proper `depends`/`optdepends`. The AppImage is
self-contained (own GTK/Adwaita/gjs runtime) and runs on any 2024+ distro;
Docker and a FreeRDP client still need to be installed on the host as with the
distro packages.

Build all four locally the same way the pipeline does (only needs Docker):

```sh
docker run --rm -v "$PWD:/src" -w /src -e VERSION=1.0.0 \
  debian:trixie bash .github/scripts/build-deb.sh
docker run --rm -v "$PWD:/src" -w /src -e VERSION=1.0.0 \
  fedora:latest bash .github/scripts/build-rpm.sh
docker run --rm -v "$PWD:/src" -w /src -e VERSION=1.0.0 \
  archlinux:latest bash .github/scripts/build-arch.sh
docker run --rm -v "$PWD:/src" -w /src -e VERSION=1.0.0 \
  debian:trixie bash .github/scripts/build-appimage.sh
```

The containers only read the working tree and write the packages into `dist/`
(staging builds happen in `/tmp` inside the container), so nothing in your
tree is modified or left behind.

Docker and the FreeRDP SDL client ship as Recommends/optdepends rather
than hard dependencies — the onboarding screen's **Fix** buttons install
them on the detected distro when they are missing.

Then launch with `regulus` (D-Bus activation is
wired up via `data/service.in`).

## Project structure

```
├── meson.build                  # top-level build definition
├── data/
│   ├── desktop.in               # desktop entry (installed as the app-id .desktop)
│   ├── metainfo.xml.in          # AppStream metadata (installed as the app-id .metainfo.xml)
│   ├── service.in               # D-Bus activation service
│   ├── regulus.gschema.xml  # GSettings schema (dark mode, onboarding)
│   └── icons/hicolor/           # scalable + symbolic app icons
├── packaging/                   # native packaging for all three formats
│   ├── debian/                  # Debian/Ubuntu package (.deb)
│   ├── regulus.spec             # RPM package (.rpm)
│   └── PKGBUILD                 # Arch package
├── .github/                     # release pipeline: builds each format in its own
│   │                            # distro container (see "Distribution packages")
│   ├── workflows/release.yml
│   └── scripts/build-{deb,rpm,arch,appimage}.sh
├── src/                         # ≈ Flutter's lib/
│   ├── main.js                  # entry point: CLI launcher or the application
│   ├── cli.js                   # --open-app / --open-desktop (generated launchers)
│   ├── app/
│   │   ├── application.js       # Adw.Application: actions, toasts, VM lifecycle
│   │   ├── config.js            # APP_ID / name / version / developers
│   │   └── settings.js          # GSettings wrapper (dark mode)
│   ├── core/
│   │   ├── engine.js            # DockerEngine — docker/podman via Gio.Subprocess
│   │   ├── profiles.js          # ProfileStore — per-VM JSON on disk
│   │   ├── launchers.js         # writes/removes host .desktop entries
│   │   └── runtime.js           # findRuntime() — docker/podman on PATH
│   ├── models/
│   │   └── vm.js                # VM profile shape, dockur defaults, releases
│   ├── features/
│   │   ├── setup/requirements.js # prerequisite checks + distro fix commands
│   │   ├── vm/dockur.js         # dockur env/flags, local ISO, web console URL
│   │   ├── vm/freerdp.js        # SDL FreeRDP argv (desktop + RemoteApp)
│   │   ├── vm/vm_controller.js  # lifecycle, metrics, apps, lifecycle automation
│   │   └── apps/discovery.js    # guest app scan (PowerShell) + mock list
│   └── ui/                      # Adw.Preferences*-driven screens + .ui templates
│       ├── window.js/.ui        # split view shell, sidebar, stacks, toasts
│       ├── vm_overview.js       # metrics, open desktop, automation, delete
│       ├── apps_page.js         # search, refresh, RemoteApp, add to applications
│       ├── setup_window.js      # onboarding wizard (welcome, checks, VM form)
│       ├── preferences.js       # dark mode + shortcut to the dialog
│       ├── about-dialog.js      # Adw.AboutDialog
│       └── shortcuts-dialog.js/.ui
├── src/app.in                   # launcher template (compiles to bindir/<app-id>)
├── src/src.gresource.xml        # bundles the JS sources
└── src/data.gresource.xml       # bundles the .ui files
```

## What it does

**Onboarding** — the first run opens a *Welcome* page explaining what Regulus
is, then the prerequisite checks: Docker, KVM and FreeRDP status, each with a
distro-specific **Fix** button (detected from `/etc/os-release` — Arch, Debian,
Fedora or openSUSE) that runs the right package-manager command through
`pkexec`, plus a copyable Guidance row. When nothing error-level fails, the
page turns green — "You're all set!" — and the CTA becomes **Create My First
VM**; the form collects the VM name, Windows release, credentials, RAM/CPU/disk,
RDP + web-console ports, and the dockur/windows passthroughs worth exposing
(`LANGUAGE`, `KEYBOARD`, a local ISO mounted at `/boot.iso`, `MANUAL`, and a
free-form extra-environment box). The release list is dockur's real vocabulary
(`11`, `11l`, `10`, `10e`, `2022`, `xp`, …). On the main window an `AdwBanner`
shows "Missing prerequisites: …" with a *Fix…* button whenever something is
still failing.

**VM sidebar** — every Regulus-managed VM is listed with live running state:
start/stop per row, create from the header, delete with a confirmation in the
overview. Existing `dockurr/windows` containers on the machine are **adopted
automatically** on refresh — including ones Regulus did not create — with their
RDP and web-console ports read from the container's port bindings.

**Header / sidebar behaviour** — the content header bar is laid out
sidebar toggle → *Regulus* → menu → window controls, and the sidebar header
reads *Windows VMs*. The toggle drives `show_sidebar` directly; below 720 px an
`Adw.Breakpoint` collapses the split view so the sidebar opens as an overlay.

**VM overview** — state, CPU, memory, container disk and network sampled from
`docker stats`/`inspect` every few seconds, buttons to open the Windows desktop
(SDL FreeRDP), open the web console (dockur's noVNC installer view), go to
Applications, plus the two automation switches.

**Applications** — scans the guest (Start Menu `.lnk` targets resolved through
PowerShell inside the container) into a searchable list; click a row to stream
that single app to this desktop with FreeRDP RemoteApp, or use the per-row menu
to *Add to the application list* (writes a `.desktop` that calls back into
`Regulus --open-app`) or edit the name/command/arguments first.

## Command line

Generated launchers call back into Regulus, so the host-side integration lives
in one place:

```sh
regulus --open-app <vm> "<app name>"
regulus --open-desktop <vm>
```

Both exit immediately after spawning the FreeRDP client, and work whether or
not the app is already running.

If the VM is stopped, Regulus starts the container first and waits for RDP to
come up before spawning the client (up to two minutes; there is no 3389 listener
to poll during a Windows install — see "RDP readiness" below). The CLI prints
the reason and exits 1 on failure. `docker rm` on delete also force-stops, so
delete-while-running works, and the delete path removes the per-VM launcher
directory along with the container and its volume.

## RDP readiness

Before handing the connection to FreeRDP, `src/core/net.js` does a real RDP
handshake: it sends an **X.224 Connection Request** (`CR`, with the standard
`mstshash=regulus` cookie) and only treats the port as ready when the peer sends
any byte back.

That protocol-level probe is not gold-plating. Docker publishes ports through a
userland proxy that **accepts TCP connections the moment the container starts,
whether or not anything inside is listening** — so a plain "can I connect to
3389?" check succeeds instantly against a Windows image that is still
installing. The first version did exactly that and reported "ready" during
installation; the X.224 handshake fixed it (verified both ways: instant against
a live listener, honest timeout against docker-proxy with nothing behind it).
The timeout message suggests the web console for watching the installer.

## Where things are stored

| What | Where |
| ---- | ----- |
| VM profiles (dockur options, discovered apps) | `~/.local/share/regulus/profiles/<name>.json` |
| Windows disk (dockur `/storage`) | Docker volume `regulus-<name>-storage` |
| Generated app launchers | `~/.local/share/applications/regulus-<vm>-<app>.desktop` |
| Dark mode | GSettings `regulus` |

## Application actions

The primary menu and the shortcuts dialog reference these `app.*` actions
(implemented in `src/app/application.js`):

| Action               | Accelerator | What it does                        |
| -------------------- | ----------- | ----------------------------------- |
| `app.quit`           | `Ctrl+Q`    | Quit the application                |
| `app.preferences`    | `Ctrl+,`    | Open the preferences window         |
| `app.shortcuts`      | `Ctrl+?`    | Open the shortcuts dialog           |
| `app.about`          | —           | Open the about dialog               |

Dark mode is persisted through GSettings (`dark-mode` key in
`data/regulus.gschema.xml`) and survives restarts. That
file name matters: `glib-compile-schemas` only looks for `*.gschema.xml`, so
renaming it to anything else silently turns every preference into a session-only
setting.

## Window layout

`src/ui/window.ui` is an `AdwOverlaySplitView`: the sidebar is an
`AdwNavigationPage` holding the VM list (an `AdwHeaderBar` with the create
button, plus a `GtkStack` that swaps between an empty-status page and the list),
and the content side is a stack of screens. The header-bar toggle binds to
`show-sidebar`, and an `Adw.Breakpoint` at 720 px sets `collapsed`, so on
narrow windows the sidebar opens as an overlay:

| Content stack page | Widget | Built by |
| ------------------ | ------ | -------- |
| `empty` | `AdwStatusPage` | the template |
| `overview` | `VmOverview` (`Adw.PreferencesPage`) | `src/ui/vm_overview.js` |
| `apps` | `AppsPage` (`Adw.PreferencesPage`) | `src/ui/apps_page.js` |

`src/ui/window.js` owns the wiring: it refreshes from the VM controller, builds
one sidebar row per VM, selects a VM when a row is activated, and routes the
overview's `request-*` signals (start/stop, desktop, web console, apps,
delete) to the controller with toast feedback.

### Adding a new screen

1. Add a `GtkStackPage` named after the screen to the `content_stack` in
   `src/ui/window.ui`.
2. Build the screen as its own widget class in `src/ui/` (follow
   `vm_overview.js`: signals for the actions, no direct controller calls from
   the template).
3. In `src/ui/window.js`, add the widget id to `InternalChildren` and a
   `_show<Screen>()` method that adds the page and sets
   `content_stack.visible_child_name`.

## License

GPL-3.0-or-later — see `LICENSE`.