# MXRF11 · O Número Mágico — Financial Intelligence Simulator 2.0

Simulador web educativo, em português do Brasil, que mostra como o reinvestimento de dividendos aumenta aos poucos a quantidade de cotas de um fundo imobiliário. O ponto de partida é o **número mágico**: quantas cotas são necessárias para que um mês de rendimento compre novas cotas.

> Simulação educativa. Fundos imobiliários são investimentos de renda variável. Preços, distribuições de rendimentos, inflação, liquidez e condições tributárias podem mudar. Resultados projetados não representam garantia de rentabilidade ou renda futura. Não constitui recomendação de investimento.

## Instalação e execução

Requisitos: Node.js 22.12+ (`.nvmrc`).

```bash
npm install
npm run dev          # frontend (http://localhost:5173) + API de dados (http://localhost:8787)
```

| Script | O que faz |
|---|---|
| `npm run dev` | Vite + servidor de dados com recarga automática |
| `npm run dev:web` | Apenas o frontend (o modo de mercado mostrará "serviço indisponível") |
| `npm run server` | Apenas a API de dados + agendador |
| `npm test` | 82 testes unitários (Vitest): motor, premissas avançadas, calendário, provedor oficial, exportação |
| `npm run check:live` | Consulta ao vivo B3 + Fundos.NET para todos os ativos |
| `npm start` | Build + servidor único (frontend + API + agendador) |
| `npm run test:e2e` | 18 testes de interface (Playwright) em desktop, tablet e celular |
| `npm run typecheck` | Checagem de tipos do frontend e do servidor |
| `npm run lint` | ESLint (inclui `react-hooks/exhaustive-deps`) |
| `npm run ci` | Typecheck + lint + testes + build + E2E (o mesmo do GitHub Actions) |
| `npm run build` | Typecheck + build de produção em `dist/` |

## Como usar

1. **Demonstração** (padrão): valores do exemplo original — preço R$ 8,89, dividendo R$ 0,10, 2 cotas/mês, inflação 6%, aporte R$ 250, 360 meses. Resultado: **178 cotas / R$ 1.582,42**.
2. **Dados de mercado**: preço de fechamento da B3 e rendimentos do Fundos.NET, buscados automaticamente (veja abaixo).
3. Todo campo é editável e o recálculo é imediato. Ao editar, o status passa a **Cenário personalizado**, e esse cenário não é sobrescrito por atualizações (só por ação explícita do usuário).
4. Abas **Nominal**, **Inflação** e **Aportes mensais**: resumo executivo, meta de renda, 7 tipos de gráfico (horizontes de 1/5/10/20/30 anos) e tabela de 360 linhas.
5. **Comparação de estratégias** (reinvestir 100%, 50% ou 0%) e **Laboratório de Cenários** (Estável, Conservador, Otimista, Personalizado; compara até 3).
6. Exportação: **CSV** (UTF-8 com BOM, `;`, vírgula decimal), **Excel (.xlsx)** com aba de premissas, e **Imprimir/PDF** (relatório com premissas, cenário, data e limitações).
7. **Restaurar padrão** volta aos valores de demonstração. Preferências ficam no `localStorage` do navegador (nada sensível é guardado).

## Arquitetura

```
src/
  engine/        Motor financeiro puro (sem React): decimal.ts, magic.ts, simulate.ts, costs.ts,
                 calendar.ts (pregões B3), strategies.ts, validation.ts, types.ts + testes
  assets/        Registro de ativos (adicionar FIIs/ações/ETFs aqui)
  scenarios/     Gerenciador de cenários: parâmetros das abas e do Laboratório
  market/        Contrato de dados de mercado (tipos) e cliente HTTP do frontend
  export/        CSV e Excel (.xlsx gerado com fflate, sem dependência pesada)
  ui/            Componentes React, formatação pt-BR, formulário, relatório
server/
  index.ts       API HTTP (node:http) — GET /api/market/:ticker, POST /api/market/:ticker/refresh, GET /api/health
  service.ts     Atualização com preservação do último dado válido
  scheduler.ts   node-cron, 09:00 America/Sao_Paulo, pula fins de semana/feriados
  calendar.ts    Feriados extras manuais e aprendidos (o calendário em si fica em src/engine/calendar.ts)
  providers/     official.ts (B3 COTAHIST + Fundos.NET), manual.ts (arquivo JSON), http-json.ts (fornecedor contratado)
  http.ts        fetch com suporte a proxy corporativo
  store.ts       Persistência em JSON com escrita atômica
  fixtures/      Documentos oficiais reais usados nos testes (COTAHIST e avisos do Fundos.NET)
scripts/
  check-live.ts  Verificação ao vivo das fontes oficiais
e2e/             Testes Playwright
```

