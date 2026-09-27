import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// GitHub Pages derlemesi: sadece statik site, /<repo>/ alt yolunda yayınlanır.
// Sohbet sunucusu (worker/) o durumda ayrıca Cloudflare'de çalışır, adresi VITE_API_URL ile verilir.
const pages = Boolean(process.env.GITHUB_PAGES);

export default defineConfig({
  base: process.env.BASE_PATH || "/",
  plugins: pages ? [] : [cloudflare()],
  build: pages ? { outDir: "dist-pages", chunkSizeWarningLimit: 1500 } : { chunkSizeWarningLimit: 1500 },
});
