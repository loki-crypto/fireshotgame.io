import * as THREE from "three";
import { hexTexture } from "./textures";

/** Pose da arma em repouso (quadril) e mirando, por arma. */
interface Pose {
  hip: THREE.Vector3;
  ads: THREE.Vector3;
  /** giro em repouso (a arma aponta um pouco para dentro) */
  hipYaw: number;
}

const DEFAULT_POSE: Pose = { hip: new THREE.Vector3(0.24, -0.22, -0.45), ads: new THREE.Vector3(0, -0.11, -0.3), hipYaw: -0.07 };

/** Modelos de arma em primeira pessoa, renderizados numa cena separada (não atravessam paredes). */
export class ViewModel {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private models = new Map<string, THREE.Group>();
  private poses = new Map<string, Pose>();
  private current: THREE.Group | null = null;
  private currentId = "";
  private recoil = 0;
  private switchAnim = 0;
  private bobT = 0;
  private shield: THREE.Mesh;
  private shieldMat: THREE.MeshBasicMaterial;
  private muzzle: THREE.PointLight;
  private reloadAnim = 0;
  /** 0 = quadril, 1 = mirando (interpolado para a animação) */
  private ads = 0;

  constructor(fov: number) {
    this.camera = new THREE.PerspectiveCamera(fov, 1, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0x9fc8ff, 0x101820, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 0.55);
    key.position.set(-0.6, 0.8, 0.4);
    this.scene.add(key);
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

  /** Materiais compartilhados: casco escuro, metal, borracha da empunhadura e emissivo da arma. */
  private materials(color: string) {
    return {
      shell: new THREE.MeshLambertMaterial({ color: 0x223049 }),
      shellDark: new THREE.MeshLambertMaterial({ color: 0x151d2c }),
      metal: new THREE.MeshLambertMaterial({ color: 0x4a5a76 }),
      grip: new THREE.MeshLambertMaterial({ color: 0x0f1622 }),
      glow: new THREE.MeshBasicMaterial({ color }),
      glowSoft: new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45 }),
    };
  }

  private build(id: string, color: string): { group: THREE.Group; pose: Pose } {
    const g = new THREE.Group();
    const m = this.materials(color);
    const box = (w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      g.add(mesh);
      return mesh;
    };
    const cyl = (r: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 12): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(x, y, z);
      g.add(mesh);
      return mesh;
    };
    /** Alça de mira: duas paredes e um ponto luminoso no meio, alinhados com a câmera no ADS. */
    const sights = (y: number, z: number, width = 0.035): void => {
      box(0.008, 0.022, 0.012, m.metal, -width, y, z);
      box(0.008, 0.022, 0.012, m.metal, width, y, z);
      box(0.006, 0.006, 0.01, m.glow, 0, y + 0.002, z);
      box(0.01, 0.016, 0.01, m.metal, 0, y, z - 0.26);
      box(0.005, 0.005, 0.008, m.glow, 0, y + 0.004, z - 0.26);
    };
    let pose = DEFAULT_POSE;

    switch (id) {
      case "patch_pistol": {
        // pistola compacta: carcaça, ferrolho, cano curto e carregador
        box(0.075, 0.085, 0.3, m.shell, 0, 0, -0.08);
        box(0.08, 0.045, 0.26, m.shellDark, 0, 0.055, -0.1);
        cyl(0.017, 0.12, m.metal, 0, 0.012, -0.3);
        box(0.062, 0.14, 0.085, m.grip, 0, -0.1, 0.045).rotation.x = 0.28;
        box(0.05, 0.02, 0.05, m.metal, 0, -0.03, 0.02);
        box(0.02, 0.012, 0.19, m.glow, 0, 0.081, -0.12);
        box(0.055, 0.03, 0.012, m.glowSoft, 0, 0.0, 0.06);
        sights(0.088, -0.03, 0.03);
        pose = { hip: new THREE.Vector3(0.22, -0.2, -0.42), ads: new THREE.Vector3(0, -0.095, -0.26), hipYaw: -0.08 };
        break;
      }
      case "scanner": {
        // varredura: antena parabólica com anel girando (o anel é animado em update)
        box(0.08, 0.1, 0.24, m.shell, 0, -0.03, 0.0);
        box(0.06, 0.12, 0.08, m.grip, 0, -0.11, 0.05).rotation.x = 0.3;
        cyl(0.02, 0.22, m.metal, 0, 0.02, -0.14);
        const dish = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.13, 16, 1, true), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.5 }));
        dish.rotation.x = -Math.PI / 2;
        dish.position.set(0, 0.02, -0.27);
        g.add(dish);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.006, 6, 24), m.glow);
        ring.name = "spin";
        ring.position.set(0, 0.02, -0.24);
        g.add(ring);
        box(0.05, 0.03, 0.012, m.glowSoft, 0, 0.055, -0.02);
        sights(0.075, -0.05, 0.028);
        pose = { hip: new THREE.Vector3(0.23, -0.21, -0.44), ads: new THREE.Vector3(0, -0.1, -0.3), hipYaw: -0.06 };
        break;
      }
      case "vpn_shield": {
        // emissor de túnel: placa hexagonal no antebraço
        box(0.19, 0.03, 0.2, m.shell, 0, -0.06, -0.04);
        box(0.05, 0.1, 0.07, m.grip, 0, -0.12, 0.05);
        const plate = new THREE.Mesh(new THREE.CircleGeometry(0.1, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, side: THREE.DoubleSide }));
        plate.position.set(0, -0.02, -0.14);
        g.add(plate);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.005, 6, 6), m.glow);
        rim.position.set(0, -0.02, -0.14);
        g.add(rim);
        box(0.02, 0.02, 0.1, m.glow, -0.085, -0.045, -0.06);
        box(0.02, 0.02, 0.1, m.glow, 0.085, -0.045, -0.06);
        pose = { hip: new THREE.Vector3(0.2, -0.2, -0.4), ads: new THREE.Vector3(0.05, -0.13, -0.28), hipYaw: -0.12 };
        break;
      }
      case "firewall_cannon": {
        // canhão: bloco, tambor de munição e boca larga
        box(0.14, 0.13, 0.4, m.shell, 0, 0, -0.12);
        box(0.16, 0.05, 0.3, m.shellDark, 0, 0.085, -0.14);
        cyl(0.055, 0.26, m.metal, 0, 0.0, -0.4);
        const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.055, 0.06, 12, 1, true), new THREE.MeshLambertMaterial({ color: 0x4a5a76, side: THREE.DoubleSide }));
        mouth.rotation.x = Math.PI / 2;
        mouth.position.set(0, 0, -0.54);
        g.add(mouth);
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.07, 10), m.metal);
        drum.rotation.z = Math.PI / 2;
        drum.position.set(0, -0.09, -0.06);
        g.add(drum);
        box(0.07, 0.14, 0.09, m.grip, 0, -0.13, 0.07).rotation.x = 0.3;
        box(0.03, 0.014, 0.24, m.glow, 0, 0.115, -0.16);
        box(0.09, 0.09, 0.012, m.glowSoft, 0, 0, -0.565);
        sights(0.125, -0.06, 0.038);
        pose = { hip: new THREE.Vector3(0.26, -0.24, -0.5), ads: new THREE.Vector3(0, -0.12, -0.34), hipYaw: -0.06 };
        break;
      }
      case "sanitizer": {
        // feixe de validação: tubo com reservatório e bobinas
        box(0.07, 0.07, 0.4, m.shell, 0, 0, -0.14);
        cyl(0.026, 0.3, m.metal, 0, 0.01, -0.34);
        for (const z of [-0.24, -0.32, -0.4]) {
          const coil = new THREE.Mesh(new THREE.TorusGeometry(0.037, 0.006, 6, 16), m.glow);
          coil.position.set(0, 0.01, z);
          g.add(coil);
        }
        const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.1, 4, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45 }));
        tank.rotation.x = Math.PI / 2;
        tank.position.set(0, 0.075, -0.02);
        g.add(tank);
        box(0.06, 0.13, 0.08, m.grip, 0, -0.1, 0.04).rotation.x = 0.28;
        box(0.02, 0.012, 0.18, m.glowSoft, 0, 0.045, -0.12);
        sights(0.08, -0.06, 0.028);
        pose = { hip: new THREE.Vector3(0.23, -0.21, -0.45), ads: new THREE.Vector3(0, -0.1, -0.3), hipYaw: -0.07 };
        break;
      }
      default:
        box(0.1, 0.1, 0.4, m.glow);
    }
    g.position.copy(pose.hip);
    g.rotation.y = pose.hipYaw;
    return { group: g, pose };
  }

  setWeapon(id: string, color: string): void {
    if (id === this.currentId) return;
    this.currentId = id;
    if (this.current) this.scene.remove(this.current);
    let model = this.models.get(id);
    if (!model) {
      const built = this.build(id, color);
      model = built.group;
      this.models.set(id, model);
      this.poses.set(id, built.pose);
    }
    this.current = model;
    this.scene.add(model);
    this.switchAnim = 1;
    this.muzzle.color.set(color);
  }

  kick(amount = 1): void {
    // mirando, o recuo sobe menos: a arma está encostada no ombro
    const damp = 1 - this.ads * 0.45;
    this.recoil = Math.min(1.5, this.recoil + amount * damp);
    this.muzzle.intensity = 2.5 * amount;
  }

  startReload(): void {
    this.reloadAnim = 1;
  }

  /** Fator de mira suavizado (0..1), usado pelo zoom da câmera do mundo e pela mira da HUD. */
  get adsFactor(): number {
    return this.ads;
  }

  update(
    dt: number,
    moving: boolean,
    sprinting: boolean,
    shieldUp: boolean,
    reduceMotion: boolean,
    aspect: number,
    fov: number,
    aiming = false,
  ): void {
    // a transição da mira é o coração da animação: rápida ao subir, um pouco mais lenta ao soltar
    const speed = aiming ? 11 : 8;
    this.ads += ((aiming ? 1 : 0) - this.ads) * Math.min(1, dt * speed);
    if (this.ads < 0.001) this.ads = 0;
    if (this.ads > 0.999) this.ads = 1;
    const ease = this.ads * this.ads * (3 - 2 * this.ads); // smoothstep

    this.camera.aspect = aspect;
    // a arma "cresce" um pouco na mira: lente mais fechada só no viewmodel
    this.camera.fov = fov * (1 - ease * 0.18);
    this.camera.updateProjectionMatrix();

    this.recoil = Math.max(0, this.recoil - dt * 8);
    this.switchAnim = Math.max(0, this.switchAnim - dt * 5);
    this.reloadAnim = Math.max(0, this.reloadAnim - dt * 1.4);
    this.muzzle.intensity = Math.max(0, this.muzzle.intensity - dt * 30);
    if (moving && !reduceMotion) this.bobT += dt * (sprinting ? 13 : 9);
    // mirando, o balanço quase desaparece
    const bob = (reduceMotion ? 0 : 1) * (1 - ease * 0.85);

    if (this.current) {
      const g = this.current;
      const pose = this.poses.get(this.currentId) ?? DEFAULT_POSE;
      const sway = Math.sin(this.bobT) * 0.012 * bob;
      const rise = Math.abs(Math.cos(this.bobT)) * 0.012 * bob;
      g.position.x = pose.hip.x + (pose.ads.x - pose.hip.x) * ease + sway;
      g.position.y = pose.hip.y + (pose.ads.y - pose.hip.y) * ease + rise
        - this.switchAnim * 0.25 - Math.sin(this.reloadAnim * Math.PI) * 0.12;
      g.position.z = pose.hip.z + (pose.ads.z - pose.hip.z) * ease + this.recoil * 0.06;
      g.rotation.x = this.recoil * 0.12 * (1 - ease * 0.4) + Math.sin(this.reloadAnim * Math.PI) * 0.6;
      g.rotation.y = pose.hipYaw * (1 - ease);
      g.rotation.z = (sprinting && !reduceMotion ? -0.25 : 0) * (1 - ease);
      const spin = g.getObjectByName("spin");
      if (spin) spin.rotation.z += dt * 2.4;
    }

    const target = shieldUp ? 0.42 : 0;
    this.shieldMat.opacity += (target - this.shieldMat.opacity) * Math.min(1, dt * 12);
    this.shield.visible = this.shieldMat.opacity > 0.01;
    if (this.shieldMat.map) this.shieldMat.map.offset.y += dt * 0.2;
  }
}
