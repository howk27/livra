module.exports = {
  type: 'widget',
  name: 'LivraWidget',
  bundleIdentifier: 'com.livra.app.widget',
  deploymentTarget: '16.0',
  frameworks: ['SwiftUI', 'WidgetKit', 'AppIntents'],
  entitlements: {
    'com.apple.security.application-groups': ['group.com.livra.app'],
  },
  // Category icons: the app's real Phosphor duotone glyphs, one per category,
  // with the category accent baked in (generated from phosphor-react-native).
  // Rendered as full-color imagesets so the widget matches the in-app tiles.
  images: {
    livra_moon: './icons/moon.png',
    livra_pulse: './icons/pulse.png',
    livra_drop: './icons/drop.png',
    livra_heart: './icons/heart.png',
    livra_briefcase: './icons/briefcase.png',
    livra_pencil: './icons/pencil.png',
    livra_shield: './icons/shield.png',
    livra_users: './icons/users.png',
    livra_currency: './icons/currency.png',
    livra_envelope: './icons/envelope.png',
    livra_calendar: './icons/calendar.png',
    livra_book: './icons/book.png',
    livra_circle: './icons/circle.png',
  },
};
