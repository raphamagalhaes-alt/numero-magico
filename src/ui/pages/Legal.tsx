import { useState } from 'react';
import { Scale } from 'lucide-react';
import { CONTACT_URL, SOURCES, TERMS_VERSION, eraseLocalData } from '../legal';
import { IS_WEB } from '../mode';
import { DISCLAIMER } from '../report';

const H = ({ id, children }: { id: string; children: React.ReactNode }) => <h2 id={id} className="mt-6 scroll-mt-24 text-base font-semibold text-mist-100">{children}</h2>;
const P = ({ children }: { children: React.ReactNode }) => <p className="mt-2 text-sm leading-relaxed text-mist-300">{children}</p>;
const Li = ({ children }: { children: React.ReactNode }) => <li className="mt-1 text-sm leading-relaxed text-mist-300">{children}</li>;

/** Termos de uso, aviso de riscos, política de privacidade (LGPD) e fontes/licenças. */
export function LegalPage() {
  const [erased, setErased] = useState(false);
  return (
    <article className="card max-w-4xl p-6" data-testid="legal-page">
      <h1 className="flex items-center gap-2 text-lg font-semibold"><Scale size={18} className="text-gold-400" aria-hidden />Termos de uso, riscos, privacidade e fontes</h1>
      <p className="mt-1 text-xs text-mist-500">Versão {TERMS_VERSION}. Ao usar o Número Mágico você concorda com estes termos.</p>
      <nav className="mt-3 flex flex-wrap gap-3 text-xs text-gold-300" aria-label="Seções">
        <a href="#termos" onClick={(e) => { e.preventDefault(); document.getElementById('termos')?.scrollIntoView(); }}>Termos de uso</a>
        <a href="#riscos" onClick={(e) => { e.preventDefault(); document.getElementById('riscos')?.scrollIntoView(); }}>Riscos e responsabilidade</a>
        <a href="#privacidade" onClick={(e) => { e.preventDefault(); document.getElementById('privacidade')?.scrollIntoView(); }}>Privacidade (LGPD)</a>
        <a href="#fontes" onClick={(e) => { e.preventDefault(); document.getElementById('fontes')?.scrollIntoView(); }}>Fontes e licenças</a>
      </nav>

      <H id="termos">1. Termos de uso</H>
      <ul className="list-disc pl-5">
        <Li><b>O que é:</b> uma ferramenta gratuita, de uso pessoal e familiar, sem fins comerciais, para <b>simulações educativas</b> e consulta a dados públicos. Não há cadastro, venda, publicidade, assinatura nem qualquer cobrança.</Li>
        <Li><b>O que não é:</b> não é corretora, consultoria, análise ou recomendação de investimentos (Resoluções CVM nº 19 e nº 20/2021), não executa ordens e não tem vínculo com B3, CVM, Banco Central, Tesouro Nacional, BIS, Fed NY, BCE, brapi, gestoras, administradoras ou emissores. Nomes e códigos de ativos pertencem aos respectivos titulares e aparecem apenas para identificação.</Li>
        <Li><b>Seus dados de mercado:</b> cotações da B3 só entram no app por você — arquivo baixado por você no site da B3 ou sua chave pessoal da brapi — e ficam apenas no seu aparelho, para seu uso pessoal. Não compartilhe arquivos da B3 nem sua chave com terceiros e respeite os termos dessas fontes.</Li>
        <Li><b>Uso adequado:</b> é proibido usar a ferramenta para redistribuir dados de terceiros, oferecer serviço a terceiros, burlar termos de fontes de dados ou praticar qualquer ato ilícito.</Li>
        <Li><b>Disponibilidade:</b> a ferramenta é fornecida "no estado em que se encontra", podendo mudar, ficar indisponível ou ser encerrada a qualquer momento, sem aviso.</Li>
        <Li><b>Lei aplicável:</b> legislação brasileira. Estes termos podem ser atualizados; a versão vigente fica sempre nesta página e mudanças relevantes pedem novo aceite.</Li>
      </ul>

      <H id="riscos">2. Riscos e limitação de responsabilidade</H>
      <P>{DISCLAIMER}</P>
      <ul className="list-disc pl-5">
        <Li>Investimentos em ações, FIIs, Fiagros, ETFs e BDRs são de <b>renda variável</b>: você pode perder parte ou todo o valor investido. Rentabilidade passada não garante rentabilidade futura. Renda fixa também tem riscos (crédito, mercado, liquidez).</Li>
        <Li>Os resultados são <b>projeções sob premissas</b> escolhidas por você (preço, rendimento, inflação, custos, impostos). Valores marcados como <i>estimados</i> são cálculos próprios, não dados oficiais. Dados de fontes públicas podem conter atrasos, falhas ou erros.</Li>
        <Li>Filtros, ordenações e comparações são <b>objetivos e neutros</b>; não indicam compra, venda ou manutenção de nenhum ativo e não consideram seu perfil (suitability).</Li>
        <Li>Confirme sempre preços, proventos, datas e regras tributárias nos canais oficiais (B3, CVM, administradores, sua corretora) e, se precisar de orientação personalizada, procure um profissional registrado na CVM ou certificado (consultor/planejador).</Li>
        <Li>Na máxima extensão permitida pela lei, os responsáveis por esta ferramenta gratuita <b>não se responsabilizam</b> por decisões de investimento, perdas, danos ou lucros cessantes decorrentes do uso das informações, de erros ou da indisponibilidade da ferramenta. As decisões são exclusivamente suas.</Li>
      </ul>

      <H id="privacidade">3. Política de privacidade (LGPD — Lei nº 13.709/2018)</H>
      <ul className="list-disc pl-5">
        <Li><b>Não coletamos dados pessoais.</b> Não há cadastro, login, cookies de rastreamento, analytics, anúncios nem servidor nosso recebendo suas informações.</Li>
        <Li><b>O que fica no seu aparelho:</b> metas, simulações, carteira, preferências{IS_WEB ? ', arquivos COTAHIST importados e sua chave da brapi' : ''} ficam no armazenamento local do navegador/app (localStorage/IndexedDB). Nós não temos acesso a eles. Você pode apagá-los a qualquer momento no botão abaixo ou limpando os dados do site no navegador.</Li>
        <Li><b>Terceiros envolvidos:</b> o site é hospedado no GitHub Pages (GitHub, Inc.), que pode registrar dados técnicos de acesso, como endereço IP, conforme a política de privacidade do GitHub. Se você configurar a brapi, seu aparelho se conecta diretamente à brapi, que recebe sua chave e seu IP conforme a política dela. Links externos (B3, CVM etc.) seguem as políticas desses sites.</Li>
        <Li><b>Seus direitos:</b> como não tratamos seus dados em servidores próprios, o controle é seu, diretamente no aparelho. Dúvidas ou solicitações podem ser enviadas pelo <a className="text-gold-300 underline" href={CONTACT_URL} target="_blank" rel="noreferrer">canal de contato</a> — ele é público: não escreva dados pessoais, financeiros ou chaves.</Li>
        <Li><b>Crianças e adolescentes:</b> a ferramenta é destinada a maiores de 18 anos; menores devem usá-la com acompanhamento dos responsáveis.</Li>
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="btn" data-testid="erase-data" onClick={async () => {
          if (!window.confirm('Apagar todas as suas simulações, carteira, chaves e cotações salvas neste aparelho? Isso não pode ser desfeito.')) return;
          await eraseLocalData(); setErased(true);
        }}>Apagar meus dados deste aparelho</button>
        {erased && <span className="text-xs text-gain-400" role="status">Dados apagados. Recarregue a página para recomeçar.</span>}
      </div>

      <H id="fontes">4. Fontes de dados e licenças</H>
      <P>Créditos exigidos pelas licenças. Nenhuma das instituições abaixo endossa, patrocina ou tem vínculo com esta ferramenta.</P>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-mist-500"><tr><th className="py-1 pr-3">Fonte</th><th className="py-1 pr-3">Uso</th><th className="py-1">Licença / condição</th></tr></thead>
          <tbody>
            {SOURCES.map((s) => (
              <tr key={s.name} className="border-t border-white/5 align-top text-mist-300">
                <td className="py-1.5 pr-3"><a className="text-gold-300 underline" href={s.url} target="_blank" rel="noreferrer">{s.name}</a></td>
                <td className="py-1.5 pr-3">{s.use}</td>
                <td className="py-1.5">{s.license}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <P>A base <code>open-data.json</code> publicada por este site é derivada de dados da CVM e do Tesouro Transparente e é disponibilizada sob a <a className="text-gold-300 underline" href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">Open Database License (ODbL) v1.0</a>. Source: BIS. Source: ECB statistics. Dados do Federal Reserve Bank of New York e do Banco Central do Brasil (SGS) com indicação da série e data no próprio app.</P>
    </article>
  );
}
