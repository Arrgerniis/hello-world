const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const RATES_FILE = path.join(__dirname, "data", "rates.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function readRates() {
  const raw = fs.readFileSync(RATES_FILE, "utf8");
  return JSON.parse(raw);
}

function writeRates(data) {
  fs.writeFileSync(RATES_FILE, JSON.stringify(data, null, 2), "utf8");
}

app.get("/api/rates", (_req, res) => {
  try {
    res.json(readRates());
  } catch (err) {
    res.status(500).json({ error: "No se pudieron leer las tasas", detail: err.message });
  }
});

// Triggers the rate-fetching agent. Uses the Anthropic SDK with the
// web_search tool when ANTHROPIC_API_KEY is available. Falls back to
// returning the cached file with a clear message otherwise.
app.post("/api/rates/refresh", async (_req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: "ANTHROPIC_API_KEY no configurada",
      message:
        "Para refrescar las tasas con un agente real, exporte ANTHROPIC_API_KEY antes de iniciar el servidor. Mientras tanto se siguen usando las tasas curadas.",
      cached: readRates(),
    });
  }

  try {
    const Anthropic = require("@anthropic-ai/sdk");
    const client = new Anthropic.default({ apiKey });

    const systemPrompt = `Eres un analista financiero chileno. Tu tarea es buscar las tasas de interés vigentes para créditos hipotecarios en UF en Chile, considerando los principales bancos (Banco de Chile, Santander, BCI, BancoEstado, Itaú, Scotiabank). Devuelve SOLO un objeto JSON válido, sin texto adicional ni bloques de código, con este esquema exacto:
{
  "lastUpdated": "YYYY-MM-DD",
  "source": "string describiendo fuentes",
  "currency": "UF",
  "ufValueClp": number,
  "notes": "string",
  "termRates": { "8": number, "10": number, "15": number, "20": number, "25": number, "30": number },
  "bankSamples": [{ "bank": string, "termYears": number, "annualRate": number }]
}
Las tasas son porcentajes anuales (ej. 4.55 significa 4.55%).`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      system: systemPrompt,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
      messages: [
        {
          role: "user",
          content:
            "Busca en la web las tasas de hipotecarios en UF vigentes hoy en Chile (CMF, comparadores como ComparaOnline, sitios de los bancos) y devuelve el JSON solicitado. Usa el plazo de 25 años como referencia para bankSamples. Si encuentras rangos, usa el promedio.",
        },
      ],
    });

    // Extract last text block (after any tool_use turns)
    const textBlock = response.content.filter((b) => b.type === "text").pop();
    if (!textBlock) throw new Error("El agente no devolvió texto.");

    let raw = textBlock.text.trim();
    // Strip code fences if the model added them
    raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```$/, "").trim();

    const parsed = JSON.parse(raw);
    if (!parsed.termRates || typeof parsed.termRates !== "object") {
      throw new Error("Respuesta del agente sin termRates válido");
    }

    writeRates(parsed);
    res.json({ ok: true, rates: parsed });
  } catch (err) {
    console.error("Error refrescando tasas:", err);
    res.status(500).json({
      error: "Error al consultar el agente",
      detail: err.message,
      cached: readRates(),
    });
  }
});

app.listen(PORT, () => {
  console.log(`Calculadora hipotecaria escuchando en http://localhost:${PORT}`);
});