**Por que não PostgreSQL:** só há um snapshot por ativo e um único servidor. Um arquivo JSON com escrita atômica basta. Para vários servidores ou histórico de cotações, troque `JsonStore` por uma implementação PostgreSQL com a mesma interface `get/set`.

### Regras do motor (auditáveis em `src/engine/simulate.ts`)

- Toda conta usa `decimal.js` (precisão 40, half-up). Os números do JS só viram `number` na hora de desenhar os gráficos.
- **Número mágico** = teto[(cotas desejadas × preço) / dividendo]. Depois vem o ajuste pela quantização: a menor quantidade *n* tal que `centavos(n × dividendo) − IR ≥ cotas desejadas × preço + custos`. Quando esse ajuste muda o resultado, a interface avisa. Com dividendo zero, não existe número mágico finito.
- Sequência mensal: cotas iniciais → rendimento = centavos_half-up(cotas × dividendo) → IR retido (se houver) → disponível = parcela reinvestida + aporte + sobra anterior + juros da sobra → compradas = maior inteiro cujo preço + custos cabe no disponível → sobra → cotas finais → valor das cotas → patrimônio total (cotas + sobra).
- Cotas compradas no mês só rendem no mês seguinte. Cotas são sempre inteiras e a sobra nunca é negativa (há uma checagem de invariante).
- Valor real(t) = nominal(t) / (1 + inflação)^(t/12), com o mês 0 como data-base.
- Aportes: zero no mês 1. Nos meses 2–12 vale o aporte base; nos meses 13–24, base × (1+i); e assim por diante (arredondado em centavos).
- Meta de renda: primeiro mês em que a renda das cotas **no início do mês** (antes do reinvestimento) alcança a meta, nominal ou real.
- Estratégias com retirada: a parcela reinvestida é arredondada em centavos e o restante conta como dinheiro retirado. O retirado fica fora do patrimônio investido, então não há dupla contagem.
- Cenários: as variações anuais de preço e dividendo entram a cada 12 meses. O preço é arredondado em centavos. O dividendo derivado é **truncado** em 6 casas, para nunca criar provento artificial.

## Dados de mercado — fontes oficiais, sem chave

O servidor busca dados **automaticamente em fontes oficiais e públicas**, sem cadastro nem token:

| Dado | Fonte | Como |
|---|---|---|
| Último preço (fechamento do pregão) | **B3 — arquivo diário COTAHIST** (`bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_DDDMMAAAA.ZIP`) | ZIP com layout posicional oficial; usa `PREULT` do mercado à vista (TPMERC 010) |
| Rendimento pago e anunciado, data-com, pagamento, isenção de IR | **Fundos.NET (B3/CVM)** — *Aviso aos Cotistas – Estruturado / Rendimentos e Amortizações* | Documento XML entregue pelo administrador do fundo, filtrado pelo CNPJ e pelo código de negociação exato |
| CNPJ, ISIN, administrador | **CVM Dados Abertos** (`inf_mensal_fii`) | Conferidos no cadastro de cada ativo em `src/assets/registry.ts` |

Não há scraping de HTML. Os três são arquivos de dados públicos e estruturados, publicados para consulta e download. A interface mostra separadamente:

- último preço e a data do pregão;
- último rendimento **pago**;
- último rendimento **anunciado e ainda não pago**;
- data-com e data de pagamento;
- isenção de IR informada no aviso;
- link do documento de origem;
- horário da última consulta bem-sucedida.

A simulação usa por padrão o **último rendimento anunciado** e informa qual foi usado. Ao aplicar os dados, o **prazo data-com → pagamento** observado no aviso e o mês do 1º pagamento também entram nas premissas.

