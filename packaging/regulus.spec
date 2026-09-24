Name:           regulus
Version:        1.0.0
Release:        1%{?dist}
Summary:        Run Windows apps on your Linux desktop

License:        GPL-3.0-or-later
URL:            https://github.com/maybejaishkhan/Regulus
Source0:        %{name}-%{version}.tar.xz

BuildArch:      noarch
BuildRequires:  meson >= 1.0.0
BuildRequires:  pkgconfig(gtk4) >= 4.4
BuildRequires:  pkgconfig(libadwaita-1) >= 1.4
BuildRequires:  pkgconfig(gsettings-desktop-schemas)
BuildRequires:  desktop-file-utils
BuildRequires:  appstream
BuildRequires:  gjs
Requires:       gjs
Recommends:     docker
Recommends:     freerdp

%description
Regulus manages Windows virtual machines backed by the dockurr/windows
container image and streams individual Windows applications to the
desktop with the SDL FreeRDP client (RemoteApp). It creates and starts
VMs, reports host prerequisites with distro-aware fix-up commands,
discovers applications inside Windows, and generates host .desktop
launchers that open them directly.

%prep
%autosetup

%build
%meson
%meson_build

%install
%meson_install

%check
%meson_test

%files
%license LICENSE
%doc README.md
%{_bindir}/regulus
%{_datadir}/applications/org.regulus.Regulus.desktop
%{_datadir}/metainfo/org.regulus.Regulus.metainfo.xml
%{_datadir}/dbus-1/services/org.regulus.Regulus.service
%{_datadir}/glib-2.0/schemas/regulus.gschema.xml
%{_datadir}/regulus/
%{_datadir}/icons/hicolor/*/*/regulus*.svg

%changelog
* Wed Sep 23 2026 Jaish Khan <maybejaishkhan@users.noreply.github.com> - 1.0.0-1
- First packaged release