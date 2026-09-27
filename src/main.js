import * as THREE from "three";
import { createScene } from "./scene.js";
import { loadTeacher } from "./teacher.js";
import { speechSupported, watchEnglishVoices } from "./speech.js";
import { say, stopVoice, unlockVoices } from "./voice.js";
import { listen, listenSupported } from "./listen.js";
import { Lesson, LEVELS, SCENARIOS } from "./lesson.js";

const KEY_STORAGE = "msEmma.userKey";
const touchDevice = window.matchMedia("(pointer: coarse)").matches;

const $ = (id) => document.getElementById(id);
const stage = createScene($("stage"));
const timer = new THREE.Timer();
let teacher = null;

stage.renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = Math.min(timer.getDelta(), 0.1);
  teacher?.update(dt);
  stage.controls.update();
  stage.renderer.render(stage.scene, stage.camera);
});

loadTeacher(`${import.meta.env.BASE_URL}models/teacher.glb`)
  .then((t) => {
    teacher = t;
    stage.teacherAnchor.add(t.root);
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

// Ses seçimi: "natural" = sunucudaki doğal ses; sayılar tarayıcının İngilizce sesleri.
// Doğal ses kullanılamazsa fallbackVoice ile tarayıcı sesine geçilir.
let voices = [];
let fallbackVoice;
watchEnglishVoices((list) => {
  const select = $("voice");
  const previous = select.value === "natural" ? "natural" : voices[Number(select.value)]?.name;
  voices = list;
  select.replaceChildren(new Option("🌟 Doğal ses (Ms. Emma)", "natural"));
  list.forEach((v, i) => select.append(new Option(`${v.name} (${v.lang})`, String(i))));
  if (!list.length && !speechSupported) select.append(new Option("Tarayıcı sesi yok", "none"));

  let index = list.findIndex((v) => /en.US/i.test(v.lang) && /female|zira|aria|jenny|samantha|google us/i.test(v.name));
  if (index < 0) index = list.findIndex((v) => /en.US/i.test(v.lang));
  fallbackVoice = list[Math.max(index, 0)];

  const kept = list.findIndex((v) => v.name === previous);
  select.value = kept >= 0 ? String(kept) : "natural";
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
    const choice = $("voice").value;
    say(text, {
      natural: choice === "natural",
      browserVoice: voices[Number(choice)] ?? fallbackVoice,
      rate: Number($("rate").value),
      onStart: (level) => teacher?.startTalking(level),
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
    // Telefonda klavye açılıp sahneyi kapatmasın.
    if (started && !touchDevice) $("sentence").focus();
  }
}

$("btn-start").addEventListener("click", () => {
  if (busy) return;
  unlockVoices();
  stopVoice();
  lesson.reset({ scenario: $("scenario").value, level: $("level").value });
  started = true;
  $("transcript").replaceChildren();
  $("sentence").placeholder = listenSupported ? "🎤 konuş ya da yaz…" : "İngilizce yaz…";
  $("btn-start").textContent = "↻ Baştan";
  stage.board.setTitle(SCENARIOS[lesson.scenario].title);
  stage.board.setCorrection("", "");
  teacher?.wave();
  exchange("");
});

$("say-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("sentence").value.trim();
  if (!text || busy || !started) return;
  unlockVoices();
  $("sentence").value = "";
  if (touchDevice) $("sentence").blur();
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
  unlockVoices();
  stopVoice();
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

// ------------------------------------------------------------------ history toggle
// Konuşma tahtada göründüğü için geçmiş varsayılan olarak gizli.
$("btn-history").addEventListener("click", () => {
  const list = $("transcript");
  list.hidden = !list.hidden;
  $("btn-history").setAttribute("aria-pressed", String(!list.hidden));
  $("btn-history").classList.toggle("on", !list.hidden);
  if (!list.hidden) list.scrollTop = list.scrollHeight;
});
