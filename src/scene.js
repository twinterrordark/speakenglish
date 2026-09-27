import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#efe7da");
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 60);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 1.6;
  controls.minPolarAngle = 0.9;
  controls.maxPolarAngle = 1.65;
  controls.minAzimuthAngle = -0.9;
  controls.maxAzimuthAngle = 0.9;

  addLights(scene);
  addRoom(scene);
  const board = createChalkboard();
  scene.add(board.mesh);
  addDesk(scene);
  addPlant(scene);

  // Öğretmen modeli buraya eklenir; yerleşim değişince onunla birlikte taşınır.
  const teacherAnchor = new THREE.Group();
  scene.add(teacherAnchor);

  let layoutKey = "";

  /** Yatay ekranda tahta öğretmenin yanında, dikey (telefon) ekranda üstünde durur. */
  function applyLayout(w, h) {
    const aspect = w / h;
    const portrait = aspect < 0.85;
    // Tarayıcı çubuğu gizlenince sadece yükseklik değişir; kamerayı o yüzden sıfırlamayalım.
    const key = portrait ? `p${w}` : "l";
    if (key === layoutKey) return;
    layoutKey = key;

    if (portrait) {
      camera.fov = 50;
      board.setLarge(true);
      // Tahtanın alt kenarı öğretmenin başının (≈2 m) üstünde kalsın.
      board.mesh.position.set(0.1, 2.08 + board.height / 2, -1.52);
      teacherAnchor.position.set(0, 0, 0.25);
      teacherAnchor.rotation.y = 0;
      // Tahtanın tamamı (2.8 m) ekran genişliğine sığacak kadar geri çekil.
      const halfWidth = 1.55;
      const d = THREE.MathUtils.clamp(halfWidth / (Math.tan(THREE.MathUtils.degToRad(25)) * aspect), 4, 11);
      camera.position.set(0.1, 2.0, -1.52 + d);
      controls.target.set(0.1, 1.75, -1.52);
      controls.maxDistance = d + 2;
    } else {
      camera.fov = 35;
      board.setLarge(false);
      board.mesh.position.set(0.55, 1.55, -1.52);
      teacherAnchor.position.set(-0.75, 0, 0.1);
      teacherAnchor.rotation.y = 0.2;
      camera.position.set(0.1, 1.5, 4.4);
      controls.target.set(-0.1, 1.2, 0);
      controls.maxDistance = 6.5;
    }
    controls.update();
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    applyLayout(w, h);
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  return { renderer, scene, camera, controls, board, teacherAnchor };
}

function addLights(scene) {
  scene.add(new THREE.HemisphereLight("#fff6e8", "#b9a78f", 1.1));

  const sun = new THREE.DirectionalLight("#fff1dc", 2.4);
  sun.position.set(-3.5, 4.5, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -4;
  sun.shadow.camera.right = 4;
  sun.shadow.camera.top = 4;
  sun.shadow.camera.bottom = -2;
  sun.shadow.bias = -0.0004;
  sun.shadow.radius = 4;
  scene.add(sun);

  const fill = new THREE.DirectionalLight("#dfeaff", 0.6);
  fill.position.set(3, 2.5, 2);
  scene.add(fill);
}

function woodTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const g = c.getContext("2d");
  const plank = 64;
  for (let y = 0; y < c.height; y += plank) {
    const shade = 180 + Math.random() * 25;
    g.fillStyle = `rgb(${shade}, ${shade * 0.72}, ${shade * 0.48})`;
    g.fillRect(0, y, c.width, plank);
    g.fillStyle = "rgba(90, 55, 30, 0.35)";
    g.fillRect(0, y, c.width, 2);
    const seam = Math.random() * c.width;
    g.fillRect(seam, y, 2, plank);
    for (let i = 0; i < 18; i++) {
      g.fillStyle = `rgba(110, 70, 40, ${Math.random() * 0.08})`;
      g.fillRect(0, y + Math.random() * plank, c.width, 1 + Math.random() * 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.anisotropy = 8;
  return tex;
}

function addRoom(scene) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 8),
    new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.75 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = 1.5;
  floor.receiveShadow = true;
  scene.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({ color: "#f3e9d8", roughness: 0.95 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(12, 5), wallMat);
  back.position.set(0, 2.5, -1.6);
  back.receiveShadow = true;
  scene.add(back);

  const wainscot = new THREE.Mesh(
    new THREE.BoxGeometry(12, 0.9, 0.04),
    new THREE.MeshStandardMaterial({ color: "#9fc7bf", roughness: 0.8 }),
  );
  wainscot.position.set(0, 0.45, -1.58);
  wainscot.receiveShadow = true;
  scene.add(wainscot);

  const left = new THREE.Mesh(new THREE.PlaneGeometry(8, 5), wallMat);
  left.rotation.y = Math.PI / 2;
  left.position.set(-3.2, 2.5, 2.4);
  left.receiveShadow = true;
  scene.add(left);

  // Pencereden gelen ışık hissi
  const windowPane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 1.4),
    new THREE.MeshBasicMaterial({ color: "#fffaf0" }),
  );
  windowPane.rotation.y = Math.PI / 2;
  windowPane.position.set(-3.19, 1.9, 0.4);
  scene.add(windowPane);
  const frameMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.6 });
  for (const [w, h, y, z] of [[0.06, 1.5, 1.9, 0.4], [1.7, 0.06, 1.9, 0.4], [1.7, 0.08, 2.63, 0.4], [1.7, 0.08, 1.17, 0.4]]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, w === 0.06 ? 0.06 : w), frameMat);
    bar.position.set(-3.17, y, z);
    scene.add(bar);
  }
}

