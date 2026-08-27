#!/usr/bin/env node
/**
 * fix-electron.js
 *
 * Electron's postinstall does exactly three things:
 *   1. download electron-v<VER>-<platform>-<arch>.zip into a cache folder
 *   2. extract it into node_modules/electron/dist/
 *   3. write node_modules/electron/path.txt containing the exe name
 *
 * When the cache is corrupt, step 1 "succeeds" against a bad file forever and
 * steps 2-3 never happen -- which is the "Electron failed to install correctly"
 * error. Nothing is broken in Forge or Electron; the install is just half-done.
 *
 * This script does no patching. It reports the exact paths involved, and can
 * finish the install by hand from a zip you downloaded yourself.
 *
 * Usage:
 *   node fix-electron.js                 # diagnose only
 *   node fix-electron.js <path-to-zip>   # finish the install from that zip
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const projectRoot = process.cwd();
const electronDir = path.join(projectRoot, 'node_modules', 'electron');

if (!fs.existsSync(electronDir)) {
    console.error(`No node_modules/electron under ${projectRoot}`);
    console.error('Run this from your project root, after npm install.');
    process.exit(1);
}

const version = require(path.join(electronDir, 'package.json')).version;

// Match what install.js does.
const platform = process.env.npm_config_platform || os.platform();
const arch = process.env.npm_config_arch || os.arch();

const platformPath = {
    darwin: 'Electron.app/Contents/MacOS/Electron',
    mas: 'Electron.app/Contents/MacOS/Electron',
    linux: 'electron',
    freebsd: 'electron',
    openbsd: 'electron',
    win32: 'electron.exe',
}[platform];

if (!platformPath) {
    console.error(`Electron builds are not available on platform: ${platform}`);
    process.exit(1);
}

const zipName = `electron-v${version}-${platform}-${arch}.zip`;
const downloadUrl =
    `https://github.com/electron/electron/releases/download/v${version}/${zipName}`;

// Mirror @electron/get's Cache.getCacheDirectory: sha256 of the URL with the
// filename stripped off.
const parsed = url.parse(downloadUrl);
const { search, hash, pathname, ...rest } = parsed;
const strippedUrl = url.format({ ...rest, pathname: path.dirname(pathname) });
const cacheDirName = crypto.createHash('sha256').update(strippedUrl).digest('hex');

// env-paths('electron', { suffix: '' }).cache
const cacheRoot = process.env.electron_config_cache || (
    platform === 'win32'
        ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'electron', 'Cache')
        : platform === 'darwin'
            ? path.join(os.homedir(), 'Library', 'Caches', 'electron')
            : path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'electron')
);

const cachedZipPath = path.join(cacheRoot, cacheDirName, zipName);
const distDir = path.join(electronDir, 'dist');
const pathTxt = path.join(electronDir, 'path.txt');
const exePath = path.join(distDir, platformPath);

const exists = (p) => fs.existsSync(p);
const mark = (p) => (exists(p) ? 'present' : 'MISSING');

console.log('');
console.log(`  electron version   ${version}`);
console.log(`  platform / arch    ${platform} / ${arch}`);
console.log('');
console.log('  what the installer should have produced:');
console.log(`    dist/            ${mark(distDir)}   ${distDir}`);
console.log(`    executable       ${mark(exePath)}   ${exePath}`);
console.log(`    path.txt         ${mark(pathTxt)}   ${pathTxt}`);
if (exists(pathTxt)) {
    const contents = fs.readFileSync(pathTxt, 'utf-8');
    const clean = contents === platformPath;
    console.log(`      contents       ${JSON.stringify(contents)} ${clean ? '(ok)' : `(WRONG - should be exactly ${JSON.stringify(platformPath)})`}`);
}
console.log('');
console.log('  cache:');
console.log(`    zip              ${mark(cachedZipPath)}`);
console.log(`                     ${cachedZipPath}`);
if (exists(cachedZipPath)) {
    const size = fs.statSync(cachedZipPath).size;
    console.log(`    size             ${(size / 1024 / 1024).toFixed(1)} MB ${size < 20 * 1024 * 1024 ? '  <-- suspiciously small, likely a truncated download' : ''}`);
}
console.log('');
console.log(`  download URL     ${downloadUrl}`);
console.log('');

const zipArg = process.argv[2];

if (!zipArg) {
    if (exists(exePath) && exists(pathTxt)) {
        console.log('  Install looks complete. If npm start still fails, the problem is elsewhere.');
    } else {
        console.log('  To finish the install by hand:');
        console.log(`    1. delete the cache folder:  ${path.join(cacheRoot, cacheDirName)}`);
        console.log('    2. try  npm rebuild electron   -- that alone often fixes it');
        console.log('    3. if it still fails, download the zip from the URL above, then run:');
        console.log('         node fix-electron.js <path-to-downloaded-zip>');
    }
    console.log('');
    process.exit(0);
}

// --- finish the install from a local zip ---

const zipPath = path.resolve(zipArg);
if (!exists(zipPath)) {
    console.error(`No such file: ${zipPath}`);
    process.exit(1);
}

const zipSize = fs.statSync(zipPath).size;
if (zipSize < 20 * 1024 * 1024) {
    console.error(`That zip is only ${(zipSize / 1024 / 1024).toFixed(1)} MB, which is too small to be a real Electron build.`);
    console.error('It is probably an error page or a truncated download. Re-download it.');
    process.exit(1);
}

console.log(`  Extracting ${path.basename(zipPath)} into dist/ ...`);

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

try {
    if (platform === 'win32') {
        // PowerShell is always available on Windows; avoids needing an unzip binary.
        execFileSync('powershell', [
            '-NoProfile', '-Command',
            `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${distDir}' -Force`
        ], { stdio: 'inherit' });
    } else {
        execFileSync('unzip', ['-q', '-o', zipPath, '-d', distDir], { stdio: 'inherit' });
    }
} catch (err) {
    console.error('Extraction failed:', err.message);
    process.exit(1);
}

// install.js hoists electron.d.ts up one level if the zip contains it
const srcTypeDef = path.join(distDir, 'electron.d.ts');
if (exists(srcTypeDef)) {
    fs.renameSync(srcTypeDef, path.join(electronDir, 'electron.d.ts'));
}

// No trailing newline. getElectronPath() joins this string onto the dist path
// verbatim, so a stray \n or a BOM produces an unspawnable path.
fs.writeFileSync(pathTxt, platformPath, { encoding: 'utf-8' });

console.log('');
if (exists(exePath)) {
    console.log(`  Done. ${platformPath} is in place and path.txt points at it.`);
    console.log('  Try npm start.');
} else {
    console.error(`  Extracted, but ${exePath} is still missing.`);
    console.error('  Check whether the zip nested everything inside a subfolder.');
    process.exit(1);
}
console.log('');