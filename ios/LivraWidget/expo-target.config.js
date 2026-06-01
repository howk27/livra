module.exports = {
  type: 'widget',
  name: 'LivraWidget',
  bundleIdentifier: '.widget',
  deploymentTarget: '16.0',
  frameworks: ['SwiftUI', 'WidgetKit'],
  entitlements: {
    'com.apple.security.application-groups': ['group.com.livra.app'],
  },
};