function addDesk(scene) {
  const desk = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: "#8a5a3b", roughness: 0.6 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.65), wood);
  top.position.y = 0.76;
  desk.add(top);
  for (const [x, z] of [[-0.6, -0.27], [0.6, -0.27], [-0.6, 0.27], [0.6, 0.27]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.74, 0.06), wood);
    leg.position.set(x, 0.37, z);
    desk.add(leg);
  }
  const bookColors = ["#d96c4f", "#3f7fbf", "#e8b84a"];
  bookColors.forEach((color, i) => {
    const book = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.05, 0.24),
      new THREE.MeshStandardMaterial({ color, roughness: 0.7 }),
    );
    book.position.set(-0.3, 0.815 + i * 0.05, 0.02);
    book.rotation.y = (i - 1) * 0.15;
    desk.add(book);
  });
  const apple = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 24, 16),
    new THREE.MeshStandardMaterial({ color: "#c8322e", roughness: 0.35 }),
  );
  apple.scale.y = 0.9;
  apple.position.set(0.3, 0.84, 0.05);
  desk.add(apple);
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.005, 0.005, 0.04),
    new THREE.MeshStandardMaterial({ color: "#4a3020" }),
  );
  stem.position.set(0.3, 0.9, 0.05);
  desk.add(stem);

  desk.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  desk.position.set(0.9, 0, 0.35);
  desk.rotation.y = -0.12;
  scene.add(desk);
}

function addPlant(scene) {
  const plant = new THREE.Group();
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.13, 0.32, 24),
    new THREE.MeshStandardMaterial({ color: "#d9774e", roughness: 0.8 }),
  );
  pot.position.y = 0.16;
  plant.add(pot);
  const leafMat = new THREE.MeshStandardMaterial({ color: "#4f9a58", roughness: 0.7 });
  for (let i = 0; i < 9; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), leafMat);
    const a = (i / 9) * Math.PI * 2;
    leaf.scale.set(0.6, 1.6, 0.35);
    leaf.position.set(Math.cos(a) * 0.1, 0.5 + (i % 3) * 0.08, Math.sin(a) * 0.1);
    leaf.rotation.set(Math.sin(a) * 0.5, -a, Math.cos(a) * 0.5);
    plant.add(leaf);
  }
  plant.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  plant.position.set(-2.3, 0, -1.0);
  scene.add(plant);
}

