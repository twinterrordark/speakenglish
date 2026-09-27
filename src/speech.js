/** Tarayıcının ücretsiz konuşma sentezi (Web Speech API) için ince sarmalayıcı. */

export const speechSupported = "speechSynthesis" in window;

const isEnglish = (v) => v.lang.toLowerCase().replace("_", "-").startsWith("en");

/**
 * İngilizce sesleri verir. Mobil tarayıcılar sesleri geç yükler; liste sonradan
 * değişirse onChange yeniden çağrılır.
 */
export function watchEnglishVoices(onChange) {
  if (!speechSupported) {
    onChange([]);
    return;
  }
  const emit = () => onChange(speechSynthesis.getVoices().filter(isEnglish));
  speechSynthesis.addEventListener("voiceschanged", emit);
  emit();
}

let unlocked = false;

/**
 * iOS Safari sesli okumayı sadece bir dokunuşun içinde başlatmaya izin verir.
 * İlk dokunuşta sessiz bir okuma yaparak sonraki (async) okumaların önünü açar.
 */
export function unlockSpeech() {
  if (!speechSupported || unlocked) return;
  unlocked = true;
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  speechSynthesis.speak(u);
}

let finishCurrent = null;
let currentUtterance = null; // Referans tutulmazsa Chrome olayları kaybedebiliyor.

/** Okumayı keser; bekleyen onEnd hemen çağrılır. */
export function stopSpeaking() {
  finishCurrent?.();
  if (speechSupported && (speechSynthesis.speaking || speechSynthesis.pending)) speechSynthesis.cancel();
}

/**
 * Metni okur. onWord(wordIndex, word) kelime sınırlarında çağrılır
 * (bazı sesler bu olayı göndermez; o durumda sadece start/end gelir).
 */
export function speak(text, { voice, rate = 1, onStart, onWord, onEnd } = {}) {
  const wasBusy = speechSupported && (speechSynthesis.speaking || speechSynthesis.pending);
  stopSpeaking();
  if (!speechSupported) {
    onEnd?.();
    return;
  }

  // Bazı tarayıcılar iptal veya hata sonrası onend göndermiyor; bitişi kendimiz garanti ediyoruz.
  // Mobilde ses motorunun açılması birkaç saniye sürebildiği için başlamayı cömertçe bekliyoruz.
  let done = false;
  let started = false;
  let watchdog = 0;
  const finish = () => {
    if (done) return;
    done = true;
    clearInterval(watchdog);
    if (finishCurrent === finish) finishCurrent = null;
    onEnd?.();
  };
  finishCurrent = finish;
  const queuedAt = performance.now();
  let startedAt = 0;
  watchdog = setInterval(() => {
    const idle = !speechSynthesis.speaking && !speechSynthesis.pending;
    const now = performance.now();
    if (started ? idle && now - startedAt > 800 : now - queuedAt > 10000) finish();
  }, 300);

  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice?.lang ?? "en-US";
  if (voice) u.voice = voice;
  u.rate = rate;
  currentUtterance = u;

  const starts = [];
  text.replace(/\S+/g, (m, offset) => starts.push(offset));

  u.onstart = () => {
    started = true;
    startedAt = performance.now();
    onStart?.();
  };
  u.onboundary = (e) => {
    if (e.name && e.name !== "word") return;
    let index = starts.findIndex((s) => s > e.charIndex) - 1;
    if (index < 0) index = e.charIndex >= (starts.at(-1) ?? 0) ? starts.length - 1 : 0;
    onWord?.(index, text.slice(starts[index]).split(/\s/)[0]);
  };
  u.onend = () => {
    if (currentUtterance === u) currentUtterance = null;
    finish();
  };
  u.onerror = u.onend;

  const go = () => {
    if (done) return;
    speechSynthesis.resume(); // Android Chrome bazen duraklatılmış durumda takılı kalıyor.
    speechSynthesis.speak(u);
  };
  // Chrome, cancel() sonrasında hemen gelen speak() çağrısını sessizce yutabiliyor.
  if (wasBusy) setTimeout(go, 120);
  else go();
}
