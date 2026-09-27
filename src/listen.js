/** Tarayıcının ücretsiz konuşma tanıması (Chrome/Edge/Safari) için ince sarmalayıcı. */

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export const listenSupported = Boolean(Recognition);

/** Tek cümle dinler. onInterim ara metni, onFinal son metni verir; onEnd her durumda çağrılır. */
export function listen({ onInterim, onFinal, onError, onEnd } = {}) {
  const rec = new Recognition();
  rec.lang = "en-US";
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  let finalText = "";
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    onInterim?.((finalText + interim).trim());
  };
  rec.onerror = (e) => onError?.(e.error);
  rec.onend = () => {
    if (finalText.trim()) onFinal?.(finalText.trim());
    onEnd?.();
  };
  rec.start();
  return { stop: () => rec.stop() };
}
