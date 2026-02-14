# 🚀 Quick Build Commands

## Development

```bash
# Web app
npm run dev                    # Start web server on :8000

# Desktop
npm run electron:dev           # Run Electron in dev mode (hot reload)

# Mobile
npm run mobile:android         # Open Android Studio
npm run mobile:ios             # Open Xcode
```

---

## Production Builds

### Windows Desktop
```bash
npm run electron:build
# Output: out/make/squirrel.windows/x64/SolCalendar-Setup.exe
```

### macOS Desktop
```bash
npm run electron:build
# Output: out/make/Sol Calendar.dmg
```

### Android Mobile
```bash
npm run mobile:build:android
# Output: android/app/build/outputs/apk/release/app-release.apk

# For Google Play (AAB):
npm run mobile:sync
cd android
./gradlew bundleRelease
# Output: app/build/outputs/bundle/release/app-release.aab
```

### iOS Mobile
```bash
npm run mobile:ios
# Then in Xcode: Product → Archive → Distribute
```

---

## First-Time Setup

### Desktop (Electron)
```bash
npm install
npm run electron:dev  # Test it works
```

### Mobile (Android)
```bash
npm install
npx cap add android
npm run mobile:sync
npm run mobile:android
```

### Mobile (iOS)
```bash
npm install
npx cap add ios
npm run mobile:sync
npm run mobile:ios
```

---

## File Sizes

- **Web:** 0 bytes (no build!)
- **Windows:** ~150MB
- **macOS:** ~200MB  
- **Android APK:** ~15MB
- **iOS IPA:** ~20MB

---

## Requirements

| Platform | Build OS | Tools |
|----------|----------|-------|
| **Web** | Any | Node.js |
| **Windows** | Windows/Mac/Linux | Node.js |
| **macOS** | macOS only | Xcode CLI |
| **Android** | Any | Android Studio + JDK 17 |
| **iOS** | macOS only | Xcode 14+ |

---

## Distribution

- **Windows:** .exe installer → Microsoft Store or direct download
- **macOS:** .dmg installer → Mac App Store or direct download
- **Android:** .apk or .aab → Google Play or sideload
- **iOS:** .ipa → App Store only (requires $99/year)

---

## Help

Full guide: [docs/BUILDING_APPS.md](BUILDING_APPS.md)
