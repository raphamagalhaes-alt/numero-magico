# Revisão especializada: MXRF11 · O Número Mágico

**Data:** 08/11/2026.

Quatro revisões independentes foram feitas, cada uma com uma lente diferente e lendo o código do zero:

1. **Engenharia financeira:** motor, métricas e cenários.
2. **Compliance e dados:** CVM, tributação, Fundos.NET e B3.
3. **Produto, UX e acessibilidade:** 24 capturas em desktop, tablet e celular, mais auditoria WCAG.
4. **Segurança e engenharia de software:** servidor, concorrência, dependências e testes.

São perspectivas especializadas simuladas, não pessoas reais. Todo achado corrigido foi reproduzido antes da correção e ganhou um teste automatizado.

**Resultado:**

| Verificação | Antes da revisão | Depois da revisão |
|---|---|---|
| Testes unitários | 61 | 82 |
| Testes E2E | 13 | 18 |
| ESLint | — | sem erros e sem silenciamentos |
| `npm audit --omit=dev` | — | 0 vulnerabilidades |
| CI | — | GitHub Actions criado |

## Defeitos corrigidos

| # | Severidade | Achado | Correção |
|---|---|---|---|
| 1 | Crítico | Ao trocar de ativo, o app consultava e podia **aplicar preço e rendimento do MXRF11 a outro FII** (closure obsoleta). | Dependências corrigidas; respostas de outro ativo são descartadas; teste E2E verifica as URLs chamadas. |
| 2 | Crítico | No modo mercado sem dados, o selo dizia "exemplo original" sob o botão "Dados de mercado": **8,89 parecia cotação real**. | Selo vermelho: "Sem cotação — usando valores de exemplo". |
| 3 | Alto | Fundos.NET: documentos **inativos (IC), cancelados (CC) e versões antigas** eram processados. | Só documentos ativos (AC/A); a maior versão prevalece por data-com; testes com casos reais. |
| 4 | Alto | Atualizações simultâneas: uma **falha tardia regravava o dado antigo** por cima do novo. | Consulta em andamento compartilhada por ativo; o store é relido no erro; teste de concorrência. |
| 5 | Alto | `POST /refresh` aberto e sem limite. Cada chamada baixava o ZIP da B3 de novo (abuso das fontes e CSRF). | Intervalo mínimo por ativo (429), cabeçalho anti-CSRF, token opcional, cache do COTAHIST (1 download para todos os ativos), `HOST=127.0.0.1` por padrão. |
| 6 | Alto | Gráfico de renda usava **renda bruta** enquanto a meta usava a líquida (com IR, cruzava a meta 16 meses antes). | Gráfico usa renda líquida. |
| 7 | Alto | Desempenho: potência fracionária por mês, cerca de 0,8 s por alteração. | Fator mensal acumulado e simulação nominal reaproveitada; 360 meses em menos de 60 ms (teste). |
| 8 | Alto | Isenção de IR tratada como absoluta ("Isento de IR (PF)") e **IR zerado automaticamente**. | Texto condicional aos requisitos do fundo e do cotista; nada é zerado sem o usuário; aviso no relatório. |
| 9 | Médio | Falha só no Fundos.NET descartava também o preço válido da B3. | `allSettled`, merge com o último dado válido, 2 novas tentativas com backoff. |
| 10 | Médio | "Feriado aprendido" a partir de um único 404 transitório, de forma permanente. | Fica pendente e só é confirmado na 2ª observação em outro dia; idade medida em dias úteis. |
| 11 | Médio | `localStorage` adulterado deixava a **tela em branco** (inclusive `ticker: "constructor"`). | Validação de esquema, `Object.hasOwn` e ErrorBoundary com "Redefinir". |
| 12 | Médio | `sourceUrl` externo aceitava `javascript:`. | Somente `https:` no servidor e no cliente. |
| 13 | Médio | Sem cabeçalhos de segurança; erros vazavam stack e caminhos do servidor. | CSP, nosniff, X-Frame-Options e Referrer-Policy; mensagem genérica com detalhes só no log estruturado. |
| 14 | Médio | Meta "atingida" que depois **volta a ficar abaixo** (renda real com inflação alta) sem aviso. | `goalSustained` e aviso no banner. |
| 15 | Médio | Prazo de pagamento de até 40 dias úteis violava a premissa de compra antes da próxima data-com. | Limite de 15 dias úteis. |
| 16 | Médio | Laboratório: "2.5" virava 25%; cenários com aporte e inflação diferentes, portanto não comparáveis. | `parseBR`; Estável, Conservador e Otimista herdam aporte e inflação da aba. |
| 17 | Médio | Métricas enganosas: "5.494% de crescimento" em 30 anos e "perda de poder de compra" maior que o patrimônio. | **TIR nominal e real anualizada**; rótulo "efeito da inflação (nominal − real)". |
| 18 | Médio | Contraste de `mist-500` em 3,7–4,1:1 (reprova WCAG AA). | Token ajustado para 4,9–5,8:1. |
| 19 | Médio | Campo inválido apagava todo o resultado. | Mantém o último resultado válido, esmaecido. |
| 20 | Baixo | COTAHIST: FATCOT, ISIN e ativo sem negócio no dia. | Preço dividido pelo fator; ISIN conferido com o cadastro; recua ao pregão anterior. |
| 21 | Baixo | XML com vários blocos `<Rendimento>`; janela de 6 documentos. | Todos os blocos são lidos; janela de 12 documentos. |
| 22 | Baixo | Dependências vulneráveis: fflate (loop em ZIP malformado), undici, uuid (via node-cron). | fflate 0.8.3, undici 6.29.1, node-cron 4.2.1 (`noOverlap`). |
| 23 | Baixo | Rejeições não tratadas podiam derrubar o processo; o agendador podia sobrepor execuções. | `catch` em todos os caminhos e trava de execução. |
| 24 | Baixo | Asset inexistente respondia HTML com status 200; `HEAD` respondia 404. | 404 real; `HEAD` suportado; checagem de caminho com `path.relative`. |
| 25 | Baixo | Acessibilidade: alvos de 17 px, `role=alert` a cada tecla, headings fora de ordem, gráficos sem descrição, sem `prefers-reduced-motion`. | Todos corrigidos. |
| 26 | Baixo | Engenharia: sem CI, sem lint, Playwright com variáveis POSIX e reaproveitando o servidor de desenvolvimento. | GitHub Actions (com verificação diária ao vivo das fontes), ESLint com `react-hooks`, `.nvmrc`/`engines`, porta dedicada e `env:` portátil. |

