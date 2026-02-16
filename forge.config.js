const path = require('path');

module.exports = {
  packagerConfig: {
    name: 'Invoicing System',
    icon: path.join(__dirname, 'assets', 'icon'),
    asar: true,
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'invoicing-system',
        authors: 'Eiad Oraby',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
  ],
};
