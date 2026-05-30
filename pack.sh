#!/bin/bash

if [ -z "$1" ]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 v1.1.0"
  exit 1
fi

VERSION=$1

zip -r "release-${VERSION}.zip" \
. -x \
  "*.git*" \
  "*.antigravitycli*" \
  "README.md" \
  "pack.sh" \
  "release-*.zip"
  