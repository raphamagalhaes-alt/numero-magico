# MXRF11 · O Número Mágico — Financial Intelligence Simulator 2.0

Simulador web educativo, em português do Brasil, que mostra como o reinvestimento de dividendos aumenta aos poucos a quantidade de cotas de um fundo imobiliário. O ponto de partida é o **número mágico**: quantas cotas são necessárias para que um mês de rendimento compre novas cotas.

> Simulação educativa. Fundos imobiliários são investimentos de renda variável. Preços, distribuições de rendimentos, inflação, liquidez e condições tributárias podem mudar. Resultados projetados não representam garantia de rentabilidade ou renda futura. Não constitui recomendação de investimento.

## Instalação e execução

Requisitos: Node.js 20+ (testado com 22).

```bash
npm install
npm run dev          # frontend (http://localhost:5173) + API de dados (http://localhost:8787)
```

| Script | O que faz |
|---|---|
| `npm run dev` | Vite + servidor de dados com recarga automática |
| `npm run dev:web` | Apenas o frontend (o modo de mercado mostrará "serviço indisponível") |
| `npm run server` | Apenas a API de dados + agendador |
| `npm test` | Testes unitários (Vitest): motor financeiro, calendário, serviço de mercado |
| `npm run test:e2e` | Testes de interface (Playwright) em desktop, tablet e celular |
| `npm run typecheck` | Checagem de tipos do frontend e do servidor |
| `npm run build` | Typecheck + build de produção em `dist/` |

## Como usar

1. **Demonstração** (padrão): valores do exemplo original — preço R$ 8,89, dividendo R$ 0,10, 2 cotas/mês, inflação 6%, aporte R$ 250, 360 meses. Resultado: **178 cotas / R$ 1.582,42**.
2. **Dados de mercado**: consulta a API local. Sem integração licenciada configurada, funciona em **modo manual** (veja abaixo), sem alegar atualização automática.
3. Todo campo é editável e o recálculo é imediato. Ao editar, o status passa a **Cenário personalizado**, e esse cenário não é sobrescrito por atualizações (só por ação explícita do usuário).
4. Abas **Nominal**, **Inflação** e **Aportes mensais**: resumo executivo, meta de renda, 7 tipos de gráfico (horizontes de 1/5/10/20/30 anos) e tabela de 360 linhas.
5. **Comparação de estratégias** (reinvestir 100%, 50% ou 0%) e **Laboratório de Cenários** (Estável, Conservador, Otimista, Personalizado; compara até 3).
6. Exportação: **CSV** (UTF-8 com BOM, `;`, vírgula decimal), **Excel (.xlsx)** com aba de premissas, e **Imprimir/PDF** (relatório com premissas, cenário, data e limitações).
7. **Restaurar padrão** volta aos valores de demonstração. Preferências ficam no `localStorage` do navegador (nada sensível é guardado).

## Arquitetura

```
src/
  engine/        Motor financeiro puro (sem React): decimal.ts, magic.ts, simulate.ts,
                 strategies.ts, validation.ts, types.ts + engine.test.ts
  assets/        Registro de ativos (adicionar FIIs/ações/ETFs aqui)
  scenarios/     Gerenciador de cenários: parâmetros das abas e do Laboratório
  market/        Contrato de dados de mercado (tipos) e cliente HTTP do frontend
  export/        CSV e Excel (exceljs, carregado sob demanda)
  ui/            Componentes React, formatação pt-BR, formulário, relatório
server/
  index.ts       API HTTP (node:http) — GET /api/market/:ticker, POST /api/market/:ticker/refresh, GET /api/health
  service.ts     Atualização com preservação do último dado válido
  scheduler.ts   node-cron, 09:00 America/Sao_Paulo, pula fins de semana/feriados
  calendar.ts    Calendário de pregões B3 (feriados fixos, móveis via Páscoa, 24/12 e 31/12)
  providers/     manual.ts (arquivo JSON), http-json.ts (fornecedor licenciado genérico)
  store.ts       Persistência em JSON com escrita atômica
e2e/             Testes Playwright
```

**Por que não PostgreSQL:** só há um snapshot por ativo e um único servidor. Um arquivo JSON com escrita atômica basta. Para vários servidores ou histórico de cotações, troque `JsonStore` por uma implementação PostgreSQL com a mesma interface `get/set`.

### Regras do motor (auditáveis em `src/engine/simulate.ts`)

- Toda conta usa `decimal.js` (precisão 40, half-up). Os números do JS só viram `number` na hora de desenhar os gráficos.
- **Número mágico** = teto[(cotas desejadas × preço) / dividendo]. Depois vem o ajuste pela quantização: a menor quantidade *n* tal que `centavos(n × dividendo) ≥ cotas desejadas × preço`. Quando esse ajuste muda o resultado, a interface avisa. Com dividendo zero, não existe número mágico finito.
- Sequência mensal: cotas iniciais → rendimento = centavos_half-up(cotas × dividendo) → disponível = parcela reinvestida + aporte + sobra anterior → compradas = piso(disponível / preço) → sobra → cotas finais → valor das cotas → patrimônio total (cotas + sobra).
- Cotas compradas no mês só rendem no mês seguinte. Cotas são sempre inteiras e a sobra nunca é negativa (há uma checagem de invariante).
- Valor real(t) = nominal(t) / (1 + inflação)^(t/12), com o mês 0 como data-base.
- Aportes: zero no mês 1. Nos meses 2–12 vale o aporte base; nos meses 13–24, base × (1+i); e assim por diante (arredondado em centavos).
- Meta de renda: primeiro mês em que a renda das cotas **no início do mês** (antes do reinvestimento) alcança a meta, nominal ou real.
- Estratégias com retirada: a parcela reinvestida é arredondada em centavos e o restante conta como dinheiro retirado. O retirado fica fora do patrimônio investido, então não há dupla contagem.
- Cenários: as variações anuais de preço e dividendo entram a cada 12 meses. O preço é arredondado em centavos. O dividendo derivado é **truncado** em 6 casas, para nunca criar provento artificial.

