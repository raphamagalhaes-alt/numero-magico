# Número Mágico — Simulador e Explorador de Investimentos

Simulador web educativo, em português do Brasil, que mostra como o reinvestimento de dividendos aumenta aos poucos a quantidade de cotas de um fundo imobiliário. O ponto de partida é o **número mágico**: quantas cotas são necessárias para que um mês de rendimento compre novas cotas.

> Simulação educativa. Fundos imobiliários são investimentos de renda variável. Preços, distribuições de rendimentos, inflação, liquidez e condições tributárias podem mudar. Resultados projetados não representam garantia de rentabilidade ou renda futura. Não constitui recomendação de investimento.

## O que é

Plataforma educativa com **dados oficiais atualizados diariamente**. Tem seis páginas:

| Página | O que faz |
|---|---|
| **Simulador** | Número mágico e 360 meses de reinvestimento para qualquer FII ou Fiagro. Inclui comparação com renda fixa, testes de estresse, faixas Monte Carlo, estratégias, Laboratório de Cenários, cenários salvos e relatório com marca própria. |
| **Explorar ativos** | Ações, FIIs, ETFs, BDRs, Fiagros e outros fundos negociados na B3, com filtros objetivos. FIIs e Fiagros mostram DY de 12 meses, último rendimento e P/VP; todos os ativos mostram liquidez, volatilidade, variação e queda máxima. **Sem ranking de "melhor ativo" e sem recomendação.** |
| **Comparar** | Até 4 ativos lado a lado, com gráfico de preço em base 100. |
| **Juros e renda fixa** | Selic, CDI, IPCA, IGP-M, dólar e euro (Banco Central); preços e taxas do Tesouro Direto; juros básicos de cerca de 20 bancos centrais (BIS, Fed NY, BCE). |
| **Minha carteira** | Cotas que você tem, progresso até o número mágico de cada fundo e alerta quando sai um novo aviso de rendimento (no app e por notificação do navegador). |
| **Status dos dados** | Data de referência, última consulta e erros de cada fonte oficial. |

O MXRF11 continua como exemplo didático padrão (modo Demonstração).

## Modo site (GitHub Pages) — regular e sem contrato

`npm run build:web` gera `dist-web/`, um site estático com o **backend rodando no navegador** (`src/web/backend.ts`). O código intercepta as chamadas `/api` e calcula tudo no aparelho do usuário.

**O que o site publica:** apenas código e **dados abertos** (`data/open-data.json`, gerado por `scripts/build-open-data.ts`):
- CVM (licença ODbL): cadastro, VP/cota, cotistas e rendimento mensal estimado;
- Banco Central;
- Tesouro;
- BIS, Fed e BCE.

**O que fica com o usuário, no navegador (IndexedDB):**
- **Arquivos COTAHIST** baixados por ele, lidos em fluxo, sem carregar o arquivo inteiro descompactado.
- **Chave pessoal da brapi:** histórico de 3 meses e fechamento da lista de acompanhamento, consultados direto do navegador. A brapi aceita CORS.

**Rendimentos de FII no site:** média de 12 meses do informe da CVM (DY do mês × VP/cota). Medido contra os avisos reais: erro de −3,1% a +0,8% em MXRF11, HGLG11, KNRI11, KNCR11 e VISC11. É sempre rotulado como **estimativa**.

**Testes:** `npm run test:web` cobre desktop e celular, e verifica que **nenhuma requisição vai à B3** e que o único destino externo é a brapi, com a chave do usuário.

**Publicação:** o workflow `site.yml` publica no GitHub Pages e reconstrói os dados abertos às 10h17 e às 22h47 (Brasília). Há `robots.txt` para o site não ser indexado.

## App desktop (Windows, Mac, Linux) e celular

O guia para usuários está em [`docs/INSTALAR.md`](docs/INSTALAR.md). Em resumo:

| Item | Detalhe |
|---|---|
| App desktop | Electron (`electron/main.cjs`). O servidor roda **dentro do app, no computador do usuário**. Nenhum dado de mercado passa por servidores do projeto. |
| Desenvolvimento | `npm run desktop` abre o app. |
| Pacotes | `npm run dist:desktop` gera os pacotes em `release-desktop/`. |
| Instaladores `.exe`, `.dmg` e AppImage | Workflow do GitHub *Instaladores desktop*. No macOS, a assinatura ad-hoc gratuita é aplicada no `afterPack`. |
| Cotações sem coleta automatizada da B3 | O app observa a pasta **Downloads** e importa os arquivos COTAHIST que o usuário baixar. Às 20h45 dos pregões há um lembrete com link para a página da B3. |
| Cotações automáticas regulares | Chave **pessoal** e gratuita da brapi de cada usuário, chamada do próprio computador, só para a lista de acompanhamento: carteira, comparações e simulador, até 60 ativos por atualização. |
| Celular | Menu *Celular* → QR code. O servidor do computador passa a aceitar a rede local, com senha obrigatória (`ACCESS_TOKEN`), e o celular adiciona o app à tela inicial (PWA com manifesto e ícones). |

