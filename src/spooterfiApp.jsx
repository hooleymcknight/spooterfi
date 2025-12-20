import * as React from 'react';
const path = window.require('path');
const ipcRenderer = window.require('electron').ipcRenderer;
const blankSettings = { accessToken: '', refreshToken: '', fileDirectory: '' };

const SpooterfiApp = () => {
    const [state, setState] = React.useState('settings');
    const [settings, setSettings] = React.useState(blankSettings);

    ipcRenderer.on('load-settings', (event, data) => {
        setSettings(data);
    });

    const saveSettings = (e) => {
        e.target.disabled = true;
        e.target.textContent = 'Saving...';

        let newSettings = settings || blankSettings;
        newSettings.accessToken = document.querySelector('#access-token').value;
        newSettings.refreshToken = document.querySelector('#refresh-token').value;
        
        let fileDir = document.querySelector('#file-directory').value;
        if (fileDir.length) {
            fileDir = fileDir.includes('/') ? fileDir.replace(/\//g, '\\') : fileDir;
            fileDir = fileDir.trim().charAt(fileDir.length - 1) != '\\' ? `${fileDir.trim()}\\` : fileDir.trim();        

            newSettings.fileDirectory = fileDir;
            document.querySelector('#file-directory').value = fileDir;
        }

        ipcRenderer.send('save-settings', newSettings);

        setTimeout(() => {
            e.target.textContent = 'Saved!';
            setTimeout(() => {
                e.target.disabled = false;
                e.target.textContent = 'Save';
            }, 1000);
        }, 2000);
    }

    React.useEffect(() => {
        if (!settings.accessToken) {
            ipcRenderer.send('request-settings');
        }
    }, []);

    return (
        <>
            {/* <img className="bg-img" src="https://raw.githubusercontent.com/hooleymcknight/dbd-killer-voting/main/src/assets/dbd-bg.jpg" alt="ghostface standing over a guy he stabbed" /> */}
            <main className="spooterfi-app" data-state={state}>
                <h1>Settings</h1>
                <table>
                    <tbody>
                        <tr>
                            <td>
                                <label>Access token:</label>
                            </td>
                            <td>
                                <input id="access-token" type="text" defaultValue={settings?.accessToken || ''} />
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <label>Refresh token:</label>
                            </td>
                            <td>
                                <input id="refresh-token" type="text" defaultValue={settings?.refreshToken || ''} />
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <label>Location of .txt files:</label>
                            </td>
                            <td>
                                <input id="file-directory" type="text" defaultValue={settings?.fileDirectory || ''} />
                            </td>
                        </tr>
                    </tbody>
                </table>
                <button onClick={(e) => {saveSettings(e)}}>Save</button>
            </main>
        </>
    );
}

export default SpooterfiApp;