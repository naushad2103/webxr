# WebAR Notes

Date: 2026-02-06

## Current Setup
- App path: C:\Users\DELL\Desktop\WebAR\webxr-floor
- Live URL: https://naushad2103.github.io/webxr/
- Model file: C:\Users\DELL\Desktop\WebAR\webxr-floor\models\Desk02.glb

## What Changed
- Switched to @google/model-viewer for reliable AR placement.
- index.html now uses <model-viewer> with AR placement on floor.
- style.css updated to make <model-viewer> full screen.

## Why
- WebXR hit-test behavior was inconsistent on the device.
- model-viewer provides a simpler, more reliable “tap to place on floor” UX.

## How To Use
1. Open the live URL on a mobile device.
2. Tap the AR button.
3. Follow on-screen prompts and tap to place the model.

## Notes
- iOS uses Quick Look (USDZ) for best results.
- Android uses Scene Viewer / WebXR based on availability.