**Testado aqui:**
- o app empacotado foi aberto numa tela virtual (Xvfb + Playwright);
- a importação automática a partir da pasta Downloads funcionou;
- o acesso pela rede foi testado com e sem senha.

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
| `npm test` | 111 testes unitários (Vitest): motor, premissas avançadas, calendário, provedor oficial, exportação |
| `npm run check:live` | Consulta ao vivo B3 + Fundos.NET para todos os ativos |
| `npm run data:update` | Rodada completa da central de dados (cotações, CVM, rendimentos, BCB, Tesouro, juros globais) |
| `npm start` | Build + servidor único (frontend + API + agendador) |
| `npm run test:web` | 6 testes do modo site (desktop e celular) |
| `npm run build:web` | Gera o site estático com os dados abertos do dia |
| `npm run test:e2e` | 33 testes de interface (Playwright) em desktop, tablet e celular |
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

## Termos de uso da B3 (importante)

A B3 **proíbe a coleta automatizada** da página de Cotações Históricas, e os dados do site dela são de **uso exclusivamente pessoal**. Publicar cotações exige contrato com a B3. Detalhes e trechos literais estão em [`docs/LICENCA-B3.md`](docs/LICENCA-B3.md).

**Como o app se adequa:**
- **Cotações:** você baixa o COTAHIST no site da B3 (diário, mensal ou anual) e envia em *Status dos dados*, ou coloca o arquivo em `server/data/import/`. O app processa tudo sozinho, às 9h e às 21h30 e a cada envio.
- **Download automático:** só com `B3_MARKET_DATA_AUTHORIZED=1`, para quem tiver autorização da B3.
- **Servidor exposto na internet** (HOST diferente de localhost) sem essa variável: os dados da B3 respondem HTTP 451. Os dados abertos (CVM, BCB, Tesouro, BIS, Fed, BCE) continuam disponíveis. Para uso pessoal num servidor próprio com acesso restrito, `B3_PERSONAL_USE_ACK=1` libera os dados.
- **Testes:** usam arquivos COTAHIST **sintéticos** (`scripts/make-fixtures.ts`), sem redistribuir dados reais da B3.

## Central de dados — todas as fontes oficiais

O servidor (`server/hub.ts`) atualiza **todos os dias às 9h e às 21h30 (America/Sao_Paulo)**. A rodada das 21h30 pega o fechamento do dia, que a B3 publica por volta das 20h30. Os dados são consumidos de fontes públicas, com código próprio; nada é copiado de corretoras ou de terceiros.

| Conjunto | Fonte oficial | Frequência | Cobertura |
|---|---|---|---|
| Cotações, volume, variação, volatilidade | B3 — arquivos COTAHIST **importados pelo usuário** (download automático só com autorização da B3) | A cada importação; processamento às 9h e 21h30 | Ações, FIIs, Fiagros, ETFs, BDRs e fundos listados (~1.900 ativos) |
| Dividendos e JCP de ações, por evento e por classe (valor, data-com, pagamento, tipo) | B3 — Empresas Listadas (proventos em dinheiro), uso pessoal | Diária | Ações com negócio recente (~330 emissores) |
| Rendimentos de FII/Fiagro (data-com, pagamento, isenção) | Fundos.NET — avisos estruturados de **todos** os fundos, por período de entrega | Diária (incremental) | Retroativo padrão de 400 dias, retomável |
| CNPJ, VP/cota, cotistas, segmento | CVM Dados Abertos — informe mensal de FII | Diária (a CVM publica mensalmente) | Todos os FIIs com ISIN |
| Selic, CDI, IPCA, IGP-M, PTAX | Banco Central — SGS (consulta por período até hoje) | Diária | Séries 432, 4389, 433, 13522, 189, 1, 21619 |
| Tesouro Direto | Tesouro Transparente — preços e taxas | Diária | Todos os títulos ofertados |
| Juros de bancos centrais | BIS (WS_CBPOL), Fed NY (EFFR), BCE (DFR) | Diária | ~20 países e regiões |

**Comportamento da central:**
- **Falhas:** cada fonte tem estado próprio. Em caso de falha, os últimos dados válidos são mantidos; os erros aparecem em *Status dos dados*.
- **Concorrência:** execuções simultâneas são unificadas.
- **Persistência:** os dados ficam em `DATA_DIR` (padrão `server/data/cache/`).

