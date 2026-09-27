# Speak English with Ms. Emma

Tarayıcıda 3D bir İngilizce öğretmeniyle konuşarak pratik yapın. Karakter Blender'da Python betiğiyle üretilir, sahne three.js ile çizilir, cevapları Google Gemini'nin ücretsiz katmanı üretir.

- 🎤 Konuş ya da yaz — konuşma tanıma ve sesli okuma tarayıcının ücretsiz Web Speech API'si ile
- 🧑‍🏫 Senaryolar: serbest sohbet, restoran, iş görüşmesi, havalimanı · Seviye: A2 / B1 / B2
- ✓ Hatalı cümlelerin doğrusu ve kısa Türkçe ipucu yazı tahtasında

## Çalıştırma

```bash
npm install
cp .dev.vars.example .dev.vars   # içine GEMINI_API_KEY yapıştırın
npm run dev
```

Ücretsiz anahtar: https://aistudio.google.com/apikey — ziyaretçiler isterse kendi anahtarlarını ⚙ Ayarlar → 🔑 alanına girebilir (sadece kendi tarayıcılarında saklanır).

## Yayına alma (Cloudflare Workers, ücretsiz)

```bash
npx wrangler secret put GEMINI_API_KEY
npm run deploy
```

## Karakteri yeniden üretme

`blender/build_teacher.py` karakteri sıfırdan üretir ve `public/models/teacher.glb` dosyasına yazar (Blender 5.2):

```bash
blender -b --factory-startup -P blender/build_teacher.py -- public/models/teacher.glb
```

## Yapı

| Yol | Görev |
| --- | --- |
| `blender/build_teacher.py` | Karakter, iskelet, yüz ifadeleri, animasyonlar |
| `src/scene.js` | Sınıf sahnesi ve yazı tahtası |
| `src/teacher.js` | Animasyon geçişleri, göz kırpma, dudak hareketi |
| `src/speech.js`, `src/listen.js` | Sesli okuma ve konuşma tanıma |
| `src/lesson.js` | Ders durumu, `/api/chat` istemcisi |
| `worker/index.js` | Gemini'ye giden istekleri anahtarı gizleyerek iletir |

Testler: `npm test`
