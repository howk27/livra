# EAS Submit Guide - App Store Submission

This guide walks you through submitting your Livra app to the App Store and Google Play Store using EAS Submit.

## 📋 Prerequisites

Before starting, ensure you have:

- [ ] Expo account (sign up at [expo.dev](https://expo.dev))
- [ ] EAS CLI installed globally (`npm install -g eas-cli`)
- [ ] Apple Developer account (for iOS) - $99/year
- [ ] Google Play Developer account (for Android) - $25 one-time
- [ ] App Store Connect app created (iOS)
- [ ] Google Play Console app created (Android)
- [ ] All environment variables set as EAS secrets
- [ ] App icons and splash screens meet store requirements

## 🔧 Step 1: Initialize EAS Project

If you haven't already initialized your EAS project:

# Login to your Expo account
eas login

# Initialize EAS project (this creates the project ID)
eas initAfter running `eas init`, update `app.json`:
- Replace `YOUR_EAS_PROJECT_ID` in the `extra.eas.projectId` field with the actual project ID

## 🔐 Step 2: Set Up Environment Variables

Set all production environment variables as EAS secrets:
sh
# Set Supabase URL
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "https://your-project.supabase.co"

# Set Supabase Anon Key
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "your-anon-key"

# Add any other environment variables your app needs
# eas secret:create --scope project --name VARIABLE_NAME --value "value"These secrets are automatically injected during production builds.

## 📱 Step 3: Configure iOS Submission (App Store)

### 3.1 Create App in App Store Connect

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Navigate to **My Apps** → **+** → **New App**
3. Fill in the required information:
   - **Platform**: iOS
   - **Name**: Livra
   - **Primary Language**: Your app's primary language
   - **Bundle ID**: `com.livra.app` (must match `app.json`)
   - **SKU**: A unique identifier (e.g., `livra-001`)
   - **User Access**: Full Access (or App Manager if using a team)

### 3.2 Get Your App Store Connect Credentials

You'll need three pieces of information:

1. **Apple ID**: Your Apple ID email address
2. **App Store Connect App ID**: 
   - In App Store Connect, go to your app
   - The App ID is in the URL: `https://appstoreconnect.apple.com/apps/[APP_ID]/...`
   - Or find it in **App Information** → **General Information** → **Apple ID**
3. **Apple Team ID**:
   - Go to [Apple Developer Portal](https://developer.apple.com/account)
   - Navigate to **Membership** → Your Team ID is displayed there

### 3.3 Update eas.json for iOS

Update the `submit.production.ios` section in `eas.json`:

"submit": {
  "production": {
    "ios": {
      "appleId": "your-actual-apple-id@example.com",
      "ascAppId": "1234567890",
      "appleTeamId": "ABCD123456"
    }
  }
}**Important**: Replace the placeholder values with your actual credentials.

### 3.4 Alternative: Use App-Specific Password (Recommended)

For better security, use an App-Specific Password instead of your main Apple ID password:

1. Go to [appleid.apple.com](https://appleid.apple.com)
2. Sign in and go to **Security** → **App-Specific Passwords**
3. Generate a new password for "EAS Submit"
4. When prompted during submission, use this password instead of your regular password

## 🤖 Step 4: Configure Android Submission (Google Play)

### 4.1 Create App in Google Play Console

1. Go to [Google Play Console](https://play.google.com/console)
2. Click **Create app**
3. Fill in the required information:
   - **App name**: Livra
   - **Default language**: Your app's primary language
   - **App or game**: App
   - **Free or paid**: Select based on your monetization
   - **Declarations**: Complete all required declarations

### 4.2 Create Service Account for API Access

1. In Google Play Console, go to **Setup** → **API access**
2. Click **Create new service account**
3. Follow the link to Google Cloud Console
4. Click **Create Service Account**
5. Fill in:
   - **Service account name**: `eas-submit` (or any name)
   - **Service account ID**: Auto-generated
   - Click **Create and Continue**
6. Skip role assignment (click **Continue**)
7. Click **Done**

### 4.3 Grant Service Account Access

1. Return to Google Play Console → **API access**
2. Find your newly created service account
3. Click **Grant access**
4. Select **Release manager** role (or **Admin** for full access)
5. Click **Invite user**

### 4.4 Create and Download Service Account Key

1. In Google Cloud Console, go to **IAM & Admin** → **Service Accounts**
2. Click on your service account
3. Go to **Keys** tab
4. Click **Add Key** → **Create new key**
5. Select **JSON** format
6. Click **Create** - the JSON file will download automatically

### 4.5 Store the Service Account Key

1. Move the downloaded JSON file to your project root directory
2. Name it something like `google-play-service-account.json`
3. **Important**: Add this file to `.gitignore` to avoid committing it:
nore
# Google Play Service Account
google-play-service-account.json
*.json
!package.json
!tsconfig.json### 4.6 Update eas.json for Android

Update the `submit.production.android` section in `eas.json`:

"submit": {
  "production": {
    "android": {
      "serviceAccountKeyPath": "./google-play-service-account.json",
      "track": "internal"
    }
  }
}**Track Options**:
- `internal` - Internal testing track (fastest, for testing)
- `alpha` - Alpha testing track
- `beta` - Beta testing track
- `production` - Production release (requires complete store listing)

For first submission, use `internal` to test the submission process.

## 🏗️ Step 5: Verify Bundle Configuration

Your `eas.json` production build is already configured correctly:

- **iOS**: `distribution: "store"` → Creates `.ipa` file (required for App Store)
- **Android**: `buildType: "aab"` → Creates Android App Bundle (required for Play Store)

✅ No changes needed - your bundles are properly configured!

## 🚀 Step 6: Build Production Apps

Build your apps for production:

# Build for iOS (creates .ipa)
npm run build:ios
# OR
eas build --platform ios --profile production

# Build for Android (creates .aab)
npm run build:android
# OR
eas build --platform android --profile production**Build Options**:
- Builds run in the cloud (no local setup needed)
- You can monitor progress at [expo.dev](https://expo.dev)
- Builds typically take 15-30 minutes
- You'll receive an email when the build completes

**Tip**: You can build both platforms simultaneously by opening two terminal windows.

## 📤 Step 7: Submit to App Stores

Once your builds are complete, submit them:

### 7.1 Submit iOS App
ash
npm run submit:ios
# OR
eas submit --platform ios --profile production**First-time submission**:
- EAS will prompt for your Apple ID password (or App-Specific Password)
- The submission process uploads the `.ipa` to App Store Connect
- You can then complete the submission in App Store Connect

**After submission**:
1. Go to App Store Connect → Your App → **TestFlight** tab
2. Wait for processing (usually 10-30 minutes)
3. Once processed, go to the **App Store** tab
4. Complete your store listing:
   - Screenshots (required for all device sizes)
   - Description
   - Keywords
   - Privacy Policy URL
   - Support URL
   - Age rating
5. Submit for review

### 7.2 Submit Android App

npm run submit:android
# OR
eas submit --platform android --profile production**First-time submission**:
- EAS uses your service account key automatically
- The submission process uploads the `.aab` to Google Play Console
- The app is automatically added to the selected track

**After submission**:
1. Go to Google Play Console → Your App
2. Complete your store listing:
   - App icon (512x512)
   - Feature graphic (1024x500)
   - Screenshots (at least 2, up to 8)
   - Short description (80 characters)
   - Full description (4000 characters)
   - Privacy Policy URL
   - Content rating questionnaire
3. If using `internal` track, add testers in **Testing** → **Internal testing**
4. Create a release and submit for review

## 🔄 Step 8: Update Version Numbers

For subsequent submissions, increment version numbers:

### iOS
In `app.json`, update:
{
  "expo": {
    "version": "1.0.1",  // Increment for new features
    "ios": {
      "buildNumber": "2"  // Increment for each build
    }
  }
}### Android
In `app.json`, update:n
{
  "expo": {
    "version": "1.0.1",  // Increment for new features
    "android": {
      "versionCode": 2  // Increment for each build
    }
  }
}**Version Guidelines**:
- `version`: Semantic version (e.g., 1.0.0, 1.0.1, 1.1.0)
- `buildNumber`/`versionCode`: Always increment, even for the same version

## ✅ Pre-Submission Checklist

Before submitting, verify:

- [ ] All environment variables are set in EAS secrets
- [ ] App icons meet store requirements:
  - iOS: 1024x1024 PNG, no transparency
  - Android: Adaptive icon configured
- [ ] Splash screen is configured
- [ ] Privacy Policy URL is ready
- [ ] App description and screenshots are prepared
- [ ] App tested on physical devices
- [ ] No console.logs in production (use logger utility)
- [ ] Version numbers are correct
- [ ] Bundle identifiers match store listings
- [ ] All required permissions have usage descriptions (iOS)

## 🐛 Troubleshooting

### iOS Submission Issues

**"Invalid credentials" error**:
- Verify your Apple ID, App ID, and Team ID in `eas.json`
- Try using an App-Specific Password instead of your main password
- Ensure your Apple Developer account is active

**"Bundle ID mismatch" error**:
- Verify `app.json` → `ios.bundleIdentifier` matches App Store Connect
- Ensure the bundle ID is registered in your Apple Developer account

**"Missing compliance" error**:
- Complete Export Compliance in App Store Connect
- If using encryption, update `usesNonExemptEncryption` in `app.json`

### Android Submission Issues

**"Service account key not found" error**:
- Verify the path in `eas.json` is correct
- Ensure the JSON file exists and is readable
- Check that the file isn't in `.gitignore` (it should be, but EAS needs access)

**"Permission denied" error**:
- Verify the service account has the correct role in Play Console
- Ensure you granted access after creating the service account
- Try regenerating the service account key

**"Package name mismatch" error**:
- Verify `app.json` → `android.package` matches Play Console
- Ensure the package name is unique and follows reverse domain notation

### Build Issues

**Build fails with environment variable error**:
- Verify all required secrets are set: `eas secret:list`
- Check secret names match exactly (case-sensitive)

**Build takes too long**:
- This is normal for first builds (15-30 minutes)
- Subsequent builds are usually faster due to caching
- Check build status at [expo.dev](https://expo.dev)

## 📚 Additional Resources

- [EAS Submit Documentation](https://docs.expo.dev/submit/introduction/)
- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [App Store Connect Help](https://help.apple.com/app-store-connect/)
- [Google Play Console Help](https://support.google.com/googleplay/android-developer)
- [Expo Forums](https://forums.expo.dev/)

## 🎯 Quick Reference Commands

# Build
eas build --platform ios --profile production
eas build --platform android --profile production

# Submit
eas submit --platform ios --profile production
eas submit --platform android --profile production

# Check secrets
eas secret:list

# View build status
eas build:list

# View submission status
eas submit:list---

**Note**: This guide assumes you've completed the initial app setup in both App Store Connect and Google Play Console. If you haven't created the apps yet, do that first before building and submitting.