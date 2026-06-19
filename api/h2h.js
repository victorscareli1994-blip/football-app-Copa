// api/h2h.js — Confrontos diretos entre dois times
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { h2h, last = 5 } = req.query; // h2h = "idA-idB"
  if (!h2h) return res.status(400).json({ error: "h2h obrigatório (ex: 33-40)" });

  try {
    const r = await fetch(
      `https://v3.football.api-sports.io/fixtures/headtohead?h2h=${h2h}&last=${last}`,
      { headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY } }
    );
    const data = await r.json();

    const jogos = (data.response || []).map((f) => ({
      data:      f.fixture.date?.slice(0, 10),
      liga:      f.league.name,
      mandante:  f.teams.home.name,
      visitante: f.teams.away.name,
      placar:    `${f.goals.home ?? "?"} x ${f.goals.away ?? "?"}`,
      status:    f.fixture.status.short,
    }));

    res.status(200).json({ h2h, jogos });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
