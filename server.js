import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const KEY = process.env.MAGIC_HOUR_API_KEY;
const API = "https://api.magichour.ai/v1";
const HEAD = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

if (!KEY) {
  console.error("Clé manquante : ajoutez MAGIC_HOUR_API_KEY dans Environment sur Render.");
  process.exit(1);
}

// Mots du prompt -> style Magic Hour
const STYLES = [
  [/ghibli|anime|manga|dessin anim|cartoon/i, "Studio Ghibli"],
  [/pixar|3d/i, "Pixar"],
  [/aquarelle|watercolor/i, "Watercolor"],
  [/peinture|huile|oil/i, "Oil Painting"],
  [/cyberpunk|n[ée]on/i, "Cyberpunk"],
  [/comic|bd\b|bande dessin/i, "Comic"],
  [/van gogh/i, "Van Gogh"],
  [/lego/i, "Lego"],
  [/argile|clay/i, "Clay"],
  [/minecraft/i, "Minecraft"],
  [/pixel/i, "Pixel"],
  [/encre|ink/i, "Ink"],
];
const pickStyle = (p) => (STYLES.find(([re]) => re.test(p)) || [null, "No Art Style"])[1];
const EXT = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "video/x-m4v": "m4v" };

const app = express();
app.get("/", (req, res) => res.sendFile(path.join(__dir, "index.html")));
app.get("/api/health", (req, res) => res.json({ ok: true }));

async function mh(url, opts) {
  const r = await fetch(API + url, { ...opts, headers: HEAD });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || `Erreur Magic Hour (${r.status})`);
  return d;
}

app.post("/api/restyle", express.raw({ type: "video/*", limit: "20mb" }), async (req, res) => {
  try {
    const prompt = (req.query.prompt || "").toString().trim();
    if (!prompt) return res.status(400).json({ error: "Prompt manquant." });
    if (!req.body?.length) return res.status(400).json({ error: "Vidéo manquante." });
    const mime = req.headers["content-type"].split(";")[0];
    const ext = EXT[mime] || "mp4";

    // 1) demander une adresse d'envoi
    const up = await mh("/files/upload-urls", {
      method: "POST",
      body: JSON.stringify({ items: [{ type: "video", extension: ext }] }),
    });
    const { upload_url, file_path } = up.items[0];

    // 2) envoyer la vidéo
    const put = await fetch(upload_url, { method: "PUT", body: req.body });
    if (!put.ok) throw new Error("Échec de l'envoi de la vidéo (" + put.status + ").");

    // 3) lancer le restyle (5 premières secondes pour économiser les crédits)
    const style = pickStyle(prompt);
    console.log("Style choisi :", style);
    const job = await mh("/video-to-video", {
      method: "POST",
      body: JSON.stringify({
        name: "Restyle IA",
        start_seconds: 0,
        end_seconds: 5,
        fps_resolution: "HALF",
        style: {
          art_style: style,
          version: style === "Studio Ghibli" ? "v2" : "default",
          prompt_type: "custom",
          prompt,
        },
        assets: { video_source: "file", video_file_path: file_path },
      }),
    });
    console.log("Job créé :", job.id, "crédits :", job.credits_charged);
    res.json({ id: job.id });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/status/:id", async (req, res) => {
  try {
    const d = await mh("/video-projects/" + encodeURIComponent(req.params.id), { method: "GET" });
    const status =
      d.status === "complete" ? "SUCCEEDED" :
      d.status === "error" || d.status === "canceled" ? "FAILED" : d.status.toUpperCase();
    res.json({
      status,
      progress: null,
      url: d.downloads?.[0]?.url ?? null,
      error: d.error?.message ?? null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(process.env.PORT || 3000, () => console.log("Serveur prêt"));
