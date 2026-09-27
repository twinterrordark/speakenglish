/**
 * Ms. Emma'nın sesi: önce sunucudaki doğal sesi (Cloudflare MeloTTS) dener,
 * olmazsa (kota, ağ, izin) tarayıcının yerleşik sesine geçer.
 */
import { apiUrl } from "./api.js";
import { playClip, stopClip, unlockAudio } from "./audio.js";
import { speak as browserSpeak, stopSpeaking as stopBrowser, unlockSpeech } from "./speech.js";

// Tek tük hatada o cümle tarayıcı sesiyle okunur; üst üste hata (ör. günlük kota bitti)
// olursa bir süre doğal ses hiç denenmez ki her cevapta boşuna beklenmesin.
const MAX_FAILURES = 3;
const RETRY_AFTER_MS = 5 * 60 * 1000;
let failures = 0;
let naturalDownUntil = 0;
let token = 0;

/** Telefonlarda ses çalma izni için bir dokunuşun içinde çağrılmalı. */
export function unlockVoices() {
  unlockAudio();
  unlockSpeech();
}

export function stopVoice() {
  token++;
  stopClip();
  stopBrowser();
}

async function fetchSpeech(text) {
  const res = await fetch(apiUrl("/api/tts"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`tts ${res.status}`);
  return { bytes: await res.arrayBuffer(), type: res.headers.get("content-type") || "audio/wav" };
}

/**
 * Metni seslendirir. onStart(level?) başlarken çağrılır; doğal seste level()
 * gerçek ses yüksekliğini (0–1) verir. onEnd her durumda bir kez çağrılır.
 */
export async function say(text, { natural = true, browserVoice, rate = 1, onStart, onWord, onEnd } = {}) {
  stopVoice();
  const my = ++token;
  let ended = false;
  const end = () => {
    if (!ended) {
      ended = true;
      onEnd?.();
    }
  };

  if (natural && Date.now() > naturalDownUntil) {
    try {
      const { bytes, type } = await fetchSpeech(text);
      failures = 0;
      if (my !== token) return end();
      await playClip(bytes, { type, text, rate, onStart, onWord, onEnd: end });
      return;
    } catch (err) {
      console.warn("Doğal ses kullanılamadı, tarayıcı sesine geçiliyor:", err);
      if (++failures >= MAX_FAILURES) {
        failures = 0;
        naturalDownUntil = Date.now() + RETRY_AFTER_MS;
      }
    }
  }
  if (my !== token) return end();
  browserSpeak(text, { voice: browserVoice, rate, onStart: () => onStart?.(), onWord, onEnd: end });
}