## Melhorias de produto já implementadas

- **Frase-conceito no topo**, em linguagem hipotética: "Neste cenário, com 178 cotas, os rendimentos de um mês comprariam 2 cotas novas…".
- **Faixa de resultado no celular**: o número mágico aparece na primeira tela, e não depois de 960 px.
- **Banner "Quase lá"**, com a dica de quando a meta é atingida com aportes. Antes, o primeiro resultado da tela era um fracasso em vermelho.
- **Link compartilhável do cenário** ("Copiar link do cenário") e metatags Open Graph.
- **Aviso educativo junto aos números grandes**, além do rodapé, e também na planilha principal do Excel.

## Recomendações — situação em 08/11/2026

| # | Recomendação | Situação |
|---|---|---|
| 1 | Nome neutro | **Feito:** "Número Mágico — Simulador e Explorador de Investimentos". O MXRF11 virou só o exemplo padrão. |
| 2 | Licença de market data da B3 | **Pendente — depende de você.** Exibir cotações publicamente pode exigir licença; confirmar com a B3 antes de publicar. O app usa só arquivos públicos de download. |
| 3 | Comparar com renda fixa | **Feito:** CDB, LCI/LCA, Tesouro Selic, Prefixado e IPCA+, com as taxas oficiais do dia, IR regressivo por aporte e custódia. |
| 4 | Faixas de resultado e testes de estresse | **Feito:** Monte Carlo com 500 trajetórias e volatilidade histórica do ativo; 4 choques de estresse. |
| 5 | Onboarding em 3 perguntas e tabela por ano no celular | **Feito.** |
| 6 | Retenção | **Feito:** "Minha carteira" com progresso até o número mágico e alerta de novo aviso de rendimento, no app e por notificação do navegador. Alerta por e-mail exigiria contas de usuário e um serviço de envio. |
| 7 | Recursos "Pro" | **Feitos:** comparador lado a lado, PDF com marca própria e cenários salvos. Não há cobrança: um plano pago exigiria contas e meio de pagamento. |
| 8 | Regra de compra mínima | **Feito:** custo máximo por ordem; abaixo dele, o caixa acumula. |
| — | Explorar outros ativos e investimentos | **Feito:** universo completo da B3 (ações, FIIs, ETFs, BDRs, Fiagros), juros e renda fixa do Brasil, e juros de cerca de 20 bancos centrais, com atualização diária em fontes oficiais. |
