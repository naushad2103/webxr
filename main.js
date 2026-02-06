import * as THREE from "three";
import { ARButton } from "three/addons/webxr/ARButton.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const statusEl = document.getElementById("status");
const clearBtn = document.getElementById("clear");

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType("local-floor");
document.body.appendChild(renderer.domElement);

const light = new THREE.HemisphereLight(0xffffff, 0x222233, 1.2);
scene.add(light);

const dir = new THREE.DirectionalLight(0xffffff, 0.8);
dir.position.set(1, 2, 1);
scene.add(dir);

const reticleGeo = new THREE.RingGeometry(0.06, 0.08, 32).rotateX(-Math.PI / 2);
const reticleMat = new THREE.MeshBasicMaterial({ color: 0x00c2ff });
const reticle = new THREE.Mesh(reticleGeo, reticleMat);
reticle.matrixAutoUpdate = false;
reticle.visible = false;
scene.add(reticle);

const floorGlow = new THREE.Mesh(
  new THREE.CircleGeometry(0.18, 48),
  new THREE.MeshBasicMaterial({ color: 0x00c2ff, transparent: true, opacity: 0.15 })
);
floorGlow.rotation.x = -Math.PI / 2;
floorGlow.visible = false;
scene.add(floorGlow);

const placedGroup = new THREE.Group();
scene.add(placedGroup);

const loader = new GLTFLoader();
let modelTemplate = null;
let modelReady = false;

let hitTestSource = null;
let transientHitTestSource = null;
let localRefSpace = null;
let viewerSpace = null;
let hitTestSourceRequested = false;
let lastTransientHitMatrix = null;
let lastStableHitMatrix = null;
const surfaceUp = new THREE.Vector3(0, 1, 0);
const poseUp = new THREE.Vector3();

function setStatus(text) {
  statusEl.textContent = text;
}

function placeObject(matrix) {
  const group = new THREE.Group();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(pos, quat, scale);

  if (modelTemplate) {
    const clone = modelTemplate.clone(true);
    clone.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    clone.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(clone);
    const minY = box.min.y;
    clone.position.y -= minY;
    group.add(clone);
  } else {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.01, 32),
      new THREE.MeshStandardMaterial({ color: 0x222233, roughness: 0.6 })
    );
    base.position.y = 0.005;
    group.add(base);

    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.16, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x00c2ff, metalness: 0.2, roughness: 0.4 })
    );
    box.position.y = 0.1;
    group.add(box);
  }

  placedGroup.clear();
  group.position.copy(pos);
  group.quaternion.copy(quat);
  placedGroup.add(group);
}

clearBtn.disabled = true;
clearBtn.addEventListener("click", () => {});

const arButton = ARButton.createButton(renderer, {
  requiredFeatures: ["hit-test", "local-floor"],
  optionalFeatures: ["anchors", "plane-detection", "dom-overlay"],
  domOverlay: { root: document.body },
});

document.body.appendChild(arButton);

if (!("xr" in navigator)) {
  setStatus("WebXR not available in this browser. Try Chrome on Android.");
} else {
  setStatus("WebXR available. Tap AR to start.");
}

renderer.xr.addEventListener("sessionstart", async () => {
  const session = renderer.xr.getSession();
  if (session) {
    session.addEventListener("select", () => {
      if (lastTransientHitMatrix) {
        placeObject(lastTransientHitMatrix);
      } else if (lastStableHitMatrix) {
        placeObject(lastStableHitMatrix);
      } else if (reticle.visible) {
        placeObject(reticle.matrix);
      }
    });
  }

  setStatus("Session started. Move to find floor.");
});

loader.load(
  "./models/Desk02.glb",
  (gltf) => {
    modelTemplate = gltf.scene;
    modelTemplate.scale.set(0.2, 0.2, 0.2);
    modelReady = true;
    setStatus("Model loaded. Move to find floor.");
  },
  undefined,
  (err) => {
    modelReady = false;
    console.error(err);
    setStatus("Model failed to load. Using fallback shape.");
  }
);

renderer.xr.addEventListener("sessionend", () => {
  setStatus("Session ended.");
  hitTestSourceRequested = false;
  hitTestSource = null;
  reticle.visible = false;
  floorGlow.visible = false;
});

renderer.setAnimationLoop((timestamp, frame) => {
  if (frame) {
    const session = renderer.xr.getSession();

    if (!hitTestSourceRequested) {
      session.requestReferenceSpace("viewer").then((space) => {
        viewerSpace = space;
        return session.requestHitTestSource({ space: viewerSpace });
      }).then((source) => {
        hitTestSource = source;
      });

      session.requestHitTestSourceForTransientInput({ profile: "generic-touchscreen" }).then((source) => {
        transientHitTestSource = source;
      }).catch(() => {
        transientHitTestSource = null;
      });

      session.requestReferenceSpace("local-floor").then((space) => {
        localRefSpace = space;
      });

      session.addEventListener("end", () => {
        hitTestSourceRequested = false;
        hitTestSource = null;
      });

      hitTestSourceRequested = true;
    }

    if (hitTestSource && localRefSpace) {
      const hitTestResults = frame.getHitTestResults(hitTestSource);
      if (hitTestResults.length > 0) {
        const hit = hitTestResults[0];
        const pose = hit.getPose(localRefSpace);
        if (pose) {
          const orientation = pose.transform.orientation;
          reticle.matrix.fromArray(pose.transform.matrix);
          reticle.quaternion.set(orientation.x, orientation.y, orientation.z, orientation.w);

          poseUp.set(0, 1, 0).applyQuaternion(reticle.quaternion).normalize();
          const isHorizontal = poseUp.dot(surfaceUp) > 0.9;

          if (isHorizontal) {
            lastStableHitMatrix = new THREE.Matrix4().fromArray(pose.transform.matrix);
            reticle.visible = true;
            floorGlow.visible = true;
            floorGlow.position.setFromMatrixPosition(reticle.matrix);
            setStatus("Floor found. Tap to place.");
          } else {
            reticle.visible = false;
            floorGlow.visible = false;
            setStatus("Aim at the floor.");
          }
        }
      } else {
        reticle.visible = false;
        floorGlow.visible = false;
        setStatus("Searching for floor... Move device slowly.");
      }
    }

    if (transientHitTestSource && localRefSpace) {
      const transientResults = frame.getHitTestResultsForTransientInput(transientHitTestSource);
      lastTransientHitMatrix = null;
      for (const result of transientResults) {
        if (result.results.length > 0) {
          const hit = result.results[0];
          const pose = hit.getPose(localRefSpace);
          if (pose) {
            const m = new THREE.Matrix4().fromArray(pose.transform.matrix);
            const q = new THREE.Quaternion().setFromRotationMatrix(m);
            poseUp.set(0, 1, 0).applyQuaternion(q).normalize();
            const isHorizontal = poseUp.dot(surfaceUp) > 0.9;
            if (isHorizontal) {
              lastTransientHitMatrix = m;
              break;
            }
          }
        }
      }
    }
  }

  renderer.render(scene, camera);
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
