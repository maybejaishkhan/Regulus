#!/usr/bin/env bash
set -euo pipefail

# Build a self-contained AppImage inside a Debian container.
# Invoked by CI (and usable locally) as:
#
#   docker run --rm -v "$PWD:/src" -w /src \
#     [-e VERSION=1.0.0] debian:trixie bash .github/scripts/build-appimage.sh
#
# Regulus is a GJS app whose "binary" is a shebang script, so besides the
# bundled GTK/Adwaita stack the AppImage also ships gjs itself and a patched,
# relocatable launcher that resolves the gresource bundles relative to $APPDIR.
#
# The workspace is bind-mounted read/write as /src. Everything is staged in
# /tmp (scratch tree, meson build dir, AppDir, tool binaries) and only the
# final AppImage is written to /src/dist, so the working tree stays pristine.

# Version: usually provided by CI from a tag or the workflow_dispatch input.
# When absent (e.g. plain local runs), fall back to meson.build so the scripts
# are usable without any environment/CI setup.
if [ -z "${VERSION:-}" ]; then
  VERSION="$(sed -n "s/.*version: '\([^']*\)'.*/\1/p" meson.build | head -1)"
fi
: "${VERSION:?unable to determine a version (pass VERSION or set it in meson.build)}"

# Retry helper — the GitHub release CDN is occasionally flaky.
dl() {
  local url=$1 dst=$2
  for _ in 1 2 3 4 5; do
    if wget -q --timeout=90 -O "$dst" "$url"; then
      echo "downloaded $dst"
      return 0
    fi
    echo "retrying $url ..." >&2
    sleep 5
  done
  return 1
}

export DEBIAN_FRONTEND=noninteractive
export APPIMAGE_EXTRACT_AND_RUN=1 # run linuxdeploy/appimagetool AppImages without FUSE

apt-get update -qq
# Two smaller transactions to keep the dpkg memory peak low (no-swap hosts).
apt-get install -y -qq --no-install-recommends \
  ca-certificates wget dpkg-dev \
  meson ninja-build python3 file patchelf xvfb xauth
apt-get install -y -qq --no-install-recommends \
  build-essential gjs libgtk-4-dev libadwaita-1-dev \
  gsettings-desktop-schemas-dev desktop-file-utils appstream \
  libglib2.0-bin libgdk-pixbuf-2.0-0 libgdk-pixbuf2.0-bin librsvg2-bin

SCRATCH=/tmp/appimage
rm -rf "$SCRATCH"
mkdir -p "$SCRATCH" "$SCRATCH/tools"
tar --exclude-vcs --exclude='./build*' --exclude='./AppDir' \
    --exclude='./staging' --exclude='./dist' \
    -cf - . | tar -xf - -C "$SCRATCH"
cd "$SCRATCH"

# 1) Build and stage the install tree into AppDir/usr/...
meson setup build --prefix=/usr --libdir=lib/x86_64-linux-gnu
meson compile -C build
meson test -C build --print-errorlogs
rm -rf AppDir
DESTDIR="$PWD/AppDir" meson install -C build

# 2) Make the launcher relocatable: run gjs from the AppImage's own PATH and
#    resolve the gresource bundles relative to $APPDIR at runtime instead of
#    the build-time absolute /usr paths.
LAUNCHER="AppDir/usr/bin/regulus"
[ -f "$LAUNCHER" ]
sed -i '1s|^#!.*|#!/usr/bin/env -S gjs -m|' "$LAUNCHER"
python3 - "$LAUNCHER" <<'PY'
import sys

path = sys.argv[1]
src = open(path).read()
for old, new in (
    ('prefix: "/usr",', 'prefix: GLib.getenv("APPDIR") + "/usr",'),
    ('libdir: "/usr/lib/x86_64-linux-gnu",',
     'libdir: GLib.getenv("APPDIR") + "/usr/lib/x86_64-linux-gnu",'),
    ('datadir: "/usr/share",', 'datadir: GLib.getenv("APPDIR") + "/usr/share",'),
):
    if old not in src:
        raise SystemExit(f'pattern not found in launcher: {old!r}')
    src = src.replace(old, new)
open(path, 'w').write(src)
PY
grep -n 'getenv("APPDIR")' "$LAUNCHER"

# 3) Ship gjs itself so the shebang "#!/usr/bin/env gjs -m" resolves inside
#    the AppImage. linuxdeploy additionally bundles its shared libraries.
[ -e /usr/bin/gjs ]
mkdir -p AppDir/usr/bin
cp /usr/bin/gjs AppDir/usr/bin/gjs

# 4) Bundle the GTK/Adwaita runtime (libs, GIR typelibs, GSettings schemas,
#    GdkPixbuf loaders, icon/theme data) with linuxdeploy + the GTK plugin.
dl https://github.com/linuxdeploy/linuxdeploy/releases/download/continuous/linuxdeploy-x86_64.AppImage \
  tools/linuxdeploy-x86_64.AppImage
dl https://raw.githubusercontent.com/linuxdeploy/linuxdeploy-plugin-gtk/master/linuxdeploy-plugin-gtk.sh \
  tools/linuxdeploy-plugin-gtk.sh
chmod +x tools/linuxdeploy-x86_64.AppImage tools/linuxdeploy-plugin-gtk.sh
cp tools/linuxdeploy-plugin-gtk.sh tools/linuxdeploy-plugin-gtk # plugin lookup name
export PATH="$SCRATCH/tools:$PATH"
export DEPLOY_GTK_VERSION=4 # Regulus is a GTK4/Adwaita app; the plugin can't auto-detect it

./tools/linuxdeploy-x86_64.AppImage \
  --appdir AppDir \
  --executable AppDir/usr/bin/gjs \
  --icon-file AppDir/usr/share/icons/hicolor/scalable/apps/regulus.svg \
  --desktop-file AppDir/usr/share/applications/org.regulus.Regulus.desktop \
  --plugin gtk

# 5) Bake the AppDir into a single-file AppImage.
dl https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage \
  tools/appimagetool-x86_64.AppImage
chmod +x tools/appimagetool-x86_64.AppImage
mkdir -p /src/dist
export ARCH=x86_64
./tools/appimagetool-x86_64.AppImage AppDir /src/dist/regulus-$VERSION-x86_64.AppImage

echo "=== built ==="
ls -lh /src/dist/

# 6) Smoke test: --help is handled by GApplication, so it proves the whole
#    bundle (gjs, GTK, typelibs, schemas, resources) loads. rc 0 (clean exit)
#    or 124 (app ran until the timeout, e.g. a window was shown) both pass;
#    anything else is a crash. Also test directly from the AppDir so failures
#    are easier to attribute.
set +e
timeout 120 xvfb-run -a bash -c 'cd AppDir && ./AppRun --help' > /tmp/appimage-appdir.log 2>&1
RC_APPDIR=$?
timeout 180 xvfb-run -a bash -c '/src/dist/regulus-'"$VERSION"'-x86_64.AppImage --appimage-extract-and-run --help' > /tmp/appimage-run.log 2>&1
RC_IMG=$?
set -e

echo "--- AppDir smoke test (rc=$RC_APPDIR) ---"
head -25 /tmp/appimage-appdir.log
echo "--- baked AppImage smoke test (rc=$RC_IMG) ---"
head -25 /tmp/appimage-run.log

for rc in "$RC_APPDIR" "$RC_IMG"; do
  [ "$rc" -eq 0 ] || [ "$rc" -eq 124 ] || { echo "AppImage smoke test failed (rc=$rc)" >&2; exit 1; }
done