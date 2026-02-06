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

const traceGroup = new THREE.Group();
scene.add(traceGroup);

const placedGroup = new THREE.Group();
scene.add(placedGroup);

const loader = new GLTFLoader();
let modelTemplate = null;
let modelReady = false;

let hitTestSource = null;
let localRefSpace = null;
let viewerSpace = null;
let hitTestSourceRequested = false;
let lastTracePos = new THREE.Vector3();
let hasLastTrace = false;
const maxTraceStamps = 1200;

function setStatus(text) {
  statusEl.textContent = text;
}

function addTraceStamp(position, quaternion) {
  const geo = new THREE.PlaneGeometry(0.06, 0.06);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x00c2ff,
    transparent: true,
    opacity: 0.25,
    depthWrite: false
  });
  const stamp = new THREE.Mesh(geo, mat);
  stamp.rotation.x = -Math.PI / 2;
  stamp.position.copy(position);
  stamp.quaternion.copy(quaternion);
  traceGroup.add(stamp);

  while (traceGroup.children.length > maxTraceStamps) {
    const child = traceGroup.children.shift();
    if (child) child.geometry.dispose();
  }

  clearBtn.disabled = traceGroup.children.length === 0;
}

function placeObject(matrix) {
  const group = new THREE.Group();

  if (modelTemplate) {
    const clone = modelTemplate.clone(true);
    clone.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
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

  group.applyMatrix4(matrix);
  placedGroup.add(group);
}

clearBtn.addEventListener("click", () => {
  traceGroup.children.forEach((child) => child.geometry.dispose());
  traceGroup.clear();
  clearBtn.disabled = true;
});

const arButton = ARButton.createButton(renderer, {
  requiredFeatures: ["hit-test", "local-floor"],
  optionalFeatures: ["anchors", "plane-detection"],
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
      if (reticle.visible) placeObject(reticle.matrix);
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
  hasLastTrace = false;
  reticle.visible = false;
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
          reticle.visible = true;
          reticle.matrix.fromArray(pose.transform.matrix);

          const pos = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
          if (!hasLastTrace) {
            lastTracePos.copy(pos);
            hasLastTrace = true;
          }

          if (pos.distanceTo(lastTracePos) > 0.05) {
            addTraceStamp(pos, reticle.quaternion);
            lastTracePos.copy(pos);
          }
        }
      } else {
        reticle.visible = false;
        setStatus("Searching for floor...");
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

renderer.domElement.addEventListener("click", () => {
  if (reticle.visible) placeObject(reticle.matrix);
});
