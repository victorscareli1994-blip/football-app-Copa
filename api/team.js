// api/team.js — Busca team_id e info básica pelo nome
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { name } = req.query;
  if (!name) return res.status(400).json({ error: "name obrigatório" });

  try {
    const r = await fetch(
      `https://v3.football.api-sports.io/teams?search=${encodeURIComponent(name)}`,
      { headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY } }
    );
    const data = await r.json();

    const times = (data.response || []).slice(0, 5).map((t) => ({
      id:      t.team.id,
      nome:    t.team.name,
      pais:    t.team.country,
      logo:    t.team.logo,
      fundado: t.team.founded,
    }));

    res.status(200).json({ query: name, times });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
