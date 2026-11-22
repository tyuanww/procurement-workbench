#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
jar="$root/.tools/tla2tools.jar"
if [ ! -f "$jar" ]; then
  mkdir -p "$root/.tools"
  curl -fsSL -o "$jar" https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar
fi
for spec in ImportLifecycle FactorySnapshot OAuthState; do
  echo "===== $spec"
  java -cp "$jar" tlc2.TLC -config "$root/$spec.cfg" -workers 2 "$root/$spec.tla"
done
