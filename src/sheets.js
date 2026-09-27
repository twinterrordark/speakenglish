/** Ders raporu ve kelime defteri pencereleri. İçerik modelden geldiği için hep textContent kullanılır. */
import { notebook } from "./notebook.js";

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function open(title, ...children) {
  $("sheet-title").textContent = title;
  $("sheet-body").replaceChildren(...children);
  if (!$("sheet").open) $("sheet").showModal();
}

function wordRow({ word, tr, emoji }, onSpeak, onRemove) {
  const row = el("li", "word-row");
  row.append(el("span", "emoji", emoji || "•"), el("strong", null, word), el("span", "muted", tr ? `— ${tr}` : ""));
  const listen = el("button", "icon-btn small", "🔊");
  listen.type = "button";
  listen.setAttribute("aria-label", `${word} kelimesini dinle`);
  listen.addEventListener("click", () => onSpeak(word));
  row.append(listen);
  if (onRemove) {
    const remove = el("button", "icon-btn small", "✕");
    remove.type = "button";
    remove.setAttribute("aria-label", `${word} kelimesini sil`);
    remove.addEventListener("click", onRemove);
    row.append(remove);
  }
  return row;
}

function mistakeRow({ wrong, right, tip }, onRemove) {
  const row = el("li", "mistake-row");
  const text = el("div");
  if (wrong) text.append(el("div", "wrong", `✗ ${wrong}`));
  text.append(el("div", "right", `✓ ${right}`));
  if (tip) text.append(el("div", "muted", tip));
  row.append(text);
  if (onRemove) {
    const remove = el("button", "icon-btn small", "✕");
    remove.type = "button";
    remove.setAttribute("aria-label", "Bu hatayı sil");
    remove.addEventListener("click", onRemove);
    row.append(remove);
  }
  return row;
}

/** session: { turns, corrections: [{wrong,right,tip}], words: [{word,tr,emoji}] } */
export function showReport(session, { onSpeak, onNotebook }) {
  const parts = [];
  if (!session.turns) {
    parts.push(el("p", null, "Bu derste hiç cümle kurmadık 🙂 Bir dahaki sefere 🎤 ile konuşmayı dene!"));
  } else {
    const good = session.turns - session.corrections.length;
    const percent = Math.round((good / session.turns) * 100);
    const score = el("div", "score");
    score.append(el("strong", null, `%${percent}`), el("span", null, `${session.turns} cümlenin ${good} tanesi doğruydu`));
    parts.push(score);
    parts.push(el("p", "muted", percent >= 80 ? "Harika gidiyorsun! 🎉" : percent >= 50 ? "Güzel ilerleme, devam! 💪" : "Her hata bir derstir. Tekrar deneyelim! 🌱"));
  }

  if (session.corrections.length) {
    parts.push(el("h3", null, "Düzeltmeler"));
    const list = el("ul", "sheet-list");
    session.corrections.forEach((m) => list.append(mistakeRow(m)));
    parts.push(list);
  }
  if (session.words.length) {
    parts.push(el("h3", null, "Yeni kelimeler"));
    const list = el("ul", "sheet-list");
    session.words.forEach((w) => list.append(wordRow(w, onSpeak)));
    parts.push(list);
  }
  if (session.corrections.length) {
    parts.push(el("p", "muted", "Ms. Emma bir sonraki derste bu düzeltmeleri tekrar pratik ettirecek."));
  }

  const actions = el("div", "sheet-actions");
  const toNotebook = el("button", null, "📒 Deftere bak");
  toNotebook.type = "button";
  toNotebook.addEventListener("click", onNotebook);
  actions.append(toNotebook);
  parts.push(actions);
  open("Ders raporu 🏁", ...parts);
}

export function showNotebook({ onSpeak }) {
  const render = () => {
    const parts = [];
    parts.push(el("h3", null, `Kelimeler (${notebook.words.length})`));
    if (notebook.words.length) {
      const list = el("ul", "sheet-list");
      notebook.words.forEach((w, i) =>
        list.append(wordRow(w, onSpeak, () => (notebook.remove("words", i), render()))),
      );
      parts.push(list);
    } else {
      parts.push(el("p", "muted", "Henüz kelime yok. Derste tahtada çıkan kelimeler buraya eklenir."));
    }

    parts.push(el("h3", null, `Hatalarım (${notebook.mistakes.length})`));
    if (notebook.mistakes.length) {
      const list = el("ul", "sheet-list");
      notebook.mistakes.forEach((m, i) =>
        list.append(mistakeRow(m, () => (notebook.remove("mistakes", i), render()))),
      );
      parts.push(list);
    } else {
      parts.push(el("p", "muted", "Henüz düzeltme yok."));
    }
    parts.push(el("p", "muted small", "Defter sadece bu tarayıcıda saklanır."));
    open("Kelime defteri 📒", ...parts);
  };
  render();
}
