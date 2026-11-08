# Podemos exibir as cotações da B3 publicamente?

**Resposta curta: não sem autorização.** Exibir cotações da B3 para terceiros exige **contrato com a B3** (Contrato de Distribuição de Market Data). Com o contrato, os dados de fim de dia e os históricos podem ser distribuídos sem custo pelos dados. Além disso, a B3 **proíbe a coleta automatizada** da página de Cotações Históricas, mesmo para uso próprio.

Os documentos abaixo foram lidos diretamente nos sites da B3 em 08/11/2026. Isto não é parecer jurídico; para decisões comerciais, confirme com a B3 (produtos-marketdata@b3.com.br, endereço indicado no item 7.11 da política) e com um advogado.

## O que dizem os documentos (trechos literais)

### Página "Cotações históricas"

[b3.com.br › Cotações históricas](https://www.b3.com.br/pt_br/market-data-e-indices/servicos-de-dados/market-data/historico/mercado-a-vista/cotacoes-historicas/)

> "Os dados e informações disponibilizados nesta página são de propriedade exclusiva da B3 e destinam-se estritamente à consulta informativa, conforme Termos e Condições de Uso. Para manutenção da segurança do site e integridade dos dados e informações disponibilizados, **é expressamente vedada a coleta automatizada, inclusive por meio de ferramentas de inteligência artificial, para quaisquer finalidades, comerciais ou não, próprias ou de terceiros**."

### Termos de Uso do site da B3

[b3.com.br › Termos de uso](https://www.b3.com.br/pt_br/termos-de-uso-e-protecao-de-dados/termos-de-uso)

> "Os visitantes deste website podem utilizar os dados disponíveis nessas páginas para **uso exclusivamente pessoal** [...]. Não é permitida a reprodução, modificação, transmissão, comercialização, locação, publicação, distribuição ou quaisquer outras formas de utilização para fins comerciais de parte ou totalidade do conteúdo deste website [...] sem autorização prévia e por escrito da B3."

> "É vedada a distribuição, redistribuição, transferência, transmissão, retransmissão, [...] publicação, [...] ou disponibilização integral ou parcial da Difusão de Dados, exceto mediante prévio e expresso consentimento da B3."

### Política Comercial de Market Data

[Política Comercial de Market Data B3, versão 3.0.4, de 15/10/2024](https://b3.com.br/data/files/6D/77/9D/65/0AB929106EEC8429AC094EA8/Politica%20Comercial%20de%20Market%20Data%20v3.0.4.1.pdf)

**Capítulo 3** — quem pode distribuir:

> "Para ser um DISTRIBUIDOR ou REDISTRIBUIDOR é necessária a assinatura do CONTRATO DE DISTRIBUIÇÃO DE MARKET DATA B3."

**Item 7.9** — dados de fim de dia:

> "Os DADOS DE FIM DE DIA B3 obtidos através das Plataformas de MARKET DATA B3 [...] podem ser distribuídos **sem custo pelos DISTRIBUIDORES ou REDISTRIBUIDORES** sem a necessidade de autorização prévia da B3."

**Item 7.10** — dados históricos:

> "Os DADOS HISTÓRICOS B3 processados e disponibilizados através das Plataformas de MARKET DATA B3 [...] podem ser distribuídos sem custo pelos DISTRIBUIDORES ou REDISTRIBUIDORES sem a necessidade de autorização prévia da B3."

**Item 7.5** — divulgação com atraso em sites abertos:

> "Os REDISTRIBUIDORES podem contratar a DIVULGAÇÃO dos dados com ATRASO em websites abertos (sem controle de acesso) [...] por meio da assinatura do CONTRATO DE DISTRIBUIÇÃO."

## O que isso significa para o app

| Uso | Situação |
|---|---|
| Rodar no seu computador, para você, com arquivos COTAHIST **baixados por você** | Permitido (uso pessoal) — é o modo padrão do app. |
| Download **automático** do COTAHIST por script | **Proibido** pelo texto da página, para qualquer finalidade. Desligado por padrão; só liga com `B3_MARKET_DATA_AUTHORIZED=1`, para quem obtiver autorização da B3. |
| Publicar o app na internet mostrando cotações da B3 | **Exige contrato com a B3** (redistribuidor). Sem isso, o servidor bloqueia os dados da B3 quando exposto publicamente (HTTP 451) e continua servindo os dados abertos. |
| Dados de CVM, Banco Central, Tesouro, BIS, Fed e BCE | Dados abertos, com reutilização permitida mediante atribuição. A CVM usa a licença ODbL. |
| Fundos.NET (avisos de rendimentos) e Empresas Listadas (proventos de ações) | Sistemas operados pela B3. Não encontrei cláusula específica contra coleta nessas páginas, mas valem os Termos de Uso gerais (uso pessoal; publicação exige autorização). Os avisos de rendimento são documentos regulatórios públicos entregues pelos administradores. Confirme com a B3 antes de uso público. |

## Alternativas sem custo pesquisadas

- **brapi.dev:** declara no próprio FAQ que **não é** distribuidora licenciada da B3, e o plano gratuito não inclui dividendos ([FAQ](https://brapi.dev/faq/a-brapi-e-distribuidora-licenciada-da-b3)). Não resolve a licença.
- **CVM (DFP/ITR/FRE, licença ODbL):** tem dividendos e JCP contábeis e o número de ações, mas as companhias classificam de forma heterogênea. A Vale, por exemplo, registra os dividendos dentro de "Lucros Retidos" na DVA. Isso impede calcular o provento por ação de forma confiável e automática, e por isso essa fonte não foi usada como dado.

**Caminho para publicar:** solicitar à B3 o contrato de redistribuidor para dados de fim de dia e históricos (item 7.9/7.10, sem custo pelos dados), ou contratar um distribuidor licenciado e usar o provedor `MARKET_PROVIDER=http` do app.

## Modelo adotado: uso pessoal e familiar, sem comercialização

1. **Cada pessoa instala o app no próprio computador.** Nada é hospedado nem redistribuído pelo projeto.
2. **Cotações da B3:** cada usuário baixa o arquivo no site da B3, o que é consulta humana e uso pessoal, permitidos pelos Termos de Uso. O app só processa o arquivo, sem coleta automatizada.
3. **Cotações automáticas:** cada usuário usa a **própria** chave gratuita da brapi, a partir do próprio computador. Os [Termos de Uso da brapi](https://brapi.dev/terms-of-use), atualizados em 07/06/2025, concedem licença "limitada, não exclusiva, intransferível" e vedam "revender, redistribuir ou sublicenciar os Dados" e "criar um serviço de proxy, espelho [...] de acesso público". O modelo respeita os dois pontos: a chave não é compartilhada e não há proxy.
4. **Celular:** é o próprio usuário acessando o próprio computador na rede de casa, com senha.

Se um dia o app for oferecido a terceiros, comercialmente ou não, será preciso o contrato de distribuição com a B3, ou um distribuidor licenciado, e um plano da brapi (ou de outro fornecedor) que permita uso em produto.
