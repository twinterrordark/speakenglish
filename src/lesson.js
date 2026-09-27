/** Ders durumu: senaryo, seviye ve konuşma geçmişi. Sunucuya /api/chat ile konuşur. */

export const SCENARIOS = {
  free: { label: "Serbest sohbet", title: "Let's chat!" },
  restaurant: { label: "Restoranda", title: "At the Restaurant" },
  interview: { label: "İş görüşmesi", title: "Job Interview" },
  airport: { label: "Havalimanında", title: "At the Airport" },
};

export const LEVELS = ["A2", "B1", "B2"];

const ERRORS = {
  no_key: "Gemini API anahtarı yok. .dev.vars dosyasına ya da 🔑 alanına anahtar ekleyin.",
  bad_key: "API anahtarı geçersiz görünüyor. 🔑 alanını kontrol edin.",
  rate_limited: "Ücretsiz kullanım limiti doldu. Bir dakika bekleyip tekrar deneyin.",
};

export class LessonError extends Error {}

export class Lesson {
  constructor({ scenario = "free", level = "A2", getUserKey = () => "" } = {}) {
    this.scenario = scenario;
    this.level = level;
    this.getUserKey = getUserKey;
    this.history = [];
  }

  reset({ scenario = this.scenario, level = this.level } = {}) {
    this.scenario = scenario;
    this.level = level;
    this.history = [];
  }

  /** Öğrenci mesajını gönderir (boş mesaj = dersi başlat). {reply, correction, tip} döner. */
  async send(message = "") {
    const headers = { "content-type": "application/json" };
    const key = this.getUserKey();
    if (key) headers["x-user-key"] = key;

    let res;
    try {
      res = await fetch("/api/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({ scenario: this.scenario, level: this.level, history: this.history, message }),
      });
    } catch {
      throw new LessonError("Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new LessonError(ERRORS[data.error] ?? "Bir sorun oldu, tekrar deneyin.");

    if (message) this.history.push({ role: "user", text: message });
    this.history.push({ role: "model", text: data.reply });
    return data;
  }
}
