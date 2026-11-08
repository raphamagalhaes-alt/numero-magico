# Como instalar e usar o Número Mágico

Guia para você e sua família. É uso pessoal: **cada pessoa instala no próprio computador.**

## 1. Instalar

### Windows

1. Baixe `NumeroMagico-2.0.0-windows-x64.zip` e descompacte (botão direito → *Extrair tudo*).
2. Abra a pasta e dê dois cliques em **NumeroMagico.exe**.
3. Na primeira vez, o Windows pode mostrar "O Windows protegeu o computador". Clique em **Mais informações → Executar assim mesmo**. O aviso aparece porque o app não tem certificado pago de editor; não é vírus.
4. Dica: clique com o botão direito no `NumeroMagico.exe` → *Enviar para* → *Área de trabalho (criar atalho)*.

### Mac

1. Descubra o processador do seu Mac: menu Apple → *Sobre este Mac*.
   - Se aparecer **Apple M1/M2/M3/M4**, baixe `NumeroMagico-2.0.0-mac-apple-silicon.zip`.
   - Se aparecer **Intel**, baixe `NumeroMagico-2.0.0-mac-intel.zip`.
2. Descompacte e arraste o app **Número Mágico** para a pasta *Aplicativos*.
3. Abra o **Terminal** (Aplicativos → Utilitários) e cole os dois comandos abaixo, um de cada vez. Eles liberam um app sem certificado pago da Apple:
   ```bash
   xattr -cr "/Applications/Número Mágico.app"
   ```
   ```bash
   codesign --force --deep --sign - "/Applications/Número Mágico.app"
   ```
4. Abra o app normalmente.

### Instaladores oficiais (opcional)

Para ter um instalador `.exe` (Windows) e `.dmg` (Mac):
1. Coloque o projeto no GitHub.
2. Vá em **Actions → Instaladores desktop → Run workflow**.
3. Baixe o resultado em *Artifacts*.

No Mac, o instalador gerado pelo GitHub já sai com a assinatura gratuita, sem precisar dos comandos do Terminal.

## 2. Cotações em dia, sem irregularidade

A B3 permite uso pessoal, mas **proíbe programas que baixem as cotações sozinhos** do site dela. Por isso há duas formas de manter as cotações atualizadas, e as duas são regulares.

### A) Arquivo da B3 (todos os ativos da bolsa)

1. Menu **Cotações → Abrir página de cotações da B3**.
2. Baixe o arquivo:
   - na primeira vez, o **anual** (traz o histórico de 12 meses);
   - depois, o **diário**, no fim de cada pregão.
3. Pronto. O app percebe o arquivo na pasta **Downloads** e importa sozinho.

Nos dias de pregão, às 20h45, o app mostra um lembrete. Clicar nele abre a página da B3.

### B) Sua chave gratuita da brapi (automático, para os ativos que você acompanha)

1. Crie uma conta grátis em https://brapi.dev e copie a sua chave.
2. No app: **Status dos dados → Cotações diárias automáticas → Salvar chave**.
3. O app passa a atualizar sozinho, às 9h e às 21h30, os ativos da sua carteira, das comparações e do simulador.

**Cada pessoa usa a própria chave.** A licença da brapi é pessoal e não pode ser compartilhada.

**Recomendado:** faça a forma A uma vez (arquivo anual) e use a forma B no dia a dia.

### Tudo o mais atualiza sozinho

Estes dados são públicos e oficiais, e se atualizam sem nenhuma ação sua:
- rendimentos de FIIs;
- dividendos e JCP de ações;
- Selic, CDI e IPCA;
- Tesouro Direto;
- juros do mundo.

## 3. Usar no celular

1. No computador: menu **Celular → Acessar pelo celular (QR code)** → *Ativar e reiniciar*.
2. Conecte o celular no **mesmo Wi-Fi** e leia o QR code com a câmera.
3. No navegador do celular, use **"Adicionar à tela inicial"**. O ícone do app fica no celular.

Cuidados:
- O computador precisa estar ligado, com o app aberto.
- O acesso é protegido por uma senha exclusiva, que já vai embutida no QR code.
- Use só na rede de casa. Para cortar o acesso, use **Celular → Gerar nova senha** ou **Desativar acesso**.

## 4. Cuidados importantes

- O app é uma **ferramenta de estudo e simulação**. As projeções supõem que preço e rendimento se mantêm, e isso não é garantido.
- Use as páginas **Testes de estresse**, **Faixas de resultado** e **Comparar com renda fixa** antes de decidir.
- Indicadores passados, como DY, variação e P/VP, não garantem resultado futuro.
- Diversificar e conhecer o risco de cada ativo é o que mais ajuda a não errar.
- Nada no app é recomendação de compra ou venda.