function createChalkboard() {
  const W = 2.6;
  const H = 1.25;
  const PX_PER_M = 640; // tuval çözünürlüğü: 2.6 m → 1664 px
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const group = new THREE.Group();
  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95 }),
  );
  surface.position.z = 0.03;
  group.add(surface);
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(W + 0.12, H + 0.12, 0.05),
    new THREE.MeshStandardMaterial({ color: "#8a5a3b", roughness: 0.6 }),
  );
  frame.receiveShadow = true;
  group.add(frame);
  const tray = new THREE.Mesh(
    new THREE.BoxGeometry(W, 0.03, 0.08),
    new THREE.MeshStandardMaterial({ color: "#7a4d31", roughness: 0.6 }),
  );
  tray.position.z = 0.06;
  group.add(tray);

  const state = { title: "Welcome to English Class!", text: "", highlight: -1, correction: "", tip: "", large: false };
  let background = null;

  /** Tahta boyunu ayarlar; dikey ekranda daha uzun tahta ve daha büyük yazı kullanılır. */
  function resizeBoard(height) {
    const k = height / H;
    surface.scale.y = k;
    frame.scale.y = (height + 0.12) / (H + 0.12);
    tray.position.y = -height / 2 - 0.05;
    canvas.width = Math.round(W * PX_PER_M);
    canvas.height = Math.round(height * PX_PER_M);
    texture.dispose(); // GPU'daki doku yeni boyutla yeniden oluşturulsun
    background = paintBackground(canvas.width, canvas.height);
  }

  /** Yeşil zemin ve tebeşir tozu bir kez çizilir; her kelime vurgusunda titremesin. */
  function paintBackground(w, h) {
    const bg = document.createElement("canvas");
    bg.width = w;
    bg.height = h;
    const g = bg.getContext("2d");
    const grad = g.createRadialGradient(w / 2, h / 2, 100, w / 2, h / 2, w * 0.7);
    grad.addColorStop(0, "#35584a");
    grad.addColorStop(1, "#243f35");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 30, 1 + Math.random() * 2);
    }
    return bg;
  }

  function wrap(words, maxWidth) {
    const lines = [];
    let line = [];
    for (let i = 0; i < words.length; i++) {
      const test = [...line.map((w) => w.word), words[i].word].join(" ");
      if (ctx.measureText(test).width > maxWidth && line.length) {
        lines.push(line);
        line = [];
      }
      line.push(words[i]);
    }
    if (line.length) lines.push(line);
    return lines;
  }

  const font = (weight, px) => `${weight} ${Math.round(px)}px Caveat, 'Comic Sans MS', cursive`;

  function draw() {
    const { width: w, height: h } = canvas;
    const s = state.large ? 1.3 : 1; // yazı ölçeği
    const left = 90;
    const maxWidth = w - 2 * left;
    ctx.drawImage(background, 0, 0);

    ctx.fillStyle = "#f6f1e3";
    ctx.textBaseline = "top";
    ctx.font = font(700, 96 * s);
    ctx.fillText(state.title, left, 50);
    ctx.fillRect(left, 50 + 112 * s, ctx.measureText(state.title).width, 4);

    const textTop = 80 + 145 * s;
    const lineHeight = 100 * s;
    const corrTop = h - 60 - 150 * s;

    if (state.text) {
      ctx.font = font(500, 84 * s);
      const words = state.text.split(/\s+/).filter(Boolean).map((word, i) => ({ word, i }));
      const bottom = state.correction ? corrTop - 30 : h - 30;
      const maxLines = Math.max(1, Math.floor((bottom - textTop) / lineHeight));
      wrap(words, maxWidth).slice(0, maxLines).forEach((line, li) => {
        let x = left;
        const y = textTop + li * lineHeight;
        for (const { word, i } of line) {
          const ww = ctx.measureText(word).width;
          if (i === state.highlight) {
            ctx.fillStyle = "rgba(255, 214, 102, 0.25)";
            ctx.fillRect(x - 8, y + 4 * s, ww + 16, 86 * s);
            ctx.fillStyle = "#ffd666";
          } else {
            ctx.fillStyle = "#f6f1e3";
          }
          ctx.fillText(word, x, y);
          x += ww + ctx.measureText(" ").width;
        }
      });
    } else {
      ctx.font = font(500, 64 * s);
      ctx.fillStyle = "rgba(246, 241, 227, 0.7)";
      ctx.fillText("Choose a topic and press start ✎", left, textTop + 20);
    }

    if (state.correction) {
      const fit = (text) => {
        let fitted = text;
        while (ctx.measureText(fitted).width > maxWidth && fitted.length > 4) fitted = fitted.slice(0, -2);
        return fitted === text ? text : fitted + "…";
      };
      ctx.fillStyle = "rgba(246, 241, 227, 0.35)";
      ctx.fillRect(left, corrTop - 20, maxWidth, 3);
      ctx.fillStyle = "#9be89b";
      ctx.font = font(700, 64 * s);
      ctx.fillText(fit("✓ " + state.correction), left, corrTop);
      if (state.tip) {
        ctx.fillStyle = "rgba(246, 241, 227, 0.8)";
        ctx.font = font(500, 52 * s);
        ctx.fillText(fit(state.tip), left, corrTop + 90 * s);
      }
    }
    texture.needsUpdate = true;
  }

  resizeBoard(H);
  draw();
  document.fonts?.load("700 96px Caveat").then(draw).catch(() => {});

  return {
    mesh: group,
    /** Dikey ekranda tahtanın gerçek yüksekliği (m). */
    get height() { return state.large ? 1.8 : H; },
    setLarge(large) {
      if (state.large === large) return;
      state.large = large;
      resizeBoard(large ? 1.8 : H);
      draw();
    },
    setTitle(title) { state.title = title; draw(); },
    setText(text) { state.text = text; state.highlight = -1; draw(); },
    highlightWord(index) { state.highlight = index; draw(); },
    setCorrection(correction, tip) { state.correction = correction; state.tip = tip; draw(); },
  };
}
