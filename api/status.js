// api/status.js — Verifica se a chave está válida e quantas requisições restam
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const r = await fetch("https://v3.football.api-sports.io/status", {
      headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY },
    });
    const data = await r.json();
    const info = data.response;
    res.status(200).json({
      ok:           true,
      plano:        info?.subscription?.plan,
      requisicoes:  info?.requests,
      limite_dia:   info?.requests?.limit_day,
      usadas_hoje:  info?.requests?.current,
      restantes:    (info?.requests?.limit_day ?? 0) - (info?.requests?.current ?? 0),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
