# Deep Links Setup Guide for Livra

This guide provides step-by-step instructions for setting up production deep links for the Livra app. Deep links allow users to open specific screens in your app directly from URLs (e.g., password reset emails, OAuth callbacks).

## Current Configuration

- **Domain**: `livralife.com`
- **Bundle ID (iOS)**: `com.livra.app`
- **Package Name (Android)**: `com.livra.app`
- **URL Scheme**: `livra://`
- **Supabase Redirect URLs**: Already configured ✅
- **AASA File**: Already deployed ✅

---

## Step 1: Verify AASA File Deployment

Your Apple App Site Association (AASA) file should be accessible at:
```
https://livralife.com/.well-known/apple-app-site-association
```

### Verify the File

Test that your AASA file is accessible and correctly formatted:

```bash
curl https://livralife.com/.well-known/apple-app-site-association
```

**Expected Requirements:**
- ✅ File must be served over HTTPS
- ✅ Content-Type header must be `application/json`
- ✅ No redirects allowed (must be direct file serve)
- ✅ File should contain your Team ID and bundle identifier

### Verify Content-Type

```bash
curl -I https://livralife.com/.well-known/apple-app-site-association
```

The response should include:
```
Content-Type: application/json
```

### AASA File Format

Your AASA file should look like this (replace `YOUR_TEAM_ID` with your actual Apple Team ID):

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "YOUR_TEAM_ID.com.livra.app",
        "paths": [
          "/auth/*",
          "/reset-password/*",
          "/*"
        ]
      }
    ]
  }
}
```

**To get your Apple Team ID:**
1. Go to [Apple Developer Account](https://developer.apple.com/account)
2. Sign in and click "Membership"
3. Copy your 10-character Team ID

---

## Step 2: Get Your Apple Team ID

You need your Apple Team ID to verify the AASA file is correctly configured.

1. Go to [Apple Developer Account](https://developer.apple.com/account)
2. Sign in with your Apple Developer account
3. Click on "Membership" in the left sidebar
4. Copy your **Team ID** (it's a 10-character alphanumeric string)

**Save this Team ID** - you'll need it to verify your AASA file format.

---

## Step 3: Get Android SHA-256 Fingerprint

Android requires your app's SHA-256 certificate fingerprint for the assetlinks.json file.

### 3.1 For Production Builds (Recommended)

After you build your app with EAS Build, you can get the fingerprint:

1. Build your app once:
   ```bash
   eas build --platform android --profile production
   ```

2. After the build completes, get your keystore information:
   ```bash
   eas credentials
   ```
   Select Android → Production → Show credentials

3. Extract the SHA-256 fingerprint from the keystore:
   ```bash
   keytool -list -v -keystore /path/to/your-keystore.jks -alias your-key-alias
   ```

   Look for the `SHA256:` line in the output.

### 3.2 Alternative: Check EAS Build Credentials

You can also check your credentials directly:
```bash
eas credentials
```

Select Android → Production → Show credentials

The fingerprint will be displayed in the output.

### 3.3 For Testing with Debug Build

For testing purposes with debug builds:
```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
```

**Note:** The production fingerprint is what you'll use in production.

---

## Step 4: Create and Host Android Asset Links File

Android uses a Digital Asset Links JSON file for verification.

### 4.1 Create the assetlinks.json File

Create a file named `assetlinks.json` with this content:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.livra.app",
    "sha256_cert_fingerprints": [
      "YOUR_SHA256_FINGERPRINT_HERE"
    ]
  }
}]
```

**Important:**
- Replace `YOUR_SHA256_FINGERPRINT_HERE` with your SHA-256 fingerprint from Step 3
- Remove any colons (`:`) from the fingerprint
- For example, if your fingerprint is `AA:BB:CC:DD:EE:FF...`, use `AABBCCDDEEFF...` in the JSON

### 4.2 Host the Asset Links File

Serve this file at:
```
https://livralife.com/.well-known/assetlinks.json
```

**Requirements:**
- ✅ Must be served over HTTPS
- ✅ Content-Type should be `application/json`
- ✅ Must be accessible without authentication

### 4.3 Verify Asset Links File

Test accessibility:
```bash
curl https://livralife.com/.well-known/assetlinks.json
```

You should see your JSON file content.

Also verify the Content-Type:
```bash
curl -I https://livralife.com/.well-known/assetlinks.json
```

---

## Step 5: Verify Supabase Configuration

