const { app, BrowserWindow, ipcMain, Menu, Tray, ipcRenderer, Notification, nativeImage } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { getNowPlaying, clearFileContent } = require('./tools/get-nowplaying.js');
const { getNewAccessToken } = require('./tools/connect-spotify.js');
const { template, store, base64icon } = require('./helpers/helpers.js');
const { connectSpotifyApp } = require('./tools/connect-spotify/app.js');
const version = require('../package.json').version;

let tray = null;
let requestQuit = false;
// const icon = nativeImage.createFromDataURL(base64icon);
let notifFired = false;
let mainWindow;

const failedAttemptCodes = ['atexp', 'baddir', 'err'];

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
    app.quit();
}

const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);

const initConnect = () => {
    exec(`start http://localhost:8888`, (error, stdout, stderr) => {
        if (error) console.error(`exec error: ${error}`);
        if (stderr) console.error(`stderr: ${stderr}`);
    });
    connectSpotifyApp();
}

const contextMenu = Menu.buildFromTemplate([
    // { label: 'Show App', click: () => {
    //     mainWindow.show(); // Show the window when this menu item is clicked
    // }},
    // { label: 'Hide App', click: () => {
    //     mainWindow.hide(); // Hide the window
    // }},
    { label: 'Refresh Now Playing', click: async () => {
        const refreshAttempt = await getNowPlaying(store.get('settings').accessToken, store.get('settings').fileDirectory);
        if (failedAttemptCodes.includes(refreshAttempt.type)) {
            initNotification('Error!', refreshAttempt.type);
        }
    }},
    { type: 'separator' },
    { label: 'Connect Spotify', click: () => {
        initConnect();
    }},
    { label: 'Settings', click: () => {
        mainWindow.show();
    }},
    { type: 'separator' }, // Adds a horizontal line
    { label: `v${version}`, enabled: false },
    { type: 'separator' },
    { label: 'Quit', click: () => {
        requestQuit = true;
        clearFileContent(store.get('settings').fileDirectory);
        app.quit(); // Quits the entire application
    }}
]);

const createWindow = () => {
    let { width, height } = store.get('windowBounds');
    let x = store.get('windowPosition')?.x;
    let y = store.get('windowPosition')?.y;

    if (!x || !y) {
        x = 100;
        y = 100;
    }

    mainWindow = new BrowserWindow({
        show: false,
        width,
        height,
        x,
        y,
        webPreferences: {
            webSecurity: false,
            nodeIntegration: true,
            nodeIntegrationInSubFrames: true,
            nodeIntegrationInWorker: true,
            contextIsolation: false,
        }
    });

    mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

    mainWindow.on('resize', () => {
        const { width, height } = mainWindow.getBounds();
        store.set('windowBounds', { width, height });
    });

    mainWindow.on('moved', () => {
        const [ x, y ] = mainWindow.getPosition();
        store.set('windowPosition', { x, y });
    });

    mainWindow.on('close', (e) => {
        if (!requestQuit) {
            e.preventDefault();
            mainWindow.hide();
        }
        else {
            app.quit();
        }
    });

    // mainWindow.webContents.openDevTools();
    mainWindow.webContents.send('load-settings', store.get('settings'));

    const icon = nativeImage.createFromDataURL(base64icon);
    tray = new Tray(icon);

    tray.setToolTip('Spooterfi');
    tray.setContextMenu(contextMenu);

    return mainWindow;
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
    if (process.platform === 'win32') {
        app.setAppUserModelId(app.name);
    }
    createWindow();
    await triggerGetNPLoop();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', (event) => {
    if (process.platform !== 'darwin') {
        // app.quit();
        event.preventDefault();
    }
});

app.on('activate', () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow(false);
    }
});

// =====================================
// ===================================== IPC MAIN =====================================
// =====================================

ipcMain.on('request-settings', () => {
    mainWindow.webContents.send('load-settings', store.get('settings'));
});

ipcMain.on('save-settings', (event, data) => {
    store.set('settings', data);
});

// I think I need to add some catch error handling in here
const triggerGetNPLoop = async () => {
    if (!store.get('settings').fileDirectory.length) {
        console.error('no file directory set.');
    }

    const firstAttempt = await getNowPlaying(store.get('settings').accessToken, store.get('settings').fileDirectory);

    handleAttempts(firstAttempt, () => {
        let subsequentAttempts;
        const saLoop = setInterval(async () => {
            subsequentAttempts = await getNowPlaying(store.get('settings').accessToken, store.get('settings').fileDirectory);
            let continueLoop = handleAttempts(subsequentAttempts);
            if (!continueLoop) clearInterval(saLoop);
        }, 5000); // ping every 5 seconds
    });
}

const handleAttempts = (attempt, callback) => {
    // the callback will not run if you get an errored first attempt.
    if (attempt.type == 'atexp') {
        // access token expired:
        let refreshToken = store.get('settings').refreshToken;
        if (!refreshToken) {
            initNotification('Need Refresh Token', 'Right-click, Connect Spotify to get a new refresh token.');
            return false;
        }

        getNewAccessToken(refreshToken)
            .then((token) => {
                if (token.error) {
                    initNotification('Error!', token.error_description);
                    if (token.error_description.includes('Invalid refresh token')) {
                        initConnect();
                    }
                    return;
                }

                let newSettings = store.get('settings');
                newSettings.accessToken = token;
                store.set('settings', newSettings);
                if (callback) {
                    callback();
                }
                // return true;
            })
            .catch((err) => {
                console.log(err);
                return false;
            });
    }
    else if (attempt.type === 'baddir') {
        initNotification('Incorrect File Directory', 'Please check the path in your settings.');
        return false;
    }
    else if (attempt.type === 'err') {
        // handle an error, do not proceed.
        // initNotification('Error!', 'An unknown error has occurred. Please contact the developer.');
        initNotification('Error!', String(attempt.message));
        return false;
    }
    else if (callback) {
        callback();
    }
    return true;
}

const initNotification = (heading, message) => {
    if (notifFired) return;
    notifFired = true;

    const notifIcon = nativeImage.createFromDataURL(base64icon);
    if (Notification.isSupported()) {
        const fireAlert = new Notification({
            title: heading,
            body: message,
            icon: notifIcon // Optional: custom icon
        });
        fireAlert.show();

        fireAlert.on('click', () => {
            // console.log('Notification clicked!');
            mainWindow.show();
            // Bring the main application window to the front
            // You would need a reference to your mainWindow object here
        });
    } else {
        // Fallback for systems that don't support native notifications
        console.log('Native notifications not supported');
    }

    setTimeout(() => {
        console.log('notif fired false')
        notifFired = false;
    }, 30000);
}

// module.exports = { };