**Agendamento:** todo dia às **9h (America/Sao_Paulo)**, no servidor (`node-cron`), só em dias de pregão. Em caso de falha, o último conjunto válido é mantido e o erro é registrado; a interface mostra o aviso de dados desatualizados. O botão **Atualizar agora** força a consulta. Na primeira inicialização sem dados salvos, o servidor já faz uma carga.

**Calendário B3:**
- Inclui feriados nacionais fixos, os móveis (calculados a partir da Páscoa), 24/12 e 31/12.
- **Fechamentos extraordinários são aprendidos sozinhos.** Quando um dia útil fica 2 ou mais dias sem arquivo COTAHIST publicado, ele é gravado em `server/data/holidays-learned.json` e passa a ser tratado como dia sem pregão. Também é possível incluí-lo à mão em `server/data/holidays-extra.json`.
- **"Dados desatualizados"** compara a data do pregão com o último pregão já encerrado. Antes das 21h de um dia útil, o pregão do dia ainda está em andamento, então vale o fechamento anterior.

**Verificação ao vivo:**

```bash
npm run check:live
```

Consulta as fontes oficiais para todos os ativos e falha se alguma não responder.

**Provedores alternativos** (`MARKET_PROVIDER`):

| Valor | Comportamento |
|---|---|
| `official` (padrão) | B3 + Fundos.NET |
| `manual` | Lê `server/data/market-manual.json` (modelo em `market-manual.example.json`) |
| `http` | Fornecedor contratado que exponha o contrato `MarketSnapshot`, via `MARKET_PROVIDER_URL`, `MARKET_PROVIDER_TOKEN` e `MARKET_PROVIDER_NAME` |

Também existe entrada manual direto no navegador ("Inserir manualmente").

**Proxy corporativo:** se `HTTPS_PROXY`/`HTTP_PROXY` estiverem definidos, o servidor usa esse proxy (respeitando `NO_PROXY`). Os hosts que precisam estar liberados são `bvmf.bmfbovespa.com.br` e `fnet.bmfbovespa.com.br`.

## Ativos

O seletor no topo oferece **MXRF11, HGLG11, KNRI11, KNCR11 e VISC11**. O CNPJ e o ISIN de cada um foram conferidos na base da CVM e no COTAHIST, e o código foi conferido nos avisos do Fundos.NET. O modo Demonstração (valores do vídeo) existe só para o MXRF11; os demais usam dados de mercado.

Para adicionar outro FII, inclua ticker, CNPJ, ISIN e o prazo típico em `src/assets/registry.ts`. Em seguida, rode `npm run check:live`.

## Premissas avançadas

Ficam no painel "Premissas avançadas":

- **Datas reais.** Informe o mês do 1º pagamento. A data-com é o último dia útil do mês anterior, e o pagamento vem N dias úteis depois (calendário B3). Para o MXRF11, os avisos de ago/set/out de 2026 mostram 10 dias úteis; o teste reproduz exatamente 15/09, 15/10 e 16/11. As cotas compradas no pagamento estão em carteira na data-com seguinte, por isso rendem no mês seguinte. Isso é o cronograma real, não uma simplificação.
- **Custos de negociação.** Percentual sobre o valor da ordem (corretagem + emolumentos) e custo fixo por ordem. A compra é sempre do maior número inteiro de cotas cujo custo total cabe no disponível. O número mágico também considera os custos.
- **IR sobre rendimentos.** Padrão 0%. Ao aplicar dados de mercado com "isento" no aviso oficial, fica em 0%. O IR é retido em centavos, e o número mágico usa o rendimento líquido.
- **IR sobre ganho de capital.** Padrão 20% (pessoa física em FII). Gera o "patrimônio líquido se vendido": patrimônio − custos de venda − IR sobre (valor de venda − custo de aquisição acumulado).
- **Remuneração do caixa.** Taxa anual aplicada mensalmente à sobra residual. Os juros são truncados em centavos, para nunca criar dinheiro.

Essas premissas aparecem no relatório PDF e na aba "Premissas" do Excel. A tabela e o CSV ganham as colunas Data-com, Pagamento/compra, IR retido, Juros do caixa, Custos e Patrimônio líquido se vendido.

## Segurança e operação

