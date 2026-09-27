import * as THREE from "three";
import { createScene } from "./scene.js";
import { loadTeacher } from "./teacher.js";
import { speechSupported, watchEnglishVoices } from "./speech.js";
import { say, stopVoice, unlockVoices } from "./voice.js";
import { listen, listenSupported } from "./listen.js";
import { Lesson, LEVELS, SCENARIOS } from "./lesson.js";
import { notebook } from "./notebook.js";
import { showNotebook, showReport } from "./sheets.js";

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
const prefs = {
  get(key) {
    try {
      return localStorage.getItem(`msEmma.${key}`) ?? "";
    } catch {
      return "";
    }
  },
  set(key, value) {
    try {
      if (value) localStorage.setItem(`msEmma.${key}`, value);
      else localStorage.removeItem(`msEmma.${key}`);
    } catch {
      // Depolama kapalıysa ayar sadece bu oturumda geçerli.
    }
  },
};

for (const [id, { label }] of Object.entries(SCENARIOS)) $("scenario").append(new Option(label, id));
for (const level of LEVELS) $("level").append(new Option(level, level));
$("user-key").value = prefs.get("userKey");
$("user-key").addEventListener("change", (e) => prefs.set("userKey", e.target.value.trim()));
$("hands-free").checked = prefs.get("handsFree") === "1";
$("hands-free").addEventListener("change", (e) => prefs.set("handsFree", e.target.checked ? "1" : ""));

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

// ------------------------------------------------------------------ speaking
function voiceOptions() {
  const choice = $("voice").value;
  return {
    natural: choice === "natural",
    browserVoice: voices[Number(choice)] ?? fallbackVoice,
    rate: Number($("rate").value),
  };
}

function teacherSays(text) {
  return new Promise((resolve) => {
    stage.board.setText(text);
    say(text, {
      ...voiceOptions(),
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

/** Defter ve rapordaki 🔊 düğmeleri. */
function pronounce(word) {
  unlockVoices();
  say(word, {
    ...voiceOptions(),
    onStart: (level) => teacher?.startTalking(level),
    onEnd: () => teacher?.stopTalking(),
  });
}

// ------------------------------------------------------------------ lesson flow
const lesson = new Lesson({ getUserKey: () => $("user-key").value.trim() });
let lessonId = 0; // Ders bitince ya da yeniden başlayınca eski isteklerin sonuçları yok sayılır.
let busy = false;
let started = false;
let session = null;
let recording = null;

function setStatus(text, isError = false) {
  $("status").textContent = text;
  $("status").classList.toggle("error", isError);
}

function setBusy(value) {
  busy = value;
  $("btn-send").disabled = value || !started;
  $("sentence").disabled = value || !started;
  $("btn-mic").disabled = value || !started || !listenSupported;
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

/** Ders raporu ve kelime defteri için bu turu kaydeder. */
function record(message, { correction, tip, word, wordTr, emoji }) {
  if (message) {
    session.turns++;
    if (correction) {
      const mistake = { wrong: message, right: correction, tip };
      session.corrections.push(mistake);
      notebook.addMistake(mistake);
    }
  }
  if (word) {
    const entry = { word, tr: wordTr, emoji };
    if (!session.words.some((w) => w.word.toLowerCase() === word.toLowerCase())) session.words.push(entry);
    notebook.addWord(entry);
  }
}

async function exchange(message) {
  const id = lessonId;
  setBusy(true);
  setStatus("Ms. Emma düşünüyor…");
  let listenAfter = false;
  try {
    const result = await lesson.send(message);
    if (id !== lessonId) return;
    const { reply, correction, tip, word, wordTr, emoji } = result;
    setStatus("");
    record(message, result);
    if (message) {
      addTurn("user", message, correction, tip);
      stage.board.setCorrection(correction, tip);
      if (!correction) teacher?.nod();
    }
    stage.board.setPicture({ emoji, word, tr: wordTr });
    addTurn("model", reply);
    await teacherSays(reply);
    listenAfter = id === lessonId && $("hands-free").checked;
  } catch (err) {
    if (id !== lessonId) return;
    setStatus(err.message, true);
    if (message) $("sentence").value = message;
  } finally {
    if (id === lessonId) {
      setBusy(false);
      if (listenAfter) startListening({ auto: true });
      // Telefonda klavye açılıp sahneyi kapatmasın.
      else if (started && !touchDevice) $("sentence").focus();
    }
  }
}

function startLesson() {
  unlockVoices();
  stopVoice();
  lessonId++;
  lesson.reset({ scenario: $("scenario").value, level: $("level").value, review: notebook.reviewItems() });
  session = { turns: 0, corrections: [], words: [] };
  started = true;
  $("transcript").replaceChildren();
  $("sentence").placeholder = listenSupported ? "🎤 konuş ya da yaz…" : "İngilizce yaz…";
  $("btn-start").textContent = "🏁 Bitir";
  stage.board.setTitle(SCENARIOS[lesson.scenario].title);
  stage.board.setCorrection("", "");
  stage.board.setPicture();
  teacher?.wave();
  exchange("");
}

function finishLesson() {
  lessonId++;
  stopVoice();
  recording?.stop();
  started = false;
  setBusy(false);
  setStatus("");
  $("sentence").value = "";
  $("sentence").placeholder = "Önce derse başla…";
  $("btn-start").textContent = "▶ Başla";
  teacher?.wave();
  showReport(session, { onSpeak: pronounce, onNotebook: () => showNotebook({ onSpeak: pronounce }) });
}

$("btn-start").addEventListener("click", () => (started ? finishLesson() : startLesson()));
$("btn-notebook").addEventListener("click", () => showNotebook({ onSpeak: pronounce }));

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
if (!listenSupported) {
  $("btn-mic").title = "Bu tarayıcı konuşma tanımayı desteklemiyor (Chrome veya Edge deneyin)";
}
setBusy(false);

/** auto: eller serbest modda öğretmen susunca kendiliğinden açılan dinleme. */
function startListening({ auto = false } = {}) {
  if (recording || !started || !listenSupported) return;
  if (!auto) unlockVoices();
  stopVoice();
  $("btn-mic").classList.add("on");
  setStatus(auto ? "🎧 Dinliyorum… Cevabını İngilizce söyle." : "Dinliyorum… İngilizce konuş.");
  recording = listen({
    onInterim: (text) => ($("sentence").value = text),
    onFinal: (text) => {
      $("sentence").value = "";
      exchange(text);
    },
    onError: (code) => {
      if (code === "aborted") return;
      const messages = {
        "not-allowed": auto
          ? "Tarayıcı mikrofonu kendiliğinden açmaya izin vermedi. 🎤'ye basarak konuş."
          : "Mikrofon izni verilmedi.",
        // Eller serbest modda sessizlikte döngüye girmeyiz; kullanıcı 🎤 ile devam eder.
        "no-speech": auto ? "Seni duyamadım. Hazır olunca 🎤'ye bas." : "Ses duyamadım, tekrar dene.",
        network: "Konuşma tanıma için internet gerekiyor.",
      };
      setStatus(messages[code] ?? "Mikrofon hatası: " + code, code !== "no-speech");
    },
    onEnd: () => {
      recording = null;
      $("btn-mic").classList.remove("on");
      if (/Dinliyorum/.test($("status").textContent)) setStatus("");
    },
  });
}

$("btn-mic").addEventListener("click", () => {
  if (recording) recording.stop();
  else startListening();
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