**Operação:**
- `npm run data:update` faz uma rodada completa manualmente; também serve para um cron externo.
- `HISTORY_MONTHS` controla a carga inicial de cotações (padrão 13).
- `DIVIDEND_BACKFILL_DAYS` controla o retroativo de rendimentos (padrão 400). A carga retroativa faz cerca de 7 mil downloads com pausa entre requisições, para ser gentil com a fonte, e salva o progresso a cada semana: se cair, retoma de onde parou.

**Regras de honestidade dos indicadores:**
- **DY de 12 meses:** só é exibido quando a central já tem 12 meses contínuos de avisos carregados. Antes disso aparece "—", com aviso.
- **Cobertura de rendimentos:** só avança quando o intervalo fica contínuo; um retroativo interrompido não conta.
- **P/VP:** valores fora de 0,2–5 são marcados como `n/d*`. Isso indica valor patrimonial da CVM incompatível com a cota negociada, por exemplo desdobramento recente.
- **Status visível:** falhas parciais (como o download do Tesouro) aparecem em *Status dos dados*, nunca escondidas atrás de um "ok".
- **Particularidade do Banco Central:** o SGS devolve 304 sem conteúdo para algumas janelas de datas, e a série da meta Selic publica datas futuras. O app consulta por período até hoje e repete a consulta com a janela deslocada.

**Ações no simulador:** dividendos e JCP são irregulares. Por isso o simulador usa a **média mensal dos proventos brutos dos últimos 12 meses**, calculada em decimal e sempre identificada como média. O DY de ações soma dividendos e JCP brutos, antes do IR retido no JCP.

## Alertas sem custo

Os canais são configurados em *Minha carteira*:

| Canal | Como funciona |
|---|---|
| Calendário | `webcal://…/api/alerts/calendar.ics?t=MXRF11,PETR4` traz datas-com e pagamentos. Funciona no Google Agenda, Apple e Outlook e se atualiza sozinho. |
| Feed RSS | `…/api/alerts/feed.xml?t=…`, para qualquer leitor de RSS. |
| Notificação push | Web Push, padrão aberto dos navegadores. As chaves VAPID são geradas localmente e não há serviço pago. Funciona com o app fechado; exige HTTPS fora do localhost. |
| Telegram (opcional) | Bot gratuito, configurado com `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` e `TELEGRAM_TICKERS`. |

Os alertas push e do Telegram saem depois de cada atualização da central e **só para eventos novos**. A primeira passagem apenas registra o histórico, para não disparar avisos antigos.

## Dados de mercado do simulador — fontes oficiais, sem chave

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

O simulador aceita **qualquer FII ou Fiagro** cujo ISIN esteja no informe da CVM, via Explorar → Simular ou pelo seletor. Os ativos com cadastro verificado manualmente são MXRF11, HGLG11, KNRI11, KNCR11 e VISC11. O CNPJ e o ISIN de cada um foram conferidos na base da CVM e no COTAHIST, e o código foi conferido nos avisos do Fundos.NET. O modo Demonstração (valores do vídeo) existe só para o MXRF11; os demais usam dados de mercado.

Para adicionar outro FII, inclua ticker, CNPJ, ISIN e o prazo típico em `src/assets/registry.ts`. Em seguida, rode `npm run check:live`.

## Ferramentas de decisão no simulador

- **Comparar com renda fixa.** O mesmo dinheiro, nas mesmas datas, é aplicado em:
  - CDB (% do CDI);
  - LCI/LCA (isenta);
  - Tesouro Selic;
  - Tesouro Prefixado e Tesouro IPCA+ (títulos mais longos ofertados hoje).

  As taxas padrão são as oficiais do dia, e todas são editáveis. O cálculo usa IR regressivo **por aporte** e custódia de 0,20% a.a. no Tesouro. A comparação é contra o "líquido se vendido" do FII.
- **Testes de estresse:**
  - corte de 20% no dividendo;
  - dividendo caindo 3% ao ano;
  - fim da isenção (IR de 15%);
  - preço caindo 2% ao ano.

  Todos usam o mesmo capital inicial do cenário-base.
- **Faixas Monte Carlo:** 500 trajetórias com semente fixa. A volatilidade do preço vem, por padrão, da volatilidade histórica de 12 meses do ativo (B3). O resultado mostra a faixa P10–P90 e a probabilidade de atingir a meta.
- **Regra de compra mínima:** só compra quando os custos forem no máximo X% da ordem; caso contrário, acumula caixa.
- **Cenários salvos e relatório com marca:** nome e logo do assessor, escritório ou educador no PDF.
- **Onboarding em 3 perguntas:** renda desejada, aporte e fundo. O formulário completo continua disponível.

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
