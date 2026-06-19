// api/analyze.js — Orquestra: busca dados na API-Football + chama Claude
// Tudo roda no servidor, sem restrição de CORS, sem expor chaves ao cliente.

const FOOTBALL_BASE = "https://v3.football.api-sports.io";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

async function footballGet(path) {
  const r = await fetch(`${FOOTBALL_BASE}${path}`, {
    headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY },
  });
  if (!r.ok) throw new Error(`API-Football retornou ${r.status} em ${path}`);
  return r.json();
}

function formatForma(jogos, teamId) {
  if (!jogos?.length) return "Sem dados disponíveis.";
  return jogos
    .map((f) => {
      const home = f.teams.home;
      const away = f.teams.away;
      const goals = f.goals;
      const isHome = home.id === teamId;
      const teamGoals = isHome ? goals.home : goals.away;
      const oppGoals = isHome ? goals.away : goals.home;
      const opponent = isHome ? away.name : home.name;
      const result = teamGoals > oppGoals ? "V" : teamGoals < oppGoals ? "D" : "E";
      const data = f.fixture.date?.slice(0, 10);
      return `${data} | ${opponent} | ${teamGoals ?? "?"} x ${oppGoals ?? "?"} | ${result} (${f.league.name})`;
    })
    .join("\n");
}

function formatH2H(jogos) {
  if (!jogos?.length) return "Sem confrontos encontrados.";
  return jogos
    .map((f) => {
      const data = f.fixture.date?.slice(0, 10);
      return `${data} | ${f.league.name} | ${f.teams.home.name} ${f.goals.home ?? "?"} x ${f.goals.away ?? "?"} ${f.teams.away.name}`;
    })
    .join("\n");
}

function formatInjuries(jogadores, label) {
  if (!jogadores?.length) return `${label}: sem lesionados/suspensos registrados.`;
  const lista = jogadores
    .slice(0, 10)
    .map((i) => `${i.player.name} — ${i.player.type || ""} ${i.player.reason || ""}`)
    .join("\n");
  return `${label}:\n${lista}`;
}

function parseAnalysis(text) {
  const get = (pat) => {
    const m = text.match(pat);
    return m ? m[1].trim() : null;
  };
  return {
    probA: get(/Vitória.*?Time A[:\s]+(\d+)/i) || get(/Time A[:\s]+(\d+)/i),
    probEmp: get(/Empate[:\s]+(\d+)/i),
    probB: get(/Vitória.*?Time B[:\s]+(\d+)/i) || get(/Time B[:\s]+(\d+)/i),
    placar: get(/Placar.*?:\s*([^\n]+)/i),
    markets: (() => {
      const b = text.match(/Mercados[\s\S]+?(?=🔎|Análise|$)/i);
      if (!b) return [];
      return b[0]
        .split("\n")
        .map((l) => l.replace(/^[-•*\d.)\s✓]+/, "").trim())
        .filter((l) => l.length > 4 && !/mercado/i.test(l));
    })(),
    analysis: (() => {
      const b = text.match(/(?:🔎|Análise)[:\s]*([\s\S]+?)(?=⭐|Grau|$)/i);
      return b ? b[1].trim() : text;
    })(),
    confidence: get(/(?:Grau.*?confiança|⭐)[:\s]*(Alto|Médio|Baixo)/i),
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const { teamAId, teamBId, teamAName, teamBName, competition, extra } = req.body || {};

  if (!teamAId || !teamBId || !teamAName || !teamBName) {
    return res.status(400).json({ error: "teamAId, teamBId, teamAName e teamBName são obrigatórios" });
  }

  try {
    // ── 1. Busca dados reais na API-Football (em paralelo) ──────────────────
    const [fA, fB, h2hData, injA, injB] = await Promise.all([
      footballGet(`/fixtures?team=${teamAId}&last=5`),
      footballGet(`/fixtures?team=${teamBId}&last=5`),
      footballGet(`/fixtures/headtohead?h2h=${teamAId}-${teamBId}&last=5`),
      footballGet(`/injuries?team=${teamAId}&season=${new Date().getFullYear()}`),
      footballGet(`/injuries?team=${teamBId}&season=${new Date().getFullYear()}`),
    ]);

    const formaA = formatForma(fA.response, parseInt(teamAId));
    const formaB = formatForma(fB.response, parseInt(teamBId));
    const h2h = formatH2H(h2hData.response);
    const injuries = `${formatInjuries(injA.response, teamAName)}\n\n${formatInjuries(injB.response, teamBName)}`;

    const collected = { formaA, formaB, h2h, injuries };

    // ── 2. Monta o prompt e chama o Claude ───────────────────────────────────
    const comp = competition || "futebol";
    const prompt = `Você é um analista profissional de futebol especializado em probabilidades esportivas.

PARTIDA: ${teamAName} x ${teamBName}
COMPETIÇÃO: ${comp}
${extra ? `CONTEXTO: ${extra}` : ""}

DADOS REAIS COLETADOS VIA API-FOOTBALL:

📋 FORMA RECENTE — ${teamAName} (últimos 5 jogos):
${formaA}

📋 FORMA RECENTE — ${teamBName} (últimos 5 jogos):
${formaB}

🔁 CONFRONTOS DIRETOS (H2H):
${h2h}

🏥 LESIONADOS / SUSPENSOS:
${injuries}

Com base EXCLUSIVAMENTE nesses dados reais, responda EXATAMENTE neste formato:

🏆 Partida: ${teamAName} x ${teamBName}

📊 Probabilidades:
Vitória Time A: XX%
Empate: XX%
Vitória Time B: XX%

⚽ Placar mais provável: X x X

📈 Mercados com maior probabilidade:
- Mercado 1
- Mercado 2
- Mercado 3

🔎 Análise:
(4 parágrafos: forma recente, H2H, desfalques e tática, motivação e tendências de gols)

⭐ Grau de confiança: Alto / Médio / Baixo
(1 frase justificando)`;

    const aiRes = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      const errBody = await aiRes.json().catch(() => ({}));
      throw new Error(`Claude API retornou ${aiRes.status}: ${errBody?.error?.message || ""}`);
    }

    const aiData = await aiRes.json();
    const text = aiData.content?.map((b) => b.text || "").join("") || "";
    const result = parseAnalysis(text);

    res.status(200).json({ collected, rawText: text, result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
