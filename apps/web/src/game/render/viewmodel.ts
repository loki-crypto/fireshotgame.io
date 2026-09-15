import * as THREE from "three";
import { hexTexture } from "./textures";

/** Modelos de arma em primeira pessoa, renderizados numa cena separada (não atravessam paredes). */
export class ViewModel {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private models = new Map<string, THREE.Group>();
  private current: THREE.Group | null = null;
  private currentId = "";
  private recoil = 0;
  private switchAnim = 0;
  private bobT = 0;
  private shield: THREE.Mesh;
  private shieldMat: THREE.MeshBasicMaterial;
  private muzzle: THREE.PointLight;
  private reloadAnim = 0;

  constructor(fov: number) {
    this.camera = new THREE.PerspectiveCamera(fov, 1, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0x9fc8ff, 0x101820, 1.6));
    this.muzzle = new THREE.PointLight(0x39d0ff, 0, 3);
    this.muzzle.position.set(0.25, -0.1, -0.9);
    this.scene.add(this.muzzle);
    const tex = hexTexture("#3dffc5");
    tex.repeat.set(3, 2);
    this.shieldMat = new THREE.MeshBasicMaterial({ map: tex, color: "#3dffc5", transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    this.shield = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0, 1, 1), this.shieldMat);
    this.shield.position.set(0, -0.05, -0.75);
    this.scene.add(this.shield);
  }

  private build(id: string, color: string): THREE.Group {
    const g = new THREE.Group();
    const dark = new THREE.MeshLambertMaterial({ color: 0x1b2638 });
    const glow = new THREE.MeshBasicMaterial({ color });
    const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      g.add(mesh);
      return mesh;
    };
    switch (id) {
      case "patch_pistol":
        box(0.09, 0.11, 0.42, dark, 0, 0, -0.1);
        box(0.08, 0.16, 0.1, dark, 0, -0.11, 0.04).rotation.x = 0.25;
        box(0.095, 0.02, 0.3, glow, 0, 0.065, -0.12);
        box(0.05, 0.05, 0.08, glow, 0, 0.01, -0.35);
        break;
      case "scanner": {
        box(0.08, 0.14, 0.25, dark, 0, -0.07, 0.02);
        const dish = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.14, 12, 1, true), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, wireframe: true }));
        dish.rotation.x = Math.PI / 2;
        dish.position.set(0, 0.03, -0.2);
        g.add(dish);
        box(0.03, 0.03, 0.2, glow, 0, 0.03, -0.18);
        break;
      }
      case "vpn_shield":
        box(0.18, 0.05, 0.22, dark, 0, -0.05, -0.05);
        box(0.16, 0.012, 0.2, glow, 0, -0.02, -0.05);
        box(0.02, 0.1, 0.02, glow, 0.06, 0.02, -0.12);
        break;
      case "firewall_cannon":
        box(0.16, 0.16, 0.5, dark, 0, 0, -0.15);
        box(0.1, 0.1, 0.25, dark, 0, 0.02, -0.5);
        box(0.17, 0.03, 0.4, glow, 0, 0.09, -0.12);
        box(0.12, 0.12, 0.03, glow, 0, 0.02, -0.63);
        box(0.08, 0.14, 0.1, dark, 0, -0.14, 0.02).rotation.x = 0.3;
        break;
      case "sanitizer":
        box(0.08, 0.08, 0.55, dark, 0, 0, -0.18);
        box(0.12, 0.12, 0.18, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 }), 0, 0.09, 0.02);
        box(0.03, 0.03, 0.25, glow, 0, 0, -0.5);
        break;
      default:
        box(0.1, 0.1, 0.4, glow);
    }
    g.position.set(0.24, -0.22, -0.45);
    return g;
  }

  setWeapon(id: string, color: string): void {
    if (id === this.currentId) return;
    this.currentId = id;
    if (this.current) this.scene.remove(this.current);
    let m = this.models.get(id);
    if (!m) { m = this.build(id, color); this.models.set(id, m); }
    this.current = m;
    this.scene.add(m);
    this.switchAnim = 1;
    (this.muzzle as THREE.PointLight).color.set(color);
  }

  kick(amount = 1): void {
    this.recoil = Math.min(1.5, this.recoil + amount);
    this.muzzle.intensity = 2.5 * amount;
  }

  startReload(): void {
    this.reloadAnim = 1;
  }

  update(dt: number, moving: boolean, sprinting: boolean, shieldUp: boolean, reduceMotion: boolean, aspect: number, fov: number): void {
    this.camera.aspect = aspect;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    this.recoil = Math.max(0, this.recoil - dt * 8);
    this.switchAnim = Math.max(0, this.switchAnim - dt * 5);
    this.reloadAnim = Math.max(0, this.reloadAnim - dt * 1.4);
    this.muzzle.intensity = Math.max(0, this.muzzle.intensity - dt * 30);
    if (moving && !reduceMotion) this.bobT += dt * (sprinting ? 13 : 9);
    const bob = reduceMotion ? 0 : 1;
    if (this.current) {
      const g = this.current;
      g.position.x = 0.24 + Math.sin(this.bobT) * 0.012 * bob;
      g.position.y = -0.22 + Math.abs(Math.cos(this.bobT)) * 0.012 * bob - this.switchAnim * 0.25 - Math.sin(this.reloadAnim * Math.PI) * 0.12;
      g.position.z = -0.45 + this.recoil * 0.06;
      g.rotation.x = this.recoil * 0.12 + Math.sin(this.reloadAnim * Math.PI) * 0.6;
      g.rotation.z = sprinting && !reduceMotion ? -0.25 : 0;
    }
    const target = shieldUp ? 0.42 : 0;
    this.shieldMat.opacity += (target - this.shieldMat.opacity) * Math.min(1, dt * 12);
    this.shield.visible = this.shieldMat.opacity > 0.01;
    if (this.shieldMat.map) this.shieldMat.map.offset.y += dt * 0.2;
  }
}
