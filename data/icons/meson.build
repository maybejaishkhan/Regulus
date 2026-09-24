application_id = 'regulus'

scalable_dir = 'hicolor' / 'scalable' / 'apps'
install_data(
  scalable_dir / 'app.svg',
  install_dir: get_option('datadir') / 'icons' / scalable_dir,
  rename: ('@0@.svg').format(application_id),
)

symbolic_dir = 'hicolor' / 'symbolic' / 'apps'
install_data(
  symbolic_dir / 'app-symbolic.svg',
  install_dir: get_option('datadir') / 'icons' / symbolic_dir,
  rename: ('@0@-symbolic.svg').format(application_id),
)
