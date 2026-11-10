import * as THREE from 'three';

// Text sprites that keep a constant angular size, so a label 30 km away
// is as readable as one 30 m away (essential in a headset).

const cache = new Map();

export function makeLabel(lines, { color = '#7ff', size = 28, bg = 'rgba(0,10,20,0.55)' } = {}) {
  const text = Array.isArray(lines) ? lines : [lines];
  const key = text.join('\n') + color + size;
  let tex = cache.get(key);
  let aspect;
  if (!tex) {
    const pad = 10;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    ctx.font = `600 ${size}px ui-monospace, Menlo, Consolas, monospace`;
    const w = Math.ceil(Math.max(...text.map((t) => ctx.measureText(t).width))) + pad * 2;
    const lh = Math.round(size * 1.2);
    const h = lh * text.length + pad * 2;
    c.width = w;
    c.height = h;
    ctx.font = `600 ${size}px ui-monospace, Menlo, Consolas, monospace`;
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.fillStyle = color;
    ctx.textBaseline = 'top';
    text.forEach((t, i) => ctx.fillText(t, pad, pad + i * lh));
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.userData.aspect = w / h;
    tex.userData.lines = text.length;
    if (cache.size > 2000) cache.clear();
    cache.set(key, tex);
  }
  aspect = tex.userData.aspect;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true });
  const s = new THREE.Sprite(mat);
  s.center.set(0, 0); // anchor bottom-left so the label sits beside its object
  s.renderOrder = 10;
  s.userData.aspect = aspect;
  s.userData.lines = tex.userData.lines;
  s.userData.angular = 0.018; // label line height as a fraction of distance (~1 degree)
  return s;
}

const tmp = new THREE.Vector3();

/** Rescale a sprite (or any object) so it keeps a constant angular size from the camera. */
export function keepAngularSize(obj, cameraPos, angular) {
  obj.getWorldPosition(tmp);
  const d = tmp.distanceTo(cameraPos);
  const k = (angular ?? obj.userData.angular) * d;
  if (obj.isSprite) {
    const lines = obj.userData.lines || 1;
    obj.scale.set(k * obj.userData.aspect * lines * 0.8, k * lines * 0.8, 1);
  } else {
    obj.scale.setScalar(k);
  }
}

export function disposeLabel(s) {
  s.material.dispose();
}
