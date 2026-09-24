#!/usr/bin/env bash
set -euo pipefail

# Build an .rpm inside a Fedora container using the native rpmbuild toolchain
# (packaging/regulus.spec). Invoked by CI (and usable locally) as:
#
#   docker run --rm -v "$PWD:/src" -w /src \
#     [-e VERSION=1.0.0] fedora:latest bash .github/scripts/build-rpm.sh
#
# The workspace is bind-mounted read/write as /src and is only used for the
# source tree and the final dist/ output. Everything else happens in /tmp, so
# the working tree stays pristine.

# Version: usually provided by CI from a tag or the workflow_dispatch input.
# When absent (e.g. plain local runs), fall back to meson.build so the scripts
# are usable without any environment/CI setup.
if [ -z "${VERSION:-}" ]; then
  VERSION="$(sed -n "s/.*version: '\([^']*\)'.*/\1/p" meson.build | head -1)"
fi
: "${VERSION:?unable to determine a version (pass VERSION or set it in meson.build)}"

# Keep the spec's changelog entry in sync with the version being built.
LOGIN="$(id -un)"
EMAIL="$(id -un)@localhost"

dnf -y --setopt=install_weak_deps=False install \
  rpm-build meson ninja-build gjs \
  gtk4-devel libadwaita-devel glib2-devel gsettings-desktop-schemas-devel \
  desktop-file-utils appstream

# Stage the workspace as a %{name}-%{version} source tree (the layout
# %autosetup expects) and build the Source0 tarball from it.
RPMTOP=/tmp/rpmbuild
SRC_TREE="/tmp/src-tree/regulus-$VERSION"
rm -rf "$RPMTOP" /tmp/src-tree
mkdir -p "$RPMTOP"/{BUILD,RPMS,SRPMS,SOURCES,SPECS}
mkdir -p "$SRC_TREE"

tar --exclude-vcs --exclude='./build*' --exclude='./staging' --exclude='./dist' \
    -cf - . | tar -xf - -C "$SRC_TREE"
tar -cJf "$RPMTOP/SOURCES/regulus-$VERSION.tar.xz" -C /tmp/src-tree "regulus-$VERSION"

# The spec pins a version; stamp the tag version into the staged copy only.
sed -i "s/^Version:.*/Version:        ${VERSION}/" "$SRC_TREE/packaging/regulus.spec"
grep -m1 '^Version:' "$SRC_TREE/packaging/regulus.spec"

sed -i "/^- .* - [0-9].*-1$/s/- [0-9][^ ]* -1/- ${VERSION}-1/" "$SRC_TREE/packaging/regulus.spec"
sed -i "/^- .* - ${VERSION}-1$/s/^- \*/& $(date +'%a %b %d %Y') ${LOGIN} <${EMAIL}> /" "$SRC_TREE/packaging/regulus.spec"
grep -m1 '^- .* - ' "$SRC_TREE/packaging/regulus.spec"

rpmbuild --define "_topdir $RPMTOP" -ba "$SRC_TREE/packaging/regulus.spec"

mkdir -p /src/dist
cp "$RPMTOP"/RPMS/noarch/regulus-*.rpm /src/dist/

echo "=== built ==="
ls -lh /src/dist/
echo "=== .rpm contents ==="
rpm -qpl /src/dist/regulus-*.rpm