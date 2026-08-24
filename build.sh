#!/bin/bash -e

CWD="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${BUILD_DIR:-$CWD/build}"
VERSION="4.999.0"
DEBUG=

function usage {
	cat >&2 <<DONE
Usage: $0 [-v VERSION] [-d]
Options
 -v VERSION          use version VERSION
 -d                  build for debugging
DONE
	exit 1
}

while getopts "hv:d" opt; do
	case "$opt" in
		h) usage ;;
		v) VERSION="$OPTARG" ;;
		d) DEBUG=1 ;;
		*) usage ;;
	esac
done

TARGET="$BUILD_DIR/manifestv3"
rm -rf "$TARGET"
mkdir -p "$TARGET" "$TARGET/_locales/en" "$TARGET/lib"

rsync -r --exclude '.*' "$CWD/src/common/" "$TARGET/"
rsync -r --exclude '.*' "$CWD/src/browserExt/" "$TARGET/"
cp -r "$CWD/src/translate/src" "$TARGET/translate"
cp -r "$CWD/src/utilities" "$TARGET/utilities"
cp "$CWD/src/messages.json" "$TARGET/_locales/en/messages.json"
cp "$CWD/COPYING" "$TARGET/"
cp "$CWD/icons/Icon-16.png" "$CWD/icons/Icon-32.png" \
	"$CWD/icons/Icon-64.png" "$CWD/icons/Icon-128.png" "$TARGET/"

cp "$CWD/node_modules/react/umd/react.production.min.js" "$TARGET/lib/react.js"
cp "$CWD/node_modules/react-dom/umd/react-dom.production.min.js" "$TARGET/lib/react-dom.js"
cp "$CWD/node_modules/prop-types/prop-types.min.js" "$TARGET/lib/prop-types.js"
cp "$CWD/node_modules/dompurify/dist/purify.min.js" "$TARGET/lib/dompurify.js"

if [[ -n "$DEBUG" ]]; then
	cp "$CWD/node_modules/bluebird/js/browser/bluebird.js" "$TARGET/lib/bluebird.js"
	cp "$CWD/node_modules/chai/chai.js" "$TARGET/lib/chai.js"
	cp "$CWD/node_modules/mocha/mocha.js" "$TARGET/lib/mocha.js"
	cp "$CWD/node_modules/mocha/mocha.css" "$TARGET/lib/mocha.css"
	cp "$CWD/node_modules/sinon/pkg/sinon.js" "$TARGET/lib/sinon.js"
fi

find "$TARGET" -type f -name '*.jsx' -delete
rm -rf "$TARGET/utilities/.github" "$TARGET/utilities/test"
rm -f "$TARGET/manifest-v3.json" "$TARGET/manifest.json"
rm -f "$TARGET/utilities/package.json" "$TARGET/utilities/package-lock.json" \
	"$TARGET/utilities/COPYING" "$TARGET/utilities/README.md" \
	"$TARGET/utilities/resource/README.md"

if [[ -n "$DEBUG" ]]; then
	npx gulp process-custom-scripts --connector-version "$VERSION" > "$CWD/build.log" 2>&1
else
	npx gulp process-custom-scripts --connector-version "$VERSION" -p > "$CWD/build.log" 2>&1
	rm -rf "$TARGET/test"
fi

echo "Built $TARGET"