Your Supabase redirect URLs should already be configured. Verify they match exactly:

### 5.1 Check Supabase Dashboard

1. Go to your [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Navigate to **Authentication** → **URL Configuration**

### 5.2 Verify Redirect URLs

Ensure these URLs are in the **Redirect URLs** section:

```
livra://auth/reset-password
livra://auth/callback
https://livralife.com/auth/reset-password
https://livralife.com/auth/callback
```

### 5.3 Verify Site URL

The **Site URL** should be set to:
```
https://livralife.com
```

---

## Step 6: Update app.json (Already Done ✅)

The `app.json` file has been updated with:

- ✅ iOS `associatedDomains` for `livralife.com` and `www.livralife.com`
- ✅ Android `intentFilters` with auto-verify enabled

**No action needed** - this is already configured.

---

## Step 7: Rebuild Your App

After making configuration changes, you need to rebuild your app for the deep links to work.

### 7.1 Clean Build

For iOS:
```bash
eas build --platform ios --profile production --clear-cache
```

For Android:
```bash
eas build --platform android --profile production --clear-cache
```

### 7.2 Why a Clean Build is Needed

- iOS needs the Associated Domains capability compiled into the app
- Android needs the intent filters in the manifest
- The native code must include the deep link configuration

**Important:** You cannot test universal/app links in development builds. You must use production builds.

---

## Step 8: Test Deep Links

After deploying your files and rebuilding your app, test the deep links.

### 8.1 Test Custom Scheme (Fallback)

Test the custom scheme URL (works immediately, no verification needed):

**iOS Simulator:**
```bash
xcrun simctl openurl booted "livra://auth/reset-password?token=test123&type=recovery"
```

**Android Emulator/Device:**
```bash
adb shell am start -W -a android.intent.action.VIEW -d "livra://auth/reset-password?token=test123&type=recovery" com.livra.app
```

### 8.2 Test Universal/App Links

Test the HTTPS URLs (requires verification files to be deployed):

**iOS Simulator:**
```bash
xcrun simctl openurl booted "https://livralife.com/auth/reset-password?token=test123&type=recovery"
```

**Android Emulator/Device:**
```bash
adb shell am start -W -a android.intent.action.VIEW -d "https://livralife.com/auth/reset-password?token=test123&type=recovery" com.livra.app
```

### 8.3 Test from Email/Web

1. Trigger a password reset email from your app
2. Click the link in the email
3. The app should open to the password reset screen

### 8.4 Verify Link Handling

When testing:
- ✅ Links should open your app (not the browser)
- ✅ App should navigate to the correct screen (`/auth/reset-password-complete`)
- ✅ Token and type parameters should be passed correctly

---

## Step 9: Verify Domain Association (Post-Build)

After building and installing your app, verify that the domain association works.

### 9.1 iOS Verification

1. Install your production build on a physical iOS device
2. Send yourself a test email with a link to `https://livralife.com/auth/reset-password?token=test&type=recovery`
3. Open the link in Safari (not in the Mail app)
4. The app should open directly (no "Open in..." prompt)

**Troubleshooting:**
- If you see "Open in..." prompt, the AASA file might not be verified
- Wait a few hours after deploying AASA - iOS caches verification results
- Check AASA file is accessible and has correct content-type
- Verify Team ID and Bundle ID are correct in AASA file

### 9.2 Android Verification

1. Install your production build on an Android device
2. Open Chrome and navigate to: `https://livralife.com/auth/reset-password?token=test&type=recovery`
3. You should see "Open in app" or the app should open automatically

**Troubleshooting:**
- Android verification happens when the app is first installed
- If links open in browser, check that `autoVerify: true` is set in app.json
- Verify assetlinks.json is accessible and has correct fingerprint
- Reinstall app after fixing assetlinks.json

---

## Troubleshooting

### AASA File Not Working

**Symptoms:**
- Links open in Safari instead of app
- "Open in..." prompt appears

**Solutions:**
- ✅ Verify file is at exact path: `/.well-known/apple-app-site-association`
- ✅ Check Content-Type is `application/json`
- ✅ Ensure no redirects (file must be served directly)
- ✅ Verify Team ID and Bundle ID are correct
- ✅ Wait 24 hours for iOS to re-verify (iOS caches verification)
- ✅ Test with [Apple's AASA Validator](https://search.developer.apple.com/appsearch-validation-tool/)

### Asset Links Not Working

**Symptoms:**
- Links open in browser instead of app
- No "Open in app" option

**Solutions:**
- ✅ Verify file is at exact path: `/.well-known/assetlinks.json`
- ✅ Check SHA-256 fingerprint matches your production keystore
- ✅ Remove colons from fingerprint in JSON
- ✅ Ensure package name matches exactly: `com.livra.app`
- ✅ Reinstall app after fixing assetlinks.json
- ✅ Test with [Google's Asset Links Tester](https://developers.google.com/digital-asset-links/tools/generator)

### Links Open in Browser Instead of App

**Solutions:**
- ✅ Ensure app is installed on the device
- ✅ Check that intent filters / associated domains are in app.json
- ✅ Verify you rebuilt the app after configuration changes
- ✅ Test with custom scheme first (should always work)
- ✅ For iOS: Wait for AASA verification (can take up to 24 hours)
- ✅ For Android: Reinstall app to trigger verification

### Supabase Redirect Not Working

**Symptoms:**
- Password reset emails don't open app
- OAuth callbacks fail

**Solutions:**
- ✅ Check all redirect URLs are added in Supabase dashboard
- ✅ Verify URL format matches exactly (case-sensitive)
- ✅ Test with a real password reset email
- ✅ Check Supabase logs for redirect errors
- ✅ Ensure Site URL is set to `https://livralife.com`

---

## Current Deep Link Implementation

Your app already has deep link handling code in `app/_layout.tsx` that:
- ✅ Listens for incoming URLs
- ✅ Parses password reset links
- ✅ Extracts tokens from URL parameters
- ✅ Navigates to the correct screen (`/auth/reset-password-complete`)

The code handles URLs in these formats:
- `livra://auth/reset-password?token=...&type=recovery`
- `livra://auth/reset-password#access_token=...&type=recovery`
- `https://livralife.com/auth/reset-password?token=...&type=recovery`

---

## Summary Checklist

Use this checklist to ensure everything is configured:

### Configuration Files
- [x] Updated `app.json` with iOS `associatedDomains` for `livralife.com`
- [x] Updated `app.json` with Android `intentFilters` for `livralife.com`
- [x] AASA file deployed at `/.well-known/apple-app-site-association`
- [ ] Created and hosted assetlinks.json at `/.well-known/assetlinks.json`

### Verification
- [ ] Got Apple Team ID
- [ ] Got Android SHA-256 fingerprint (production keystore)
- [x] Verified AASA file is accessible and returns JSON
- [ ] Verified assetlinks.json is accessible and returns JSON

### Supabase
- [x] Added all redirect URLs to Supabase dashboard
- [x] Updated Site URL in Supabase dashboard

### Build & Test
- [ ] Rebuilt iOS app with EAS Build
- [ ] Rebuilt Android app with EAS Build
- [ ] Tested custom scheme links (livra://)
- [ ] Tested universal/app links (https://livralife.com)
- [ ] Tested password reset email flow

---

## Next Steps

1. **Get your Apple Team ID** (Step 2)
2. **Get your Android SHA-256 fingerprint** (Step 3)
3. **Create and deploy assetlinks.json** (Step 4)
4. **Rebuild your apps** with EAS Build (Step 7)
5. **Test thoroughly** before releasing to production (Step 8)

---

## Additional Resources

- [Expo Linking Documentation](https://docs.expo.dev/guides/linking/)
- [Apple App Site Association Validator](https://search.developer.apple.com/appsearch-validation-tool/)
- [Android App Links Assistant](https://developer.android.com/studio/write/app-link-indexing)
- [Google Asset Links Tester](https://developers.google.com/digital-asset-links/tools/generator)
- [Supabase Auth Redirect URLs](https://supabase.com/docs/guides/auth/url-redirects)

---

## Quick Reference

**Your Domain:** `livralife.com`

**AASA File Location:**
```
https://livralife.com/.well-known/apple-app-site-association
```

**Asset Links File Location:**
```
https://livralife.com/.well-known/assetlinks.json
```

**Supabase Redirect URLs:**
- `livra://auth/reset-password`
- `livra://auth/callback`
- `https://livralife.com/auth/reset-password`
- `https://livralife.com/auth/callback`

**Test URLs:**
- Custom scheme: `livra://auth/reset-password?token=test&type=recovery`
- Universal link: `https://livralife.com/auth/reset-password?token=test&type=recovery`

