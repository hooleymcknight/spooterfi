const fs = require('fs').promises;
const Store = require('./store.js');

const store = new Store({
    configName: 'user-preferences',
    defaults: {
        windowBounds: { width: 800, height: 600 },
        settings: {
            accessToken: '',
            fileDirectory: '',
        },
    }
});

const template = [
    // { role: 'appMenu' }
    // ...(isMac
    //     ? [{
    //         label: app.name,
    //         submenu: [
    //         { role: 'about' },
    //         { type: 'separator' },
    //         { role: 'services' },
    //         { type: 'separator' },
    //         { role: 'hide' },
    //         { role: 'hideOthers' },
    //         { role: 'unhide' },
    //         { type: 'separator' },
    //         { role: 'quit' }
    //         ]
    //     }]
    //     : []),
    // { role: 'fileMenu' }
    {
        label: 'File',
        submenu: [
        // isMac ? { role: 'close' } : { role: 'quit' }
        ]
    },
    {
        label: 'Settings',
        submenu: [
        //   {
        //     label: 'Mods',
        //     submenu: [
        //       {
        //         label: 'Edit Bot Mods',
        //         type: 'normal',
        //         click: (menuItem, browserWindow, event) => {
        //           browserWindow.webContents.send('changeState', ['editMods', store.get('localMods')]);
        //         }
        //       }
        //     ]
        //   }
        ]
    },
    // { role: 'viewMenu' }
    {
        label: 'View',
        submenu: [
            // { role: 'reload' },
            // { role: 'forceReload' },
            // { role: 'toggleDevTools' },
            // { role: 'togglefullscreen' },
        ]
    },
    // { role: 'windowMenu' }
    // {
    //     label: 'Window',
    //     submenu: [
    //     { role: 'minimize' },
    //     { role: 'zoom' },
    //     // ...(isMac
    //     //     ? [
    //     //         { type: 'separator' },
    //     //         { role: 'front' },
    //     //         { type: 'separator' },
    //     //         { role: 'window' }
    //     //     ]
    //     //     : [
    //     //         { role: 'close' }
    //     //     ])
    //     ]
    // },
    {
        label: 'Setup',
        submenu: [
        // isMac ? { role: 'close' } : { role: 'quit' }
        ]
    },
    {
        role: 'help',
        submenu: [
            {
                label: 'See My Portfolio',
                click: async () => {
                    const { shell } = require('electron');
                    await shell.openExternal('https://hooleymcknight.com/');
                }
            },
            {
                label: 'v1.0.0',
            }
        ]
    }
]

module.exports = { store, template }