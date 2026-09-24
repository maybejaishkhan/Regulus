project(
    'regulus', 
    version: '1.0.0',
    license: ['GPL-3.0-or-later'],
    meson_version: '>= 1.0.0', 
)

APP_ID = 'regulus'           # on-disk naming: binary, icons, schema, resources
APP_BUS_ID = 'org.regulus.Regulus'   # GApplication/D-Bus id (desktop/AppStream validators require a 3+ part rDNS name)

pkgdatadir = get_option('datadir') / meson.project_name()

gnome = import('gnome')

subdir('data')
subdir('src')

gnome.post_install(
  glib_compile_schemas: true,
  gtk_update_icon_cache: true,
  update_desktop_database: true,
)
