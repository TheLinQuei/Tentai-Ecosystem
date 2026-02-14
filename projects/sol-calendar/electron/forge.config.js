module.exports = {
  packagerConfig: {
    name: 'Sol Calendar',
    executableName: 'sol-calendar',
    icon: './assets/icon',
    asar: true,
    extraResource: [
      './docs',
      './assets',
      './styles',
      './src'
    ]
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32', 'linux', 'darwin']
    }
  ]
};
