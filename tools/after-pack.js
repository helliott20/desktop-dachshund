// electron-builder afterPack hook.
//
// On Windows, electron-builder stamps the icon and version info into the .exe
// itself. On Linux it needs 32-bit Wine for that; `npm run dist:linux` turns
// that step off and this hook does it with the 64-bit rcedit instead.
// It does nothing in a normal Windows build.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32' || process.platform === 'win32') return;
  if (context.packager.platformSpecificBuildOptions.signAndEditExecutable !== false) return;

  const cache = process.env.ELECTRON_BUILDER_CACHE || path.join(os.homedir(), '.cache', 'electron-builder');
  const dir = path.join(cache, 'winCodeSign');
  const found = fs.existsSync(dir) && fs.readdirSync(dir)
    .map((d) => path.join(dir, d, 'rcedit-x64.exe'))
    .find((p) => fs.existsSync(p));
  if (!found) throw new Error('rcedit-x64.exe not found; run a normal `npm run dist` once to download winCodeSign');

  const info = context.packager.appInfo;
  const exe = path.join(context.appOutDir, `${info.productFilename}.exe`);
  const ico = path.join(context.outDir, '.icon-ico', 'icon.ico');
  const win = (p) => `Z:${p.replace(/\//g, '\\')}`;
  const args = [
    found, win(exe),
    '--set-version-string', 'ProductName', info.productName,
    '--set-version-string', 'FileDescription', info.productName,
    '--set-version-string', 'InternalName', info.productName,
    '--set-file-version', info.shortVersion || info.version,
    '--set-product-version', info.shortVersion || info.version,
  ];
  if (fs.existsSync(ico)) args.push('--set-icon', win(ico));
  execFileSync('wine', args, { stdio: 'inherit', env: { ...process.env, WINEDEBUG: '-all' } });
  console.log(`  • stamped icon + version into ${path.basename(exe)} via wine rcedit-x64`);
};
