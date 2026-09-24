data_res = gnome.compile_resources(APP_ID + '.data',
  '../src/data.gresource.xml',
  gresource_bundle: true,
  install: true,
  install_dir: pkgdatadir,
)

desktop_file = custom_target('desktop-file',
         input: 'desktop.in',
        output: APP_BUS_ID + '.desktop',   # DBusActivatable requires an rDNS filename
         command: ['cp', '@INPUT@', '@OUTPUT@'],
        install: true,
    install_dir: get_option('datadir') / 'applications'
)

desktop_utils = find_program('desktop-file-validate', required: false)
if desktop_utils.found()
  test('Validate desktop file', desktop_utils, args: [desktop_file])
endif

appstream_file = configure_file(
        input: 'metainfo.xml.in',
       output: APP_BUS_ID + '.metainfo.xml',
         copy: true,
)

install_data(appstream_file,
  install_dir: get_option('datadir') / 'metainfo'
)

appstreamcli = find_program('appstreamcli', required: false, disabler: true)
test('Validate appstream file', appstreamcli,
     args: ['validate', '--no-net', '--explain', appstream_file])

install_data(APP_ID + '.gschema.xml',
  install_dir: get_option('datadir') / 'glib-2.0' / 'schemas',
)

gnome.compile_schemas(
  depend_files: APP_ID + '.gschema.xml',
)

service_conf = configuration_data()
service_conf.set('bindir', get_option('prefix') / get_option('bindir'))
configure_file(
  input: 'service.in',
  output: APP_BUS_ID + '.service',
  configuration: service_conf,
  install_dir: get_option('datadir') / 'dbus-1' / 'services'
)

subdir('icons')