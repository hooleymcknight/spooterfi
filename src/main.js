const { app, BrowserWindow, ipcMain, Menu, Tray, ipcRenderer, Notification, nativeImage } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { getNowPlaying } = require('./tools/get-nowplaying.js');
const { template, store, base64icon } = require('./helpers/helpers.js');
const { connectSpotifyApp } = require('./tools/connect-spotify/app.js');

let tray = null;
let requestQuit = false;
// const icon = nativeImage.createFromDataURL(base64icon);

exec('kill-port 8888', (error, stdout, stderr) => {
    if (error) console.error(`exec error: ${error}`);
    if (stderr) console.error(`stderr: ${stderr}`);
});

let mainWindow;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
    app.quit();
}

const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);

const contextMenu = Menu.buildFromTemplate([
    // { label: 'Show App', click: () => {
    //     mainWindow.show(); // Show the window when this menu item is clicked
    // }},
    // { label: 'Hide App', click: () => {
    //     mainWindow.hide(); // Hide the window
    // }},
    { label: 'Refresh Now Playing', click: () => {
        getNowPlaying(store.get('settings').accessToken, store.get('settings').fileDirectory);
    }},
    { type: 'separator' },
    { label: 'Connect Spotify', click: () => {
        exec('kill-port 8888', (error, stdout, stderr) => {
            if (error) console.error(`exec error: ${error}`);
            if (stderr) console.error(`stderr: ${stderr}`);
        });
        connectSpotify();
    }},
    { label: 'Settings', click: () => {
        mainWindow.show();
    }},
    { type: 'separator' }, // Adds a horizontal line
    { label: 'Quit', click: () => {
        requestQuit = true;
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
    const firstAttempt = await getNowPlaying(store.get('settings').accessToken, store.get('settings').fileDirectory);

    handleAttempts(firstAttempt, () => {
        let subsequentAttempts;
        setInterval(async () => {
            subsequentAttempts = await getNowPlaying(store.get('settings').accessToken, store.get('settings').fileDirectory);
            handleAttempts(subsequentAttempts);
        }, 60000); // ping once a minute
    });
}

const connectSpotify = (event) => {
    // Execute the Node command using child_process.exec
    exec('kill-port 8888', (error, stdout, stderr) => {
        if (error) console.error(`exec error: ${error}`);
        if (stderr) console.error(`stderr: ${stderr}`);

        exec('start http://localhost:8888', (error, stdout, stderr) => {
            if (error) console.error(`exec error: ${error}`);
            if (stderr) console.error(`stderr: ${stderr}`);

            setTimeout(() => {
                connectSpotifyApp();
            }, 1000);
        });
    });
}

const handleAttempts = (attempt, callback) => {
    if (attempt == 'atexp') {
        // access token expired:
        initNotification('Access Token Expired', 'Right-click, Connect Spotify to get a new access token.');
    }
    else if (attempt === 'baddir') {
        initNotification('Incorrect File Directory', 'Please check the path in your settings.');
    }
    else if (attempt === 'err') {
        // handle an error, do not proceed.
        initNotification('Error!', 'An unknown error has occurred. Please contact the developer.')
    }
    else if (callback) {
        callback();
    }
}

const initNotification = (heading, message) => {
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
}

// module.exports = { };