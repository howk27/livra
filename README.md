# Livra

A minimalist, habit-free progress tracker built with React Native and Expo.

## Features

- ✅ **Simple Counter Tracking**: Create counters for anything - gym visits, books read, meditation days
- 🔥 **Automatic Streaks**: Track consecutive days of activity
- 📊 **7-Day Charts**: Visual progress tracking
- 📱 **Offline-First**: Works perfectly without internet
- ☁️ **Cloud Sync**: Optional Supabase sync across devices
- 🔔 **Reminders**: Local notifications to stay on track
- 💎 **Pro Features**: Unlimited counters, export, themes (one-time purchase)

## Tech Stack

- **Framework**: React Native + Expo
- **Language**: TypeScript
- **Navigation**: Expo Router
- **State Management**: Zustand
- **Data Fetching**: React Query
- **Local Storage**: SQLite (expo-sqlite)
- **Backend**: Supabase
- **UI**: React Native Paper / NativeWind
- **Animations**: React Native Reanimated
- **Charts**: Victory Native / react-native-svg-charts
- **IAP**: react-native-iap
- **Testing**: Jest + React Native Testing Library

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Expo CLI: `npm install -g expo-cli`
- iOS Simulator (Mac) or Android Studio

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory:
   ```
   EXPO_PUBLIC_SUPABASE_URL=your-supabase-url
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```

4. Start the development server:
   ```bash
   npm start
   ```

5. Run on your preferred platform:
   - Press `i` for iOS
   - Press `a` for Android
   - Press `w` for Web

### Supabase Setup

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Apply RLS policies from `SUPABASE_RLS_POLICIES.sql` for security
3. Copy your project URL and anon key to `.env`

## Project Structure

```
├── app/                    # Expo Router screens
│   ├── (tabs)/            # Tab navigation
│   │   ├── home.tsx       # Counters list
│   │   ├── stats.tsx      # Statistics
│   │   └── settings.tsx   # App settings
│   ├── counter/           # Counter detail screens
│   ├── onboarding.tsx     # First-run experience
│   └── paywall.tsx        # Pro upgrade
├── components/            # Reusable UI components
├── hooks/                 # Custom React hooks
├── lib/                   # Utilities and services
│   ├── db/               # SQLite database
│   ├── supabase.ts       # Supabase client
│   ├── date.ts           # Date utilities
│   ├── csv.ts            # CSV export
├── state/                 # Zustand stores
├── theme/                 # Colors and design tokens
└── types/                 # TypeScript definitions
```

## Available Scripts

- `npm start` - Start Expo dev server
- `npm run android` - Run on Android
- `npm run ios` - Run on iOS
- `npm run web` - Run on web
- `npm test` - Run tests
- `npm run lint` - Lint code
- `npm run format` - Format code with Prettier

## Key Features

### Free Tier
- Up to 3 counters
- Basic streak tracking
- 7-day charts
- Local notifications
- Offline functionality

### Pro (One-Time Purchase)
- Unlimited counters
- CSV & PDF export
- Premium themes
- Multiple reminders per counter
- Cloud backup

## Development

### Adding a New Counter Type

1. Update the `Counter` type in `types/index.ts`
2. Add migration in `lib/db/migrations/`
3. Update UI components as needed

### Testing

```bash
npm test
```

### Building for Production

**⚠️ IMPORTANT: Before building for production, ensure:**

1. **Supabase Configuration**: Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in your `.env` file
2. **EAS Project ID**: Update `app.json` with your actual EAS project ID (run `eas init` to get it)
3. **RLS Policies**: Apply `SUPABASE_RLS_POLICIES.sql` to ensure proper security

The build process will automatically validate production configuration using `scripts/validate-production-config.js`.

```bash
# iOS
eas build --platform ios --profile production

# Android
eas build --platform android --profile production
```

## Contributing

This is a showcase project built from the developer handoff spec. Feel free to fork and customize!

## License

MIT

## Acknowledgments

Built following the Livra Developer Handoff specification.

