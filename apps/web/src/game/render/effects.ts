import * as THREE from "three";
import type { Vec3 } from "@fireshot/sim";

interface Timed {
  obj: THREE.Object3D;
  age: number;
  life: number;
  update(k: number, dt: number): void;
  dispose(): void;
}

/** Efeitos visuais de curta duração (traçantes, faíscas, explosões, pulsos). */
export class Effects {
  private items: Timed[] = [];
  private sparkGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
  private ringGeo = new THREE.RingGeometry(0.92, 1, 48);
  private sphereGeo = new THREE.IcosahedronGeometry(1, 1);
  private beamGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 12, 1, true);
  maxItems = 260;

  constructor(private scene: THREE.Scene) {}

  private push(t: Timed): void {
    if (this.items.length >= this.maxItems) {
      const old = this.items.shift();
      if (old) { this.scene.remove(old.obj); old.dispose(); }
    }
    this.scene.add(t.obj);
    this.items.push(t);
  }

  tracer(from: Vec3, to: Vec3, color: string, width = 1): void {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(from.x, from.y, from.z), new THREE.Vector3(to.x, to.y, to.z)]);
    const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, linewidth: width });
    const line = new THREE.Line(g, m);
    this.push({ obj: line, age: 0, life: 0.08, update: (k) => { m.opacity = 0.9 * (1 - k); }, dispose: () => { g.dispose(); m.dispose(); } });
  }

  beam(from: Vec3, to: Vec3, color: string): void {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(from.x, from.y, from.z), new THREE.Vector3(to.x, to.y, to.z)]);
    const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending });
    const line = new THREE.Line(g, m);
    this.push({ obj: line, age: 0, life: 0.05, update: (k) => { m.opacity = 0.7 * (1 - k); }, dispose: () => { g.dispose(); m.dispose(); } });
  }

  sparks(at: Vec3, color: string, count = 8, speed = 4): void {
    const group = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending });
    const vel: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      const s = new THREE.Mesh(this.sparkGeo, m);
      s.position.set(at.x, at.y, at.z);
      group.add(s);
      vel.push(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random())));
    }
    this.push({
      obj: group, age: 0, life: 0.35,
      update: (k, dt) => {
        group.children.forEach((c, i) => {
          const v = vel[i]!;
          v.y -= 9 * dt;
          c.position.addScaledVector(v, dt);
        });
        m.opacity = 1 - k;
      },
      dispose: () => m.dispose(),
    });
  }

  fragments(at: Vec3, color: string, size = 1): void {
    const group = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color, transparent: true });
    const vel: THREE.Vector3[] = [];
    const rot: THREE.Vector3[] = [];
    const n = Math.round(10 * Math.min(2, size));
    for (let i = 0; i < n; i++) {
      const s = new THREE.Mesh(this.sparkGeo, m);
      s.scale.setScalar(2 + Math.random() * 3 * size);
      s.position.set(at.x, at.y + 0.5 * size, at.z);
      group.add(s);
      vel.push(new THREE.Vector3(Math.random() - 0.5, Math.random() * 1.2, Math.random() - 0.5).multiplyScalar(6 * Math.sqrt(size)));
      rot.push(new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0));
    }
    this.push({
      obj: group, age: 0, life: 0.9,
      update: (k, dt) => {
        group.children.forEach((c, i) => {
          const v = vel[i]!;
          v.y -= 14 * dt;
          c.position.addScaledVector(v, dt);
          if (c.position.y < 0.05) { c.position.y = 0.05; v.y *= -0.3; v.x *= 0.7; v.z *= 0.7; }
          c.rotation.x += rot[i]!.x * dt;
          c.rotation.y += rot[i]!.y * dt;
        });
        m.opacity = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      },
      dispose: () => m.dispose(),
    });
  }

  explosion(at: Vec3, radius: number, color: string): void {
    const m = new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, blending: THREE.AdditiveBlending });
    const s = new THREE.Mesh(this.sphereGeo, m);
    s.position.set(at.x, at.y, at.z);
    const rm = new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(this.ringGeo, rm);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(at.x, 0.05, at.z);
    const group = new THREE.Group();
    group.add(s, ring);
    this.push({
      obj: group, age: 0, life: 0.45,
      update: (k) => {
        s.scale.setScalar(0.3 + radius * k);
        ring.scale.setScalar(0.3 + radius * 1.1 * k);
        m.opacity = 1 - k;
        rm.opacity = 0.8 * (1 - k);
      },
      dispose: () => { m.dispose(); rm.dispose(); },
    });
    this.sparks(at, color, 18, 9);
  }

  pulse(at: Vec3, radius: number, color: string, life = 0.6): void {
    const rm = new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(this.ringGeo, rm);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(at.x, 0.08, at.z);
    const sm = new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, blending: THREE.AdditiveBlending });
    const sphere = new THREE.Mesh(this.sphereGeo, sm);
    sphere.position.set(at.x, 1, at.z);
    const group = new THREE.Group();
    group.add(ring, sphere);
    this.push({
      obj: group, age: 0, life,
      update: (k) => {
        const r = 0.5 + radius * k;
        ring.scale.setScalar(r);
        sphere.scale.set(r, r * 0.35, r);
        rm.opacity = 0.9 * (1 - k);
        sm.opacity = 0.35 * (1 - k);
      },
      dispose: () => { rm.dispose(); sm.dispose(); },
    });
  }

  column(at: Vec3, color: string, height = 3.2, life = 0.7): void {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
    const c = new THREE.Mesh(this.beamGeo, m);
    c.position.set(at.x, height / 2, at.z);
    c.scale.set(1.2, height, 1.2);
    this.push({ obj: c, age: 0, life, update: (k) => { m.opacity = 0.6 * (1 - k); c.scale.x = c.scale.z = 1.2 * (1 - k * 0.7); }, dispose: () => m.dispose() });
  }

  update(dt: number): void {
    const keep: Timed[] = [];
    for (const it of this.items) {
      it.age += dt;
      const k = Math.min(1, it.age / it.life);
      it.update(k, dt);
      if (it.age >= it.life) {
        this.scene.remove(it.obj);
        it.dispose();
      } else keep.push(it);
    }
    this.items = keep;
  }

  dispose(): void {
    for (const it of this.items) { this.scene.remove(it.obj); it.dispose(); }
    this.items = [];
    this.sparkGeo.dispose();
    this.ringGeo.dispose();
    this.sphereGeo.dispose();
    this.beamGeo.dispose();
  }
}

