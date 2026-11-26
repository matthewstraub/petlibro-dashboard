import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";

const envDir = path.resolve(import.meta.dirname);

// Kept as a plain object (not defineConfig(({ mode }) => …)) because
// server/vite-dev.ts imports and spreads it. loadEnv also picks up VITE_*
// variables from the environment, which is where Render supplies them.
const env = loadEnv(
  process.env.NODE_ENV === "production" ? "production" : "development",
  envDir,
  "VITE_"
);
const locationName = (env.VITE_LOCATION_NAME ?? "").trim();

/**
 * Puts VITE_LOCATION_NAME at the front of the page title ("Office · Petlibro
 * Water Fountain Dashboard"), so each site's browser tab and home-screen
 * shortcut say which fountain it shows, even where the end gets cut off.
 * Done here rather than with a %VITE_LOCATION_NAME% placeholder, which Vite
 * leaves in the page as literal text when the variable is unset.
 */
function locationTitle(name: string): Plugin {
  return {
    name: "location-title",
    transformIndexHtml(html) {
      if (!name) return html;
      const escaped = name.replace(
        /[&<>]/g,
        ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch] ?? ch
      );
      return html.replace(
        /<title>([^<]*)<\/title>/,
        (_match, title: string) => `<title>${escaped} · ${title}</title>`
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), locationTitle(locationName)],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  envDir,
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: true,
    allowedHosts: true,
  },
});
