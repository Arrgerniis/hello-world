# Calculadora de crédito hipotecario · Chile

Calculadora web para simular un crédito hipotecario en Chile (valores en UF).
Incluye:

- Precio de la propiedad en UF
- Slider de pie de 0% a 80% del precio
- Slider de plazo (5 a 30 años)
- Tasa anual editable, con sugerencia automática según las tasas curadas
- **Botón "Actualizar tasas"** que dispara un agente (Claude API + web search) para
  consultar las tasas vigentes del mercado chileno
- Tabla de amortización (sistema francés) con vista por año o mes a mes
- Composición visual capital vs intereses cuota a cuota
- Costos asociados (al firmar): tasación, estudio de títulos, gastos notariales,
  inscripción en CBR, impuesto al mutuo (Ley de Timbres)
- Costos mensuales adicionales: seguro de desgravamen e incendio + sismo
- CAE estimada (resolviendo TIR del flujo total)
- Supuestos y limitaciones explícitos

## Cómo correrla

```bash
npm install
npm start
# abre http://localhost:3000
```

### Habilitar el agente de actualización de tasas

El endpoint `POST /api/rates/refresh` usa el SDK de Anthropic con la herramienta
`web_search` para consultar tasas vigentes. Para habilitarlo:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm start
```

Sin la variable, la app sigue funcionando con tasas curadas en
`data/rates.json` (referenciales) y el botón muestra un mensaje claro.

## Estructura

```
server.js              Express + endpoint del agente
data/rates.json        Tasas curadas de respaldo
public/index.html      UI
public/styles.css      Estilos
public/app.js          Cálculo (amortización francesa, CAE, costos) y render
```

## Notas

- Los valores son referenciales. No constituye una oferta financiera.
- La tabla de amortización usa el sistema francés (cuota fija en UF), que es la
  modalidad estándar en Chile para créditos hipotecarios.
- Los porcentajes de seguros e impuestos pueden ajustarse en "Parámetros
  avanzados" para reflejar la oferta concreta de cada banco.
