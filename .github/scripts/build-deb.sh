#!/usr/bin/env bash
set -euo pipefail

# Build a .deb inside a Debian container using the native dpkg-buildpackage
# toolchain (packaging/debian tree). Invoked by CI (and usable locally) as:
#
#   docker run --rm -v "$PWD:/src" -w /src -e VERSION=1.0.0 \
#     debian:trixie bash .github/scripts/build-deb.sh
#
# The workspace is bind-mounted read/write as /src and is only used for the
# source tree and the final dist/ output. Everything else happens in /tmp, so
# the working tree stays pristine.

: "${VERSION:?VERSION must be set}"

export DEBIAN_FRONTEND=noninteractive

apt-get update -qq
apt-get install -y -qq --no-install-recommends \
  build-essential debhelper meson ninja-build \
  libgtk-4-dev libadwaita-1-dev gsettings-desktop-schemas-dev \
  desktop-file-utils appstream gjs

# Stage the workspace in a scratch dir: dpkg-buildpackage emits artifacts one
# level above the source dir, so building in /src would drop them outside the
# bind mount.
SRC_DIR=/tmp/regulus-src
rm -rf "$SRC_DIR"
mkdir -p "$SRC_DIR"

tar --exclude-vcs --exclude='./build*' --exclude='./staging' --exclude='./dist' \
    -cf - . | tar -xf - -C "$SRC_DIR"

# dpkg-buildpackage requires debian/ at the source root; the real packaging
# lives at packaging/debian, so expose it via a symlink in the scratch tree.
ln -s packaging/debian "$SRC_DIR/debian"

# dpkg-buildpackage takes the version from debian/changelog.
sed -i "1s/([^)]*)/(${VERSION})/" "$SRC_DIR/debian/changelog"
echo "Changelog header: $(head -1 "$SRC_DIR/debian/changelog")"

cd "$SRC_DIR"
dpkg-buildpackage -us -uc -b

mkdir -p /src/dist
cp /tmp/regulus_*.deb /src/dist/

echo "=== built ==="
ls -lh /src/dist/
echo "=== .deb contents ==="
dpkg-deb -c /src/dist/regulus_*.deb