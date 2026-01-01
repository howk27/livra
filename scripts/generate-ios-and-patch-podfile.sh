#!/usr/bin/env bash
set -euo pipefail

echo "==> [Livra] Generating iOS native project..."
npx expo prebuild --platform ios

if [ ! -f "ios/Podfile" ]; then
  echo "ERROR: ios/Podfile was not generated"
  exit 1
fi

echo "==> [Livra] Patching ios/Podfile to run pod repo update on CI/EAS..."

# Read the Podfile
PODFILE_CONTENT=$(cat ios/Podfile)

# Check if the patch is already applied
if echo "$PODFILE_CONTENT" | grep -q "\[Livra\] CI detected"; then
  echo "==> [Livra] Podfile already patched, skipping..."
else
  # Find the line number where we should insert the pre_install hook
  # We'll add it right after the platform declaration or at the top after require statements
  # This is a simple approach - insert before the first target block
  
  # Create a temporary file with the patch
  cat > /tmp/podfile_patch.rb << 'PATCH_END'
pre_install do |installer|
  if ENV['EAS_BUILD'] == 'true' || ENV['CI'] == 'true'
    Pod::UI.puts "[Livra] CI detected - running 'pod repo update' to avoid missing specs (RCT-Folly)"
    system('pod repo update')
  end
end

PATCH_END

  # Insert the patch after the platform line (or at the beginning if no platform line found early)
  if echo "$PODFILE_CONTENT" | grep -q "^platform :ios"; then
    # Insert after the platform line
    awk '/^platform :ios/ {print; while ((getline line < "/tmp/podfile_patch.rb") > 0) print line; close("/tmp/podfile_patch.rb"); next} 1' ios/Podfile > ios/Podfile.new
  else
    # Insert at the beginning (after any require statements)
    awk 'NR==1 {while ((getline line < "/tmp/podfile_patch.rb") > 0) print line; close("/tmp/podfile_patch.rb")} 1' ios/Podfile > ios/Podfile.new
  fi
  
  mv ios/Podfile.new ios/Podfile
  rm -f /tmp/podfile_patch.rb
  
  echo "==> [Livra] Podfile patched successfully"
fi

echo ""
echo "==> [Livra] iOS project generated and Podfile patched!"
echo "==> Next steps:"
echo "   1. Review the changes: git diff ios/Podfile"
echo "   2. Stage the ios/ directory: git add ios/"
echo "   3. Commit: git commit -m 'Add iOS native project with Podfile CI fix for RCT-Folly'"
echo ""
