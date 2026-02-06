# WebXR Floor Trace (Three.js)

This is a minimal WebXR floor-detection demo that traces the floor using hit-test stamps and lets you place an object where the floor is detected.

## Run

WebXR requires HTTPS or localhost.

1. Start a local server in this folder.
2. Open the page on a compatible device (Chrome Android or WebXR-enabled iOS).

Example server:

```bash
python -m http.server 8000
```

Then visit:

```
http://<your-ip>:8000
```

## Notes

- Floor detection uses WebXR hit-test + local-floor reference space.
- “Perfect floor tracing” depends on device sensors and WebXR support.
- iOS Safari has limited WebXR; you may need WebXR-capable builds.
