/** Tarayıcının ücretsiz konuşma sentezi (Web Speech API) için ince sarmalayıcı. */

export const speechSupported = "speechSynthesis" in window;

export function loadEnglishVoices() {
  if (!speechSupported) return Promise.resolve([]);
  const pick = () => speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
  const now = pick();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(pick());
    speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 1500);
  });
}

/**
 * Metni okur. onWord(wordIndex, word) kelime sınırlarında çağrılır
 * (bazı sesler bu olayı göndermez; o durumda sadece start/end gelir).
 */
let finishCurrent = null;

/** Okumayı keser; bekleyen onEnd hemen çağrılır. */
export function stopSpeaking() {
  finishCurrent?.();
  if (speechSupported) speechSynthesis.cancel();
}

export function speak(text, { voice, rate = 1, onStart, onWord, onEnd } = {}) {
  stopSpeaking();
  if (!speechSupported) {
    onEnd?.();
    return;
  }

  // Bazı tarayıcılar iptal veya hata sonrası onend göndermiyor; bitişi kendimiz garanti ediyoruz.
  let done = false;
  let watchdog = 0;
  const finish = () => {
    if (done) return;
    done = true;
    clearInterval(watchdog);
    if (finishCurrent === finish) finishCurrent = null;
    onEnd?.();
  };
  finishCurrent = finish;
  const startedAt = performance.now();
  watchdog = setInterval(() => {
    const idle = !speechSynthesis.speaking && !speechSynthesis.pending;
    if (idle && performance.now() - startedAt > 1500) finish();
  }, 300);

  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice?.lang ?? "en-US";
  if (voice) u.voice = voice;
  u.rate = rate;

  const starts = [];
  text.replace(/\S+/g, (m, offset) => starts.push(offset));

  u.onstart = () => onStart?.();
  u.onboundary = (e) => {
    if (e.name && e.name !== "word") return;
    let index = starts.findIndex((s) => s > e.charIndex) - 1;
    if (index < 0) index = e.charIndex >= (starts.at(-1) ?? 0) ? starts.length - 1 : 0;
    onWord?.(index, text.slice(starts[index]).split(/\s/)[0]);
  };
  u.onend = finish;
  u.onerror = finish;
  speechSynthesis.speak(u);
}
