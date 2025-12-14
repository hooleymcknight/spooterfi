const path = require('path');

module.exports = {
  packagerConfig: {
    asar: true,
    executableName: 'Spooterfi',
    icon: './src/assets/icons/win/favicon.ico',
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
      },
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    {
      name: '@electron-forge/plugin-webpack',
      config: {
        mainConfig: './webpack.main.config.js',
        devContentSecurityPolicy: "connect-src 'self' * 'unsafe-eval'",
        renderer: {
          config: './webpack.renderer.config.js',
          entryPoints: [
            {
              // rhmr: 'react-hot-loader/patch',
              html: './src/index.html',
              js: './src/renderer.js',
              name: 'main_window',
              // preload: {
              //   js: './src/preload.js',
              // },
            },
          ],
        },
      },
    },
  ],
};
