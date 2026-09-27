import * as THREE from "three";
import { createScene } from "./scene.js";
import { loadTeacher } from "./teacher.js";
import { loadEnglishVoices, speak, speechSupported, stopSpeaking } from "./speech.js";
import { listen, listenSupported } from "./listen.js";
import { Lesson, LEVELS, SCENARIOS } from "./lesson.js";

const KEY_STORAGE = "msEmma.userKey";

const $ = (id) => document.getElementById(id);
const stage = createScene($("stage"));
const clock = new THREE.Clock();
let teacher = null;

stage.renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  teacher?.update(dt);
  stage.controls.update();
  stage.renderer.render(stage.scene, stage.camera);
});

loadTeacher("/models/teacher.glb")
  .then((t) => {
    teacher = t;
    t.root.position.copy(stage.teacherPosition);
    t.root.rotation.y = 0.2;
    stage.scene.add(t.root);
    $("loader").classList.add("hidden");
    setTimeout(() => t.wave(), 600);
  })
  .catch((err) => {
    console.error(err);
    $("loader").querySelector("p").textContent = "Model yüklenemedi: " + err.message;
  });

// ------------------------------------------------------------------ settings
function storage(action, value) {
  try {
    if (action === "get") return localStorage.getItem(KEY_STORAGE) ?? "";
    if (value) localStorage.setItem(KEY_STORAGE, value);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    return "";
  }
}

for (const [id, { label }] of Object.entries(SCENARIOS)) $("scenario").append(new Option(label, id));
for (const level of LEVELS) $("level").append(new Option(level, level));
$("user-key").value = storage("get");
$("user-key").addEventListener("change", (e) => storage("set", e.target.value.trim()));

let voices = [];
loadEnglishVoices().then((list) => {
  voices = list;
  const select = $("voice");
  if (!list.length) {
    select.append(new Option(speechSupported ? "Varsayılan" : "Desteklenmiyor", ""));
    return;
  }
  list.forEach((v, i) => select.append(new Option(`${v.name} (${v.lang})`, String(i))));
  const preferred = list.findIndex((v) => v.lang === "en-US" && /female|zira|aria|jenny|samantha|google us/i.test(v.name));
  select.value = String(preferred >= 0 ? preferred : 0);
});

// ------------------------------------------------------------------ lesson flow
const lesson = new Lesson({ getUserKey: () => $("user-key").value.trim() });
let busy = false;
let started = false;

function setStatus(text, isError = false) {
  $("status").textContent = text;
  $("status").classList.toggle("error", isError);
}

function setBusy(value) {
  busy = value;
  $("btn-send").disabled = value || !started;
  $("sentence").disabled = value || !started;
  $("btn-mic").disabled = value || !started || !listenSupported;
  $("btn-start").disabled = value;
}

function addTurn(role, text, correction, tip) {
  const li = document.createElement("li");
  li.className = role;
  const who = document.createElement("strong");
  who.textContent = role === "model" ? "Ms. Emma" : "Sen";
  li.append(who, document.createTextNode(" " + text));
  if (correction) {
    const fix = document.createElement("div");
    fix.className = "fix";
    fix.textContent = "✓ " + correction + (tip ? ` — ${tip}` : "");
    li.append(fix);
  }
  const list = $("transcript");
  list.append(li);
  while (list.children.length > 6) list.firstChild.remove();
  list.scrollTop = list.scrollHeight;
}

function teacherSays(text) {
  return new Promise((resolve) => {
    stage.board.setText(text);
    speak(text, {
      voice: voices[Number($("voice").value)],
      rate: Number($("rate").value),
      onStart: () => teacher?.startTalking(),
      onWord: (index, word) => {
        teacher?.speakWord(word);
        stage.board.highlightWord(index);
      },
      onEnd: () => {
        teacher?.stopTalking();
        stage.board.highlightWord(-1);
        resolve();
      },
    });
  });
}

async function exchange(message) {
  setBusy(true);
  setStatus("Ms. Emma düşünüyor…");
  try {
    const { reply, correction, tip } = await lesson.send(message);
    setStatus("");
    if (message) {
      addTurn("user", message, correction, tip);
      stage.board.setCorrection(correction, tip);
      if (!correction) teacher?.nod();
    }
    addTurn("model", reply);
    await teacherSays(reply);
  } catch (err) {
    setStatus(err.message, true);
    if (message) $("sentence").value = message;
  } finally {
    setBusy(false);
    if (started) $("sentence").focus();
  }
}

$("btn-start").addEventListener("click", () => {
  if (busy) return;
  stopSpeaking();
  lesson.reset({ scenario: $("scenario").value, level: $("level").value });
  started = true;
  $("transcript").replaceChildren();
  $("sentence").placeholder = listenSupported ? "🎤 ile konuş ya da buraya yaz…" : "Cevabını İngilizce yaz…";
  $("btn-start").textContent = "↻ Yeniden başla";
  stage.board.setTitle(SCENARIOS[lesson.scenario].title);
  stage.board.setCorrection("", "");
  teacher?.wave();
  exchange("");
});

$("say-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("sentence").value.trim();
  if (!text || busy || !started) return;
  $("sentence").value = "";
  exchange(text);
});

// ------------------------------------------------------------------ microphone
let recording = null;
if (!listenSupported) {
  $("btn-mic").title = "Bu tarayıcı konuşma tanımayı desteklemiyor (Chrome veya Edge deneyin)";
}
setBusy(false);

$("btn-mic").addEventListener("click", () => {
  if (recording) {
    recording.stop();
    return;
  }
  stopSpeaking();
  $("btn-mic").classList.add("on");
  setStatus("Dinliyorum… İngilizce konuş.");
  recording = listen({
    onInterim: (text) => ($("sentence").value = text),
    onFinal: (text) => {
      $("sentence").value = "";
      exchange(text);
    },
    onError: (code) => {
      const messages = {
        "not-allowed": "Mikrofon izni verilmedi.",
        "no-speech": "Ses duyamadım, tekrar dene.",
        network: "Konuşma tanıma için internet gerekiyor.",
      };
      setStatus(messages[code] ?? "Mikrofon hatası: " + code, true);
    },
    onEnd: () => {
      recording = null;
      $("btn-mic").classList.remove("on");
      if ($("status").textContent.startsWith("Dinliyorum")) setStatus("");
    },
  });
});
