// Site ve sunucu farklı yerlerdeyse (ör. GitHub Pages + Cloudflare) sunucu adresi derlemede verilir.
const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export const apiUrl = (path) => `${API_BASE}${path}`;
