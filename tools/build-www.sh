#!/usr/bin/env bash
# Copies the web game into www/ so Capacitor can package it into the APK.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf www && mkdir www
cp -r index.html manifest.webmanifest sw.js css js fonts icons www/
