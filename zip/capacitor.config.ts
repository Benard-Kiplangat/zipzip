import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.boscoautospares.pos',
  appName: 'Bosco Autospares',
  webDir: 'dist',
  server: {
    url: 'http://127.0.0.1:8080',
    cleartext: true,
    allowNavigation: ['127.0.0.1'],
  },
  plugins: {
    "StatusBar": {
      "style": "DARK",
      "overlaywebview": false
    },
    "CapacitorSQLite": {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      androidIsEncryption: false,
    },
  },
};

export default config;
