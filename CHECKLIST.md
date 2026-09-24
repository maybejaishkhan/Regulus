# Regulus — Checklist (Kanban)

The kanban view of where Regulus stands. It condenses the long-form audit
log that got the app here (the phases and rounds 1–13 are preserved in git
history) and the finer details live in [`README.md`](README.md).

---

## 📋 To do

1. **Fix the guided-fix `$USER` bug** — `requirements.js` builds 
   `usermod -aG docker $USER` / `kvm $USER`, but the Fix button runs it via
   `pkexec /bin/sh -c …` (as root), so `$USER` expands to `root`, adding the
   *wrong* user to the group. Use `$PKEXEC_USER` (set by pkexec) for the
   root-side command, keep `$USER` only for the copyable user-side guidance.
2. **Reuse the Apps page** — `window.js` `_showApps()` pushes a fresh
   `apps` page onto `content_stack` on every open and never removes the old
   one; repeated opens leave orphan pages in the stack. Keep one `AppsPage`
   and re-point it at the selected VM.
3. **Race in `window.js` `_select()`** — it's async with no sequence token;
   rapidly clicking sidebar rows can resolve out of order and show the wrong
   VM. Add a monotonically increasing token or cancel stale loads.
4. **Validate the local ISO path** before `docker run -v path:/boot.iso:ro`
   — a typo only surfaces later as a daemon error. Check the file exists in
   the form and give a clear message.
5. **Manual installs vs the RDP wait** — with `MANUAL=Y` the auto-start
   RDP wait (120–180 s) will always time out while the installer is paused;
   branch on `manual` and instead direct the user to the Web Console.
6. **Store VM passwords with libsecret** — the Windows password is saved
   in plaintext in `~/.local/share/regulus/profiles/<vm>.json`. Use
   `libsecret` (GNOME Keyring) or at minimum tighten the profiles dir perms.
7. **Ensure `docker stop` survives shutdown** — `vfunc_shutdown()` calls
   `stopLifecycleVms()` without awaiting; the process can exit before the
   stop completes (stop-timeout is 120 s). Hold the app during shutdown or
   do the stop in a detached, awaited path.
8. **Cache the dockur image-id lookup** — `adoptExistingVms()` runs
   `docker image inspect dockurr/windows` on every `listVms()` (every
   refresh). Remember the id per session and only re-check on demand.
9. **Single source for the VM-name regex** — `NAME_RE` is duplicated in
   `core/profiles.js` and `models/vm.js`; also add a `schemaVersion` field
   to profile JSON so future settings migrations are safe.
10. **`--version` + stale fallback** — `config.js` still falls back to
    `'0.0.1'`; make it derive from the build and add a `--version` CLI flag
    alongside `--help`.
11. **Add PNG icon sizes** (48/128/256) — only the scalable SVG (and its
    symbolic twin) is installed today; size-tagged PNGs help some launchers
    and older icon themes.
12. **Restore automated tests** — no test suite exists yet. Port the earlier
    iteration's suites, add a PR job that runs `meson test` and a GJS
    parse/lint pass, so packaging CI isn't the only gate.
13. **App icons per discovered app** — the Apps page and generated
    launchers still use the Regulus icon; extract the real icon from the
    guest (`%SystemRoot%\installedapps` / `.exe` resources) as phase 4
    originally planned.

## 🚧 Doing

- **Distro-container packaging pipeline** — `.github/workflows/release.yml` +
  `.github/scripts/build-{deb,rpm,arch,appimage}.sh`. Pushing a `v*` tag builds
  each format natively in its own container in parallel — `dpkg-buildpackage`
  in a Debian container, `rpmbuild` in a Fedora container, `makepkg` in an Arch
  Linux container, and a self-contained AppImage (linuxdeploy + GTK plugin,
  bundling gjs and a relocatable launcher) — and a final job attaches all four
  to the GitHub release. Dependencies resolve against each distro's own
  repositories (deb `gjs (>= 1.72)`, rpm `Requires: gjs` + `Recommends: docker
  freerdp`, Arch `depends`/`optdepends`; AppImage bundles its runtime).
  Locally validated end-to-end with the exact `docker run` invocations the
  workflow uses.

## ✅ Done

- **Onboarding** — Welcome → distro-aware prerequisite checks (Arch/Debian/
  Fedora/openSUSE from `/etc/os-release`) with Fix buttons, "You're all set!"
  turn, and a create-your-first-VM form with full dockur passthrough
  (release, credentials, RAM/CPU/disk, RDP + web ports, LANGUAGE/KEYBOARD,
  local ISO → `/boot.iso`, `MANUAL`, free-form env).
- **Shell** — `Adw.OverlaySplitView`: sidebar toggle ⇄ `show-sidebar`,
  overlay sidebar below 720 px, VM list with live running state and per-row
  start/stop, `<app-id>` + D-Bus activation.
- **VM adoption** — existing `dockurr/windows` containers adopt themselves
  into the sidebar on refresh (ports read from `PortBindings`); delete
  inspects the real `/storage` mount and leaves bind mounts alone.
- **VM overview** — live metrics (`docker stats`/`inspect`, 3 s poll), Open
  Desktop, Web Console, Applications, start/stop-with-app automation
  switches, confirmed delete that also removes generated launchers.
- **Applications** — PowerShell Start-Menu `.lnk` scan → searchable list →
  FreeRDP RemoteApp streaming per app → host `.desktop` launchers that call
  back via `--open-app`.
- **Launch pipeline** — auto-starts a stopped VM, real **X.224 RDP
  handshake** readiness check (docker-proxy accepts TCP instantly, so a plain
  connect probe was a false positive), CLI exits with the actual failure.
- **Lifecycle automation** — per-VM start-with-app / stop-with-app, failures
  reported per VM instead of thrown.
- **GSettings properly wired** — schema renamed to `*.gschema.xml` and
  compiled into `<build>/data` for dev runs, so dark mode and onboarding
  state actually persist (section 8 audit).
- **Packaging foundations** — Flatpak removed, native deb/rpm/Arch added,
  version bumped to 1.0.0 with a matching metainfo release.
- **Verified** — meson compiles clean, validators 2/2, dev/installed runs
  zero-JS-error, Docker integration (43), wizard (25), UI (18), launch (20)
  and lifecycle (10) harness checks all pass.

## 💡 Later / ideas

- **Guest-agent metrics** — CPU/memory from *inside* Windows, not just
  container-level `docker stats`.
- **Edit an existing VM** — today you can only create or delete; a settings
  screen for ports/hardware would avoid delete-and-recreate.
- **Notifications** (libnotify) when a Windows install or app scan finishes.
- **Desktop previews** — a VM screengrab in the sidebar or overview
  (the `mockup/` directory sketches a grid + details layout to align with).
- **Port-conflict pre-check** before create, instead of a late daemon error.
- **Nested virtualization hint** — detect the host being a VM and suggest
  enabling it (KVM check already warns, but messaging could be smarter).
- **Package signing + an OTA repo** — sign the deb/rpm/Arch packages and
  publish to a PackageCloud/OWR-style repo; surface updates from metainfo
  releases.
- **GPU / `/dev/dri` passthrough option** for gaming-oriented VMs.