| Variável | Padrão | Efeito |
|---|---|---|
| `HOST` | `127.0.0.1` | Interface de escuta. Use `0.0.0.0` só atrás de um proxy reverso. |
| `REFRESH_TOKEN` | (vazio) | Se definido, o `POST /api/market/:ticker/refresh` exige `Authorization: Bearer <token>`. |
| `REFRESH_COOLDOWN_MS` | `300000` | Intervalo mínimo entre atualizações manuais do mesmo ativo; antes disso, a resposta é 429. |
| `DISABLE_SCHEDULER` | — | Use `1` para desligar o agendador interno. |

**Proteções do endpoint de atualização:**
- exige o cabeçalho `X-Requested-With: mxrf11`, o que bloqueia CSRF;
- consultas simultâneas do mesmo ativo são unificadas;
- o arquivo COTAHIST fica em cache por 10 minutos.

**Respostas do servidor:**
- incluem CSP, `nosniff`, `X-Frame-Options` e `Referrer-Policy`;
- erros 500 não expõem detalhes internos, e os logs são JSON estruturado.

O relatório completo da revisão está em [`docs/REVISAO.md`](docs/REVISAO.md).

## Publicação

**Um único processo** serve o frontend e a API:

```bash
npm start
```

Faz o build e roda `server/index.ts`, que entrega `dist/` e `/api`. Porta em `PORT` (padrão 8787). Em servidor/container, defina `HOST=0.0.0.0` atrás de um proxy reverso com HTTPS.

Exemplos de hospedagem: VM, container, Fly.io, Railway ou Render.

| Variável | Uso |
|---|---|
| `MARKET_STORE_FILE` | Arquivo onde os dados de mercado ficam salvos |
| `MARKET_LEARNED_HOLIDAYS_FILE` | Arquivo dos dias sem pregão aprendidos |

Aponte as duas para um volume persistente. O agendador precisa de um processo sempre ativo. Em plataformas serverless, use um cron externo chamando `POST /api/market/<TICKER>/refresh` às 9h (horário de Brasília) em dias úteis, e defina `DISABLE_SCHEDULER=1`.

**Somente estático** (`dist/` em Netlify, Vercel, Pages): funciona com entrada manual de dados no navegador.

## Testes

- `npm test`: 61 testes unitários. Cobrem os casos obrigatórios 1 e 2, arredondamento half-up, quantização do número mágico, dividendo zero, inflação zero e negativa, aporte a partir do mês 2 e reajuste no mês 13, meta atingida e não atingida, exatamente 360 linhas, conservação do caixa em todos os períodos, real × nominal, estratégias sem dupla contagem, validações, recálculo após mudança de parâmetros, calendário B3/agendador e falha na atualização externa (HTTP 503 e erro de rede preservam o último dado válido). Também cobrem as premissas avançadas: datas reais reproduzindo os avisos oficiais, custos, IR sobre rendimentos e sobre ganho de capital, juros do caixa. Para o provedor oficial, há parsers do COTAHIST e do XML do Fundos.NET com documentos reais, separação de códigos (HGLG11 × HGLG13), transição de anunciado para pago e aprendizado de feriados. A exportação também é testada: CSV e XLSX válido.
- `npm run test:e2e`: 13 testes de interface. Incluem premissas avançadas (IR 15% → 210 cotas; custo fixo R$ 1 → 188) e o seletor de ativos. Também verificam os cards 178 / R$ 1.582,42, as 360 linhas, a edição instantânea (caso 2 → 186 / R$ 1.636,80), o status personalizado, dividendo zero, parâmetro inválido, restauração, as abas, o CSV brasileiro, o fluxo do modo manual de mercado com falha de atualização sem sobrescrever o cenário personalizado, a persistência e a ausência de rolagem horizontal em desktop, tablet e celular.

## Premissas que continuam sendo hipóteses

Não são pendências de implementação, e sim a natureza de qualquer projeção:

- **Preço e dividendo futuros.** São constantes nas abas principais. Variações só aparecem no Laboratório de Cenários. Nenhuma fonte oficial informa valores futuros.
- **Custos e alíquotas.** São os que você informar. A tabela da sua corretora, os emolumentos vigentes da B3 e a legislação tributária mudam com o tempo e dependem do perfil do investidor.
- **Compras.** Acontecem ao preço do mês, sem spread nem impacto de liquidez.
