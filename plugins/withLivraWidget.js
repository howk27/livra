const { withEntitlementsPlist } = require('@expo/config-plugins');
// Must import via app.plugin.js, not the package root — the package's main
// entry (ExtensionStorage.js) is the runtime module and references the `expo`
// global, which is unavailable in a Node/config-plugin context.
const withTargetsDir = require('@bacons/apple-targets/app.plugin');

const APP_GROUP_ID = 'group.com.livra.app';

function withAppGroupEntitlement(config) {
  return withEntitlementsPlist(config, (mod) => {
    const existing =
      mod.modResults['com.apple.security.application-groups'] ?? [];
    if (!existing.includes(APP_GROUP_ID)) {
      mod.modResults['com.apple.security.application-groups'] = [
        ...existing,
        APP_GROUP_ID,
      ];
    }
    return mod;
  });
}

function withLivraWidget(config) {
  config = withAppGroupEntitlement(config);
  // withTargetsDir scans ios/*/expo-target.config.js and wires up each target
  // including writing the Xcode target, pod extension, and EAS credentials.
  config = withTargetsDir(config, { root: './ios' });
  return config;
}

module.exports = withLivraWidget;
