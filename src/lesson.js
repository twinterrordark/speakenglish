/** Ders durumu: senaryo, seviye ve konuşma geçmişi. Sunucuya /api/chat ile konuşur. */

import { apiUrl } from "./api.js";

export const SCENARIOS = {
  free: { label: "Serbest sohbet", title: "Let's chat!" },
  restaurant: { label: "Restoranda", title: "At the Restaurant" },
  interview: { label: "İş görüşmesi", title: "Job Interview" },
  airport: { label: "Havalimanında", title: "At the Airport" },
};

export const LEVELS = ["A2", "B1", "B2"];

const ERRORS = {
  no_server: "Sohbet sunucusu bulunamadı. Cloudflare Worker adresi (API_URL) ayarlanmamış.",
  no_key: "Gemini API anahtarı yok. .dev.vars dosyasına ya da 🔑 alanına anahtar ekleyin.",
  bad_key: "API anahtarı geçersiz görünüyor. 🔑 alanını kontrol edin.",
  rate_limited: "Ücretsiz kullanım limiti doldu. Bir dakika bekleyip tekrar deneyin.",
  too_many: "Biraz yavaşla 🙂 Bir dakika içinde çok fazla mesaj gönderdin.",
};

export class LessonError extends Error {}

export class Lesson {
  constructor({ scenario = "free", level = "A2", getUserKey = () => "" } = {}) {
    this.scenario = scenario;
    this.level = level;
    this.getUserKey = getUserKey;
    this.history = [];
    this.review = [];
  }

  /** review: önceki derslerden tekrar edilecek doğru cümleler. */
  reset({ scenario = this.scenario, level = this.level, review = [] } = {}) {
    this.scenario = scenario;
    this.level = level;
    this.history = [];
    this.review = review;
  }

  /** Öğrenci mesajını gönderir (boş mesaj = dersi başlat). {reply, correction, tip, word, wordTr, emoji} döner. */
  async send(message = "") {
    // Cevap gelmeden ders yeniden başlarsa eski cevap yeni geçmişe karışmasın.
    const history = this.history;
    const headers = { "content-type": "application/json" };
    const key = this.getUserKey();
    if (key) headers["x-user-key"] = key;

    let res;
    try {
      res = await fetch(apiUrl("/api/chat"), {
        method: "POST",
        headers,
        body: JSON.stringify({
          scenario: this.scenario,
          level: this.level,
          history,
          review: this.review,
          message,
        }),
      });
    } catch {
      throw new LessonError("Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.");
    }
    const data = await res.json().catch(() => ({ error: res.status === 404 || res.status === 405 ? "no_server" : "" }));
    if (!res.ok) throw new LessonError(ERRORS[data.error] ?? "Bir sorun oldu, tekrar deneyin.");

    if (message) history.push({ role: "user", text: message });
    history.push({ role: "model", text: data.reply });
    return data;
  }
}
