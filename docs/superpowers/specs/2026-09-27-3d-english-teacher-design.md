# 3D İngilizce Öğretmeni — Faz 1 Tasarımı

## Amaç
Blender'da üretilen stilize bir İngilizce öğretmeni karakterini three.js ile bir sınıf sahnesinde göstermek.
Faz 1 tamamen ücretsiz ve yerel: yapay zekâ / sohbet akışı YOK (sonraki faz).

## Kapsam
1. **Karakter (Blender 5.2, `blender/build_teacher.py`)**
   - Stilize "Ms. Emma": büyük baş, gözlük, topuz saç, turkuaz bluz, lacivert etek.
   - Primitiflerden script ile üretilir, her parça tek bir kemiğe rigid skin edilir.
   - Kemikler: root, hips, spine, chest, neck, head, upper_arm/forearm/hand (L/R), thigh/shin/foot (L/R).
   - Morph target'lar: `Mouth` → `mouthOpen`, `mouthRound`, `smile`; `Eyes` → `blink`.
   - Animasyonlar: `Idle` (döngü), `Talk` (döngü), `Wave` (tek sefer), `Nod` (tek sefer).
   - Çıktı: `public/models/teacher.glb` + önizleme render'ları.
2. **Web (Vite + three.js)**
   - Sınıf sahnesi: zemin, duvar, yazı tahtası (CanvasTexture), masa, pencere ışığı.
   - `teacher.js`: GLB yükleme, AnimationMixer ile crossfade, otomatik göz kırpma, dudak hareketi.
   - Demo paneli: Selamla (Wave), Onayla (Nod), cümle kutusu + "Oku" (tarayıcı `speechSynthesis`, en-US).
   - Okunan cümle tahtada görünür; okurken `Talk` animasyonu + kelime sınırlarında ağız hareketi.

## Kapsam dışı (sonraki fazlar)
Konuşma tanıma, yapay zekâ sohbeti, hata düzeltme, senaryolar, ilerleme kaydı.

## Doğrulama
- Blender betiği GLB'yi yazar, JSON'unu okuyup kemik/morph/animasyon sayılarını raporlar, önizleme PNG'leri render eder.
- Site tarayıcı panelinde açılır, ekran görüntüsü + konsol hatası kontrolü yapılır.
