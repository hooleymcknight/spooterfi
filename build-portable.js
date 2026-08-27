#!/usr/bin/env node
/**
 * build-portable.js
 *
 * electron-packager hangs on Windows because the extractor it uses to unpack
 * Electron silently fails. But packaging is not complicated - it is:
 *
 *   1. copy node_modules/electron/dist to an output folder
 *   2. drop the app's built code into resources/app
 *   3. delete the stock resources/default_app.asar
 *   4. rename electron.exe to the app's name
 *
 * We already have a working node_modules/electron/dist (courtesy of
 * fix-electron.js), and `.webpack` is built before packager ever gets involved,
 * so everything needed is already on disk. This does those four steps.
 *
 * Prerequisite: run `npm run package` (or `npm run make`) once and let it get
 * as far as "Copying files", then kill it. That produces the production
 * `.webpack` build this script needs.
 *
 * Usage:
 *   node build-portable.js          # build the folder
 *   node build-portable.js --zip    # build it and zip it for Chris
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const projectRoot = __dirname;
const pkg = require(path.join(projectRoot, 'package.json'));

const appName    = pkg.productName || pkg.name;
const exeName    = `${appName}.exe`;
const electronDist = path.join(projectRoot, 'node_modules', 'electron', 'dist');
const webpackDir   = path.join(projectRoot, '.webpack');
const outRoot      = path.join(projectRoot, 'out');
const outDir       = path.join(outRoot, `${appName} portable`);

const fail = (msg, hint) => {
    console.error(`\n  ${msg}`);
    if (hint) console.error(`  ${hint}`);
    console.error('');
    process.exit(1);
};

console.log('');
console.log(`  Building portable ${appName} v${pkg.version}   [script rev 3]`);
console.log('');

// --- checks ---------------------------------------------------------------

if (!fs.existsSync(electronDist)) {
    fail('node_modules/electron/dist is missing.',
         'Run: node fix-electron.js');
}

const electronExe = path.join(electronDist, 'electron.exe');
if (!fs.existsSync(electronExe)) {
    fail('electron.exe is not in node_modules/electron/dist.',
         'Run: node fix-electron.js');
}

const mainBundle = path.join(webpackDir, 'main', 'index.js');
if (!fs.existsSync(mainBundle)) {
    fail('.webpack/main/index.js is missing - the app has not been built.',
         'Run `npm run package`, wait until it prints "Copying files", then kill it.');
}

const rendererHtml = path.join(webpackDir, 'renderer', 'main_window', 'index.html');
if (!fs.existsSync(rendererHtml)) {
    fail('.webpack/renderer/main_window/index.html is missing.',
         'The renderer did not finish building. Re-run `npm run package`.');
}

// A dev build points the renderer at the webpack dev server. Match that entry
// specifically - a bare "localhost:3000" also appears in the Twitch OAuth
// redirect_uri, which is in the source and shows up in production builds too.
const mainSource = fs.readFileSync(mainBundle, 'utf-8');
const devEntry = mainSource.match(/localhost:3000\/main_window/);

if (devEntry && !process.argv.includes('--force')) {
    console.error('');
    console.error('  .webpack looks like a development build - the renderer entry');
    console.error(`  points at the webpack dev server (found: ${devEntry[0]}).`);
    console.error('');
    console.error('  Run `npm run package`, wait for "Copying files", then kill it.');
    console.error('');
    console.error('  If you believe this is wrong, re-run with --force to build anyway:');
    console.error('    node build-portable.js --zip --force');
    console.error('');
    process.exit(1);
}

if (devEntry) {
    console.log('  !! dev-server entry detected, building anyway (--force)');
}

// --- 1. copy the electron runtime ----------------------------------------

console.log('  1. copying Electron runtime');

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
fs.cpSync(electronDist, outDir, { recursive: true });

// --- 2. drop in the app ---------------------------------------------------

console.log('  2. adding the app code');

const resourcesDir = path.join(outDir, 'resources');
const appDir       = path.join(resourcesDir, 'app');

fs.mkdirSync(appDir, { recursive: true });
fs.cpSync(webpackDir, path.join(appDir, '.webpack'), { recursive: true });

// Electron derives the userData folder name from these fields, so productName
// has to match what the updater script expects (%APPDATA%\Guess the Killer).
const appPkg = {
    name: pkg.name,
    productName: pkg.productName,
    version: pkg.version,
    description: pkg.description || appName,
    main: pkg.main,
    author: pkg.author,
};
fs.writeFileSync(
    path.join(appDir, 'package.json'),
    JSON.stringify(appPkg, null, 2),
    'utf-8'
);

// --- 3. remove the stock placeholder app ---------------------------------

console.log('  3. removing default_app.asar');

const defaultApp = path.join(resourcesDir, 'default_app.asar');
if (fs.existsSync(defaultApp)) {
    fs.rmSync(defaultApp, { force: true });
}
else {
    console.log('     (was not there - fine)');
}

// --- 4. rename the executable --------------------------------------------

console.log(`  4. renaming electron.exe to ${exeName}`);

const finalExe = path.join(outDir, exeName);
fs.renameSync(path.join(outDir, 'electron.exe'), finalExe);

// Optional: set the icon, if rcedit happens to be installed as a packager dep.
// Purely cosmetic - a missing icon does not stop the app working.
const iconPath = path.join(projectRoot, 'src', 'assets', 'icons', 'win', 'favicon.ico');
if (fs.existsSync(iconPath)) {
    try {
        const rcedit = require(path.join(projectRoot, 'node_modules', 'rcedit'));
        rcedit(finalExe, { icon: iconPath })
            .then(() => console.log('     icon applied'))
            .catch(() => console.log('     (icon not applied - cosmetic only)'));
    }
    catch {
        console.log('     (rcedit not installed, skipping icon - cosmetic only)');
    }
}

// --- done -----------------------------------------------------------------

const sizeMb = (dir) => {
    let total = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
        if (entry.isFile()) {
            try { total += fs.statSync(path.join(entry.parentPath || entry.path, entry.name)).size; }
            catch { /* ignore */ }
        }
    }
    return (total / 1024 / 1024).toFixed(0);
};

console.log('');
console.log(`  Built: ${outDir}`);
try { console.log(`  Size:  ~${sizeMb(outDir)} MB`); } catch { /* ignore */ }
console.log('');
console.log(`  Test it by running: "${finalExe}"`);

// --- optional zip ---------------------------------------------------------

if (process.argv.includes('--zip')) {
    const zipPath = path.join(outRoot, `${pkg.name}-v${pkg.version}.zip`);
    console.log('');
    console.log('  Zipping for delivery...');
    try {
        fs.rmSync(zipPath, { force: true });
        execFileSync('powershell', [
            '-NoProfile', '-Command',
            `Compress-Archive -LiteralPath '${outDir}' -DestinationPath '${zipPath}' -Force`
        ], { stdio: 'inherit' });
        console.log('');
        console.log(`  Zip ready: ${zipPath}`);
        console.log('  Put that in the updater folder alongside the .bat and .ps1.');
    }
    catch (err) {
        console.log(`  Could not zip automatically (${err.message}).`);
        console.log('  Right-click the folder > Send to > Compressed folder instead.');
    }
}

console.log('');