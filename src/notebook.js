/** Kelime defteri: öğrenilen kelimeler ve düzeltilen hatalar bu tarayıcıda saklanır. */

const STORAGE_KEY = "msEmma.notebook.v1";
const MAX_WORDS = 200;
const MAX_MISTAKES = 60;

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(data?.words) && Array.isArray(data?.mistakes)) return data;
  } catch {
    // Gizli pencere / kapalı depolama: defter o oturumla sınırlı kalır.
  }
  return { words: [], mistakes: [] };
}

let data = load();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Kaydedilemese de defter bu oturumda çalışmaya devam eder.
  }
}

export const notebook = {
  get words() {
    return data.words;
  },
  get mistakes() {
    return data.mistakes;
  },

  addWord({ word, tr, emoji }) {
    if (!word) return;
    const key = word.toLowerCase();
    data.words = data.words.filter((w) => w.word.toLowerCase() !== key);
    data.words.unshift({ word, tr, emoji, at: Date.now() });
    data.words.length = Math.min(data.words.length, MAX_WORDS);
    save();
  },

  addMistake({ wrong, right, tip }) {
    if (!right) return;
    data.mistakes.unshift({ wrong, right, tip, at: Date.now() });
    data.mistakes.length = Math.min(data.mistakes.length, MAX_MISTAKES);
    save();
  },

  remove(kind, index) {
    data[kind].splice(index, 1);
    save();
  },

  /** Öğretmenin bir sonraki derste tekrar ettireceği son düzeltmeler. */
  reviewItems(count = 3) {
    return data.mistakes.slice(0, count).map((m) => m.right);
  },
};
