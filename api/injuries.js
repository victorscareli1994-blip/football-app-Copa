// api/injuries.js — Lesionados e suspensos de um time
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { team_id, season = new Date().getFullYear() } = req.query;
  if (!team_id) return res.status(400).json({ error: "team_id obrigatório" });

  try {
    const r = await fetch(
      `https://v3.football.api-sports.io/injuries?team=${team_id}&season=${season}`,
      { headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY } }
    );
    const data = await r.json();

    const jogadores = (data.response || []).slice(0, 15).map((i) => ({
      nome:    i.player.name,
      motivo:  i.player.reason,
      tipo:    i.player.type,
    }));

    res.status(200).json({ team_id, jogadores });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
