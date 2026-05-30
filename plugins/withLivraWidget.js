/**
 * Expo Config Plugin: Livra Widget
 *
 * Does two things:
 *  1. Adds the App Group entitlement to the main app's iOS entitlements plist
 *     so the app and the LivraWidget extension can share data via NSUserDefaults.
 *  2. Registers the LivraWidget extension target with Xcode via
 *     @bacons/apple-targets `withWidget`, pointing at the Swift source files
 *     already committed in ios/LivraWidget/.
 */

const { withEntitlementsPlist } = require('@expo/config-plugins');
const path = require('path');

// The App Group identifier shared between the main app and the widget extension.
const APP_GROUP_ID = 'group.com.livra.app';

// Widget bundle identifier (appended to the main app bundle ID).
const WIDGET_BUNDLE_ID = '.widget';

// ---------------------------------------------------------------------------
// 1. Main app entitlement — adds the application-groups array entry
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// 2. Widget extension target — uses @bacons/apple-targets withWidget
//    The Swift source files live in ios/LivraWidget/ (force-tracked in git).
// ---------------------------------------------------------------------------
function withLivraWidgetTarget(config) {
  // withWidget is not re-exported from the package root, but it is accessible
  // from the internal build path.  This is intentional — the package author
  // only exports withTargetsDir as the public API, but withWidget is the
  // primitive it delegates to and is stable across 4.x.
  // The module uses ES module interop — the actual function is on .default
  const withWidget = require('@bacons/apple-targets/build/with-widget').default;

  const projectRoot = config._internal?.projectRoot ?? process.cwd();

  // The directory containing the Swift source files, relative to projectRoot.
  const widgetDirectory = 'ios/LivraWidget';

  // configPath is used internally only to derive the target directory name
  // (path.dirname → path.basename).  We synthesise a path that resolves to
  // ios/LivraWidget so the target gets the right name.
  const syntheticConfigPath = path.join(
    projectRoot,
    widgetDirectory,
    'expo-target.config.js',
  );

  return withWidget(config, {
    type: 'widget',
    name: 'LivraWidget',
    bundleIdentifier: WIDGET_BUNDLE_ID,
    deploymentTarget: '16.0',
    frameworks: ['SwiftUI', 'WidgetKit'],
    entitlements: {
      'com.apple.security.application-groups': [APP_GROUP_ID],
    },
    directory: widgetDirectory,
    configPath: syntheticConfigPath,
  });
}

// ---------------------------------------------------------------------------
// Composed plugin — apply both modifications in sequence
// ---------------------------------------------------------------------------
function withLivraWidget(config) {
  config = withAppGroupEntitlement(config);
  config = withLivraWidgetTarget(config);
  return config;
}

module.exports = withLivraWidget;
