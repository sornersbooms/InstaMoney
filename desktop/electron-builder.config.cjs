const brand = require('./electron/active-brand.json');

/** La marca activa (electron/active-brand.json) define nombre, id e icono del instalador. */
module.exports = {
  appId: brand.appId,
  productName: brand.productName,
  directories: {
    output: `release/${brand.key}`,
    buildResources: 'build',
  },
  files: ['dist/**/*', 'electron/**/*', 'package.json'],
  win: {
    target: ['nsis'],
    icon: brand.icon,
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    shortcutName: brand.productName,
  },
  mac: {
    target: ['dmg'],
    icon: brand.icon,
    category: 'public.app-category.business',
  },
  linux: {
    target: ['AppImage'],
    icon: brand.icon,
    category: 'Office',
  },
};