## Dados de mercado

**Nenhuma integração automática vem ativada.** Não há fornecedor licenciado configurado neste projeto, e nenhuma cotação ou provento foi inventado ou incluído. Há duas formas de informar dados:

1. **Manual no navegador:** em "Dados de mercado", clique em **Inserir manualmente** e preencha preço, data/hora do negócio, rendimento (anunciado ou pago), data-com, data de pagamento e a fonte de cada informação.
2. **Manual no servidor:** copie `server/data/market-manual.example.json` para `server/data/market-manual.json` e preencha com valores conferidos em fontes oficiais (aviso aos cotistas no Fundos.NET/B3, relatório do gestor).

Para cada dado, a interface separa último preço negociado (com horário), último rendimento **pago**, último rendimento **anunciado e ainda não pago**, data-com, data de pagamento, fonte e horário da última consulta bem-sucedida. Por padrão, a simulação usa o **último rendimento anunciado** (ou o último pago, se não houver anúncio) e mostra qual foi usado.

### Integração licenciada (pendente)

Configure um fornecedor autorizado que exponha o contrato `MarketSnapshot` (`src/market/types.ts`):

```bash
MARKET_PROVIDER_URL="https://seu-fornecedor/caminho/{ticker}" MARKET_PROVIDER_TOKEN="..." MARKET_PROVIDER_NAME="Fornecedor X" npm run server
```

Com isso, o agendador roda todo dia às **9h (America/Sao_Paulo)** no servidor, sem depender de página aberta. Ele pula sábados, domingos e feriados da B3. Os dados recebidos são validados (sem fonte ou com valor inválido, são rejeitados). Em caso de falha, o último conjunto válido é mantido e o erro é registrado. A interface mostra o aviso de dados desatualizados e oferece o botão **Atualizar agora**. Os termos de uso do fornecedor precisam permitir esse uso; o projeto não faz scraping.

Feriados extraordinários (por exemplo, decretados pela B3) podem ser adicionados em `server/data/holidays-extra.json` (`["AAAA-MM-DD"]`).

## Publicação

- **Somente frontend (estático):** `npm run build` e publique `dist/` (Netlify, Vercel, GitHub Pages, S3+CloudFront). O modo de mercado funcionará só com entrada manual no navegador.
- **Com API e agendador:** rode `npm run server` em um processo persistente (VM, Fly.io, Railway, Render, container). Sirva `dist/` atrás de um proxy reverso que encaminhe `/api` para a porta `8787` (variável `PORT`). Use `MARKET_STORE_FILE` apontando para um volume persistente. O agendador precisa de um processo que fique sempre ativo. Em plataformas serverless, use um cron externo chamando `POST /api/market/MXRF11/refresh` às 9h BRT em dias úteis.

## Adicionar novos ativos

Inclua uma entrada em `src/assets/registry.ts` (ticker, nome, classe, valores de demonstração, fontes oficiais). O motor, o servidor (`/api/market/:ticker`) e os cenários já são independentes do ativo. A interface usa hoje o `DEFAULT_TICKER`; um seletor de ativo é a próxima etapa natural.

## Testes

- `npm test`: 40 testes unitários. Cobrem os casos obrigatórios 1 e 2, arredondamento half-up, quantização do número mágico, dividendo zero, inflação zero e negativa, aporte a partir do mês 2 e reajuste no mês 13, meta atingida e não atingida, exatamente 360 linhas, conservação do caixa em todos os períodos, real × nominal, estratégias sem dupla contagem, validações, recálculo após mudança de parâmetros, calendário B3/agendador e falha na atualização externa (HTTP 503 e erro de rede preservam o último dado válido).
- `npm run test:e2e`: 11 testes de interface. Verificam os cards 178 / R$ 1.582,42, as 360 linhas, a edição instantânea (caso 2 → 186 / R$ 1.636,80), o status personalizado, dividendo zero, parâmetro inválido, restauração, as abas, o CSV brasileiro, o fluxo do modo manual de mercado com falha de atualização sem sobrescrever o cenário personalizado, a persistência e a ausência de rolagem horizontal em desktop, tablet e celular.

## Limitações conhecidas

- Simplificações do modelo: períodos mensais sem datas reais de data-com/pagamento, sem custos, sem tributação e sem liquidez. A sobra de caixa não rende.
- Nenhuma fonte de cotação licenciada está integrada. A atualização automática só funciona depois que uma for configurada.
- O calendário B3 é uma aproximação (feriados nacionais + 24/12 e 31/12). Fechamentos extraordinários precisam ser cadastrados à mão.
- O "desatualizado" compara a data da cotação com o último pregão encerrado antes de hoje. Ainda não considera o pregão em andamento.
- Os links de fontes oficiais em `src/assets/registry.ts` devem ser conferidos periodicamente.
- Uma única tela por ativo (MXRF11). A arquitetura já comporta vários ativos.
