// api/forma.js — Últimos N jogos de um time
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { team_id, last = 5 } = req.query;
  if (!team_id) return res.status(400).json({ error: "team_id obrigatório" });

  try {
    const r = await fetch(
      `https://v3.football.api-sports.io/fixtures?team=${team_id}&last=${last}`,
      { headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY } }
    );
    const data = await r.json();

    const jogos = (data.response || []).map((f) => {
      const home = f.teams.home;
      const away = f.teams.away;
      const goals = f.goals;
      const isHome = home.id === parseInt(team_id);
      const teamGoals = isHome ? goals.home : goals.away;
      const oppGoals  = isHome ? goals.away : goals.home;
      const opponent  = isHome ? away.name  : home.name;
      const result    = teamGoals > oppGoals ? "V" : teamGoals < oppGoals ? "D" : "E";
      return {
        data:      f.fixture.date?.slice(0, 10),
        adversario: opponent,
        placar:    `${teamGoals ?? "?"} x ${oppGoals ?? "?"}`,
        resultado: result,
        liga:      f.league.name,
        status:    f.fixture.status.short,
      };
    });

    res.status(200).json({ team_id, jogos });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
