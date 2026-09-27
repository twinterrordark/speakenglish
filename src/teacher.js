import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const FADE = 0.35;

export async function loadTeacher(url) {
  const gltf = await new GLTFLoader().loadAsync(url);
  return new Teacher(gltf);
}

/** Ms. Emma: animasyonlar, göz kırpma ve dudak hareketi. */
class Teacher {
  constructor(gltf) {
    this.root = gltf.scene;
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false; // skinned mesh sınırları animasyonda kayabiliyor
      }
    });

    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = {};
    for (const clip of gltf.animations) {
      this.actions[clip.name] = this.mixer.clipAction(clip);
    }
    for (const name of ["Wave", "Nod"]) {
      const a = this.actions[name];
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = false;
    }
    this.mixer.addEventListener("finished", (e) => {
      if (e.action === this.current) this._fadeTo(this.talking ? "Talk" : "Idle");
    });

    // Aynı isimli morph target'ı taşıyan tüm meshleri topla (çok materyalli nesneler bölünür).
    this.morphs = {};
    this.root.traverse((o) => {
      if (!o.morphTargetDictionary) return;
      for (const [name, index] of Object.entries(o.morphTargetDictionary)) {
        (this.morphs[name] ??= []).push({ mesh: o, index });
      }
    });

    this.talking = false;
    this.face = { mouthOpen: 0, mouthRound: 0, smile: 0.25, blink: 0 };
    this.target = { mouthOpen: 0, mouthRound: 0, smile: 0.25 };
    this.pulse = 0;
    this.time = 0;
    this.nextBlink = 1.5;
    this.blinkT = -1;

    this.current = null;
    this._fadeTo("Idle");
  }

  _fadeTo(name) {
    const next = this.actions[name];
    if (!next || next === this.current) return;
    next.reset().setEffectiveWeight(1).fadeIn(FADE).play();
    this.current?.fadeOut(FADE);
    this.current = next;
  }

  wave() {
    this._fadeTo("Wave");
    this.smileFor(2.2);
  }

  nod() {
    this._fadeTo("Nod");
    this.smileFor(1.2);
  }

  smileFor(seconds) {
    this.target.smile = 0.9;
    clearTimeout(this._smileTimer);
    this._smileTimer = setTimeout(() => (this.target.smile = 0.25), seconds * 1000);
  }

  startTalking() {
    this.talking = true;
    if (this.current !== this.actions.Wave && this.current !== this.actions.Nod) this._fadeTo("Talk");
  }

  stopTalking() {
    this.talking = false;
    this.target.mouthOpen = 0;
    this.target.mouthRound = 0;
    if (this.current === this.actions.Talk) this._fadeTo("Idle");
  }

  /** Konuşulan kelimeye göre ağız şeklini ayarlar. */
  speakWord(word) {
    this.pulse = 1;
    this.target.mouthRound = /[ouw]/i.test(word) ? 0.7 : 0.1;
  }

  _setMorph(name, value) {
    for (const { mesh, index } of this.morphs[name] ?? []) mesh.morphTargetInfluences[index] = value;
  }

  update(dt) {
    this.time += dt;
    this.mixer.update(dt);

    // Göz kırpma
    this.nextBlink -= dt;
    if (this.nextBlink <= 0 && this.blinkT < 0) {
      this.blinkT = 0;
      this.nextBlink = 2 + Math.random() * 3.5;
    }
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const d = 0.16;
      this.face.blink = this.blinkT < d ? Math.sin((this.blinkT / d) * Math.PI) : 0;
      if (this.blinkT >= d) this.blinkT = -1;
    }

    // Dudak hareketi: hece ritminde salınım + kelime sınırlarında vurgu
    if (this.talking) {
      const t = this.time;
      const syllable = Math.abs(Math.sin(t * 11)) * 0.55 + Math.abs(Math.sin(t * 17.3)) * 0.25;
      this.target.mouthOpen = Math.min(1, 0.1 + syllable + this.pulse * 0.35);
      this.pulse = Math.max(0, this.pulse - dt * 4);
    }

    const k = 1 - Math.exp(-dt * 18);
    for (const key of ["mouthOpen", "mouthRound", "smile"]) {
      this.face[key] += (this.target[key] - this.face[key]) * k;
    }
    for (const [name, value] of Object.entries(this.face)) this._setMorph(name, value);
  }
}
