# Build Configuration Notes

## iOS Build: React Native Prebuilt Pods Disabled

### Problem
EAS iOS builds were failing with:
```
[!] Unable to find a specification for `RCT-Folly` depended upon by `RNIap`
```

The issue occurred because EAS builds were using React Native prebuilt pods/tarballs (downloaded from repo1.maven.org), which caused CocoaPods dependency resolution issues when RNIap (react-native-iap) tried to find RCT-Folly.

### Solution
Disabled React Native prebuilt pods by setting the following environment variables in `eas.json` under `build.production.env`:

- `RCT_USE_RN_DEP: "0"` - Disables use of React Native dependency prebuilts
- `RCT_USE_PREBUILT_RNCORE: "0"` - Disables use of prebuilt React Native Core

These environment variables force CocoaPods to resolve dependencies from source specs rather than prebuilt tarballs, ensuring proper dependency resolution for RCT-Folly and other React Native dependencies.

### References
- React Native build configuration environment variables
- EAS Build environment variable documentation
