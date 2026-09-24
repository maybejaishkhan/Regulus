#!/usr/bin/env bash
set -euo pipefail

# Build an Arch Linux package (.pkg.tar.zst) inside an archlinux container
# using native makepkg (packaging/PKGBUILD). Invoked by CI (and usable
# locally) as:
#
#   docker run --rm -v "$PWD:/src" -w /src -e VERSION=1.0.0 \
#     archlinux:latest bash .github/scripts/build-arch.sh
#
# The workspace is bind-mounted read/write as /src and is only used for the
# source tree and the final dist/ output. Everything else happens in /tmp, so
# the working tree stays pristine.

: "${VERSION:?VERSION must be set}"

pacman -Syu --noconfirm --needed base-devel meson ninja gjs gtk4 libadwaita \
  gsettings-desktop-schemas appstream desktop-file-utils

# Stage the workspace as a %(pkgname)-%(pkgver) source tree and patch the
# pinned pkgver into the staged PKGBUILD only.
SCRATCH=/tmp/archbuild
rm -rf "$SCRATCH"
mkdir -p "$SCRATCH/regulus-$VERSION"

tar --exclude-vcs --exclude='./build*' --exclude='./staging' --exclude='./dist' \
    -cf - . | tar -xf - -C "$SCRATCH/regulus-$VERSION"
sed -i "s/^pkgver=.*/pkgver=${VERSION}/" "$SCRATCH/regulus-$VERSION/packaging/PKGBUILD"

# makepkg takes the version from the source filename it finds next to the
# PKGBUILD (falling back to the source= URL), so drop the tarball beside it.
tar -czf "$SCRATCH/regulus-$VERSION/packaging/regulus-$VERSION.tar.gz" -C "$SCRATCH" "regulus-$VERSION"

# makepkg refuses to run as root.
useradd -m builder
chown -R builder:builder "$SCRATCH"
su builder -c "cd '$SCRATCH/regulus-$VERSION/packaging' && makepkg --noconfirm"

mkdir -p /src/dist
cp "$SCRATCH"/regulus-${VERSION}/packaging/regulus-${VERSION}-1-*.pkg.tar.zst /src/dist/

echo "=== built ==="
ls -lh /src/dist/
echo "=== .pkg.tar.zst contents ==="
bsdtar -tf /src/dist/regulus-*.pkg.tar.zst