/** Textos flutuantes em DOM (×2.5, ×0.5, "bloqueado"…), projetados a partir de posições do mundo. */
export class FloatingTexts {
  private items: { el: HTMLDivElement; pos: THREE.Vector3; age: number; life: number }[] = [];
  private v = new THREE.Vector3();

  constructor(private container: HTMLElement) {}

  add(text: string, pos: Vec3, className: string, life = 0.9): void {
    if (this.items.length > 40) this.remove(0);
    const el = document.createElement("div");
    el.className = `float-text ${className}`;
    el.textContent = text;
    this.container.appendChild(el);
    this.items.push({ el, pos: new THREE.Vector3(pos.x, pos.y, pos.z), age: 0, life });
  }

  private remove(i: number): void {
    const [it] = this.items.splice(i, 1);
    it?.el.remove();
  }

  update(dt: number, camera: THREE.Camera, width: number, height: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]!;
      it.age += dt;
      if (it.age >= it.life) { this.remove(i); continue; }
      this.v.copy(it.pos);
      this.v.y += it.age * 0.9;
      this.v.project(camera);
      if (this.v.z > 1) { it.el.style.opacity = "0"; continue; }
      const x = (this.v.x * 0.5 + 0.5) * width;
      const y = (-this.v.y * 0.5 + 0.5) * height;
      it.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      it.el.style.opacity = String(1 - Math.max(0, (it.age / it.life - 0.6) / 0.4));
    }
  }

  clear(): void {
    this.items.forEach((it) => it.el.remove());
    this.items = [];
  }
}
