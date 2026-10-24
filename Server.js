import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
const __dir = path.dirname(fileURLToPath(import.meta.url));

const KEY = process.env.RUNWAY_API_KEY;
const API = "https://api.dev.runwayml.com/v1";
const HEAD = {
  Authorization: `Bearer ${KEY}`,
  "X-Runway-Version": "2024-11-06",
  "Content-Type": "application/json",
};

if (!KEY) {
  console.error("Clé manquante : créez un fichier .env avec RUNWAY_API_KEY=...");
  process.exit(1);
}

const app = express();
app.get("/", (req, res) => res.sendFile(path.join(__dir, "index.html")));
app.get("/api/health", (req, res) => res.json({ ok: true }));

// 1) Reçoit la vidéo brute + le prompt, lance la tâche chez Runway
app.post(
  "/api/restyle",
  express.raw({ type: "video/*", limit: "16mb" }),
  async (req, res) => {
    try {
      console.log("Requête reçue, taille :", req.body?.length || 0, "octets");
      const prompt = (req.query.prompt || "").toString().trim();
      if (!prompt) return res.status(400).json({ error: "Prompt manquant." });
      if (!req.body?.length) return res.status(400).json({ error: "Vidéo manquante." });

      const mime = req.headers["content-type"].split(";")[0];
      const videoUri = `data:${mime};base64,${req.body.toString("base64")}`;

      const r = await fetch(`${API}/video_to_video`, {
        method: "POST",
        headers: HEAD,
        body: JSON.stringify({ model: "gen4_aleph", videoUri, promptText: prompt }),
      });
      const data = await r.json();
      console.log("Réponse Runway :", r.status, JSON.stringify(data).slice(0, 300));
      if (!r.ok) return res.status(r.status).json({ error: data.error || "Erreur Runway." });
      res.json({ id: data.id });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// 2) Le navigateur interroge ce point jusqu'à la fin de la tâche
app.get("/api/status/:id", async (req, res) => {
  try {
    const r = await fetch(`${API}/tasks/${encodeURIComponent(req.params.id)}`, { headers: HEAD });
    const d = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: d.error || "Erreur Runway." });
    res.json({
      status: d.status, // PENDING, RUNNING, SUCCEEDED, FAILED...
      progress: d.progress ?? null,
      url: d.output?.[0] ?? null,
      error: d.failure ?? null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(process.env.PORT || 3000, () =>
  console.log(`Ouvrez http://localhost:${process.env.PORT || 3000}`)
);
