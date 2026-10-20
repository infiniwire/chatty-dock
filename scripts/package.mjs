import { build, Platform } from 'electron-builder';
import { Arch } from 'builder-util';
import fs from 'node:fs/promises';
const [target, architecture = process.arch] = process.argv.slice(2);
const signed = process.env.DOCK_SIGNED === '1';
const updateE2e = process.env.DOCK_BUILD_UPDATE_TEST === '1';
const platform =
  target === 'win'
    ? Platform.WINDOWS
    : target === 'mac'
      ? Platform.MAC
      : process.platform === 'win32'
        ? Platform.WINDOWS
        : Platform.MAC;
const mac = platform === Platform.MAC;
if (signed) {
  if (
    mac &&
    (!process.env.CSC_LINK ||
      !process.env.CSC_KEY_PASSWORD ||
      !process.env.APPLE_ID ||
      !process.env.APPLE_APP_SPECIFIC_PASSWORD ||
      !process.env.APPLE_TEAM_ID)
  )
    throw new Error('Signed macOS builds require certificate and notarization credentials.');
  if (!mac && (!process.env.CSC_LINK || !process.env.CSC_KEY_PASSWORD))
    throw new Error('Signed Windows builds require certificate credentials.');
} else {
  process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
  // GitHub supplies unset secrets as empty environment strings. Remove them so
  // electron-builder cannot interpret an empty certificate path as the project directory.
  delete process.env.CSC_LINK;
  delete process.env.CSC_KEY_PASSWORD;
  delete process.env.CSC_INSTALLER_LINK;
  delete process.env.CSC_INSTALLER_KEY_PASSWORD;
}
const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
const config = {
  appId: updateE2e
    ? 'io.github.infiniwire.chatty-dock-update-test'
    : 'io.github.infiniwire.chatty-dock',
  productName: updateE2e ? 'ChattyDock Update Test' : 'ChattyDock',
  ...(updateE2e
    ? {
        extraMetadata: {
          name: 'chatty-dock-update-test',
          productName: 'ChattyDock Update Test',
          version: process.env.DOCK_TEST_VERSION,
        },
      }
    : {}),
  directories: { output: process.env.DOCK_OUTPUT_DIR || 'dist', buildResources: 'build' },
  files: ['out/**', 'package.json', '!**/*.map'],
  extraResources: [
    { from: 'build/icon.png', to: 'icon.png' },
    ...(mac ? [] : [{ from: 'build/icon.ico', to: 'icon.ico' }]),
  ],
  asar: true,
  artifactName: 'ChattyDock-${version}-${os}-${arch}.${ext}',
  forceCodeSigning: signed,
  publish: { provider: 'github', owner: 'infiniwire', repo: 'chatty-dock', private: true },
  electronUpdaterCompatibility: '>=6.8.9',
  win: {
    icon: 'build/icon.ico',
    target: [{ target: 'nsis', arch: ['x64'] }],
    ...(signed ? {} : { signExecutable: false }),
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: false,
    createDesktopShortcut: true,
    allowElevation: false,
  },
  mac: {
    icon: 'build/icon.icns',
    target: ['dmg', 'zip'],
    category: 'public.app-category.productivity',
    identity: signed ? undefined : '-',
    hardenedRuntime: signed,
    notarize: signed,
    ...(signed
      ? {
          entitlements: 'build/entitlements.mac.plist',
          entitlementsInherit: 'build/entitlements.mac.plist',
        }
      : {}),
    extendInfo: {
      NSMicrophoneUsageDescription:
        'Allow ChatGPT voice features when you approve microphone access.',
      NSCameraUsageDescription: 'Allow ChatGPT camera features when you approve camera access.',
    },
  },
};
await build({
  config,
  targets: platform.createTarget(
    target === 'dir' ? ['dir'] : undefined,
    architecture === 'arm64' ? Arch.arm64 : Arch.x64,
  ),
  publish: 'never',
});
console.log(
  `Packaged ${pkg.name} ${pkg.version}: ${platform.name} ${architecture}, ${signed ? 'signed' : 'uncredentialed'}.`,
);
