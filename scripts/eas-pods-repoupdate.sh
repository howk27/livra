#!/usr/bin/env bash
set -euo pipefail

echo "==> [EAS] CocoaPods repo update + pod install --repo-update"

# ios directory exists only after prebuild. If it doesn't exist, do nothing.
if [ -d "ios" ]; then
  cd ios

  # Update specs repo (trunk) and run install with repo update enabled
  pod repo update
  pod install --repo-update

  cd ..
else
  echo "==> [EAS] ios/ directory not present; skipping CocoaPods commands"
fi
