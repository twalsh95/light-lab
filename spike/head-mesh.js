// Clay head-and-shoulders mesh for the three.js candidates (A and C).
// Same shapes as render_prototype.py: ellipsoids for head, neck and shoulders, with the
// nose, eye sockets, brow and chin pushed out of (or into) the front of the head.
import * as THREE from "three";
import { HEAD, UNIT, featureHeight } from "./scene.js";

function ellipsoid({ c, r }, segW, segH, displaceFront) {
  const g = new THREE.SphereGeometry(1, segW, segH);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // Unit sphere -> ellipsoid in prototype units.
    let x = c[0] + v.x * r[0], y = c[1] + v.y * r[1], z = c[2] + v.z * r[2];
    if (displaceFront && v.z > 0) {
      // Fade the features in over the front of the head so the sides stay smooth.
      const w = THREE.MathUtils.smoothstep(v.z, 0.15, 0.55);
      z += featureHeight(x, y) * w;
    }
    pos.setXYZ(i, x * UNIT, y * UNIT, z * UNIT);
  }
  g.computeVertexNormals();
  return g;
}

export function buildHeadGroup(material, quality = "medium") {
  const seg = { low: [96, 72], medium: [160, 120], high: [256, 192] }[quality] || [160, 120];
  const group = new THREE.Group();
  const parts = [
    ellipsoid(HEAD.head, seg[0], seg[1], true),
    ellipsoid(HEAD.neck, 48, 32, false),
    ellipsoid(HEAD.shoulders, 128, 64, false),
  ];
  for (const g of parts) {
    const m = new THREE.Mesh(g, material);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  return group;
}
