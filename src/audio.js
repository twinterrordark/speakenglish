/** Sunucudan gelen doğal sesi (WAV/MP3) çalar; dudak senkronu için ses yüksekliğini verir. */

const player = new Audio();
player.preload = "auto";

// 44 baytlık boş WAV: iOS'ta ilk dokunuşta çalınarak sonraki (async) çalmaların önü açılır.
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
let unlocked = false;

export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  player.src = SILENT_WAV;
  player.play().catch(() => {});
}

/** Sesi 20 ms'lik parçalara bölüp her parçanın yüksekliğini (0–1) çıkarır. */
async function loudnessEnvelope(bytes) {
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const buffer = await new Ctx(1, 1, 22050).decodeAudioData(bytes);
  const data = buffer.getChannelData(0);
  const perSecond = 50;
  const win = Math.max(1, Math.floor(buffer.sampleRate / perSecond));
  const values = new Float32Array(Math.ceil(data.length / win));
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    const end = Math.min(data.length, (i + 1) * win);
    for (let j = i * win; j < end; j++) sum += data[j] * data[j];
    values[i] = Math.sqrt(sum / (end - i * win));
  }
  const sorted = Array.from(values).sort((a, b) => a - b);
  const loud = sorted[Math.floor(sorted.length * 0.95)] || 1;
  for (let i = 0; i < values.length; i++) values[i] = Math.min(1, values[i] / loud);
  return { perSecond, values };
}

let finishCurrent = null;

export function stopClip() {
  finishCurrent?.();
}

/**
 * Sesi çalar. onStart(level) çalma başlayınca, level() o anki ses yüksekliğini verir.
 * onWord(index, word) kelimeler, sürenin karakter uzunluğuna oranlanmasıyla tahmin edilir.
 * Tarayıcı çalmayı reddederse hata fırlatır (çağıran tarayıcı sesine geçer).
 */
export async function playClip(bytes, { type, text, rate = 1, onStart, onWord, onEnd }) {
  stopClip();
  const envelope = await loudnessEnvelope(bytes.slice(0)).catch(() => null);

  const words = text.split(/\s+/).filter(Boolean);
  const weights = words.map((w) => w.length + 2);
  const total = weights.reduce((a, b) => a + b, 0) || 1;

  const url = URL.createObjectURL(new Blob([bytes], { type }));
  let done = false;
  let timer = 0;
  let lastWord = -1;

  const cleanup = () => {
    done = true;
    clearInterval(timer);
    player.onended = player.onerror = null;
    player.pause();
    URL.revokeObjectURL(url);
    if (finishCurrent === finish) finishCurrent = null;
  };
  const finish = () => {
    if (done) return;
    cleanup();
    onEnd?.();
  };
  finishCurrent = finish;

  const level = () => {
    if (!envelope) return 0.35 + 0.35 * Math.abs(Math.sin(player.currentTime * 11));
    return envelope.values[Math.floor(player.currentTime * envelope.perSecond)] ?? 0;
  };

  // requestAnimationFrame arka planda durduğu için kelime takibi zamanlayıcıyla yapılır.
  const tick = () => {
    if (done) return;
    const duration = player.duration;
    if (duration && Number.isFinite(duration) && words.length) {
      let target = (player.currentTime / duration) * total;
      let index = 0;
      while (index < words.length - 1 && target > weights[index]) target -= weights[index++];
      if (index !== lastWord) {
        lastWord = index;
        onWord?.(index, words[index]);
      }
    }
  };

  player.onended = finish;
  player.onerror = finish;
  player.src = url;
  player.preservesPitch = true; // yavaş hızda ses kalınlaşmasın
  player.defaultPlaybackRate = rate;
  player.playbackRate = rate;
  try {
    await player.play();
  } catch (err) {
    cleanup();
    throw err;
  }
  if (done) return;
  onStart?.(level);
  tick();
  timer = setInterval(tick, 50);
}
