import React, { useState } from 'react';
import {
  ArrowRight, Shield, Zap, Sparkles, CheckCircle2, Users, Briefcase, MessageCircle, PieChart,
  Share2, Bot, BookOpen, Mail, Video, Calculator, Play
} from 'lucide-react';
import { LogoMark } from './BrandLogo';
import '../styles/landing.css';

// Para adicionar o vídeo de um cliente: cole aqui o ID do vídeo do YouTube
// (a parte depois de "v=" no link, ex: https://www.youtube.com/watch?v=ABC123 -> "ABC123").
// Deixe vazio ("") para mostrar o espaço reservado.
const TESTIMONIAL_YOUTUBE_ID = '';

const PRICE_PER_MODULE_KZ = 25000;

// Módulos realmente vendáveis/ativáveis por empresa (exclui Definições e Painel SaaS Global,
// que são administrativos e não módulos cobrados à parte).
const modules = [
  { name: 'RH & Recrutamento', icon: Users },
  { name: 'Vendas (CRM)', icon: Briefcase },
  { name: 'Financeiro', icon: Calculator },
  { name: 'Autopilot (IA)', icon: Zap },
  { name: 'WhatsApp', icon: MessageCircle },
  { name: 'Relatórios', icon: PieChart },
  { name: 'Assistente IA', icon: Bot },
  { name: 'Conhecimento IA', icon: BookOpen },
  { name: 'Email', icon: Mail },
  { name: 'Reuniões IA', icon: Video },
  { name: 'Parcerias', icon: Share2 },
];

function formatKz(value: number) {
  return new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 0 }).format(value) + ' Kz';
}

export default function LandingPage({ onGoToApp }: { onGoToApp: () => void }) {
  const [formStatus, setFormStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  return (
    <div className="lp-root">
      {/* Nav */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <div className="lp-logo">
            <LogoMark size={32} />
            BusinessOS
          </div>
          <div className="lp-nav-links">
            <a href="#modulos">Módulos</a>
            <a href="#precos">Preços</a>
            <a href="#faq">FAQ</a>
          </div>
          <div className="lp-nav-actions">
            <button className="lp-btn lp-btn-primary" onClick={onGoToApp}>
              Aceder ao Sistema
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="lp-hero">
        <div className="lp-wrap lp-hero-inner">
          <div>
            <h1>O seu negócio.<br /><em>As suas regras.</em></h1>
            <p className="lp-hero-sub">
              Gestão completa da sua empresa — vendas, RH, financeiro e IA — num só sistema.
              Ative apenas os módulos de que precisa, hoje, e cresça sem trocar de sistema amanhã.
            </p>
            <ul className="lp-hero-check">
              <li><span className="lp-hero-check-dot"><CheckCircle2 size={13} /></span> Todos os módulos de gestão num único sistema</li>
              <li><span className="lp-hero-check-dot"><CheckCircle2 size={13} /></span> IA e automação em cada módulo</li>
              <li><span className="lp-hero-check-dot"><CheckCircle2 size={13} /></span> Sem fidelização — ative e cancele quando quiser</li>
              <li><span className="lp-hero-check-dot"><CheckCircle2 size={13} /></span> Feito para a realidade das empresas angolanas</li>
            </ul>
            <div className="lp-hero-actions">
              <a href="#precos" className="lp-btn lp-btn-primary">Ver Preços <ArrowRight size={15} /></a>
              <button className="lp-btn" onClick={onGoToApp}>Iniciar Sessão</button>
            </div>
          </div>

          <div className="lp-product-window">
            <div className="lp-pw-titlebar"><span className="lp-pw-dot" /><span className="lp-pw-dot" /><span className="lp-pw-dot" /></div>
            <div className="lp-pw-nav">
              <div className="lp-pw-brand">Financeiro</div>
              <div className="lp-pw-avatar" />
            </div>
            <div className="lp-pw-body">
              <div className="lp-pw-pillnav"><span className="on">Visão Geral</span><span>Transações</span><span>Salários</span></div>
              <div className="lp-pw-kpis">
                <div className="lp-pw-kpi"><div className="lp-pw-kpi-icon" /><b>4.520.000 Kz</b><span>Saldo Atual</span></div>
                <div className="lp-pw-kpi"><div className="lp-pw-kpi-icon" /><b>1.800.000 Kz</b><span>Entradas</span></div>
                <div className="lp-pw-kpi"><div className="lp-pw-kpi-icon" /><b>2</b><span>Pendentes</span></div>
              </div>
              <div className="lp-pw-chart">
                {[55, 35, 70, 40, 85, 50, 95, 48].map((h, i) => (
                  <div key={i} className={`lp-pw-bar${i % 2 ? ' gold' : ''}`} style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <div className="lp-trust-strip">
        <div className="lp-trust-inner">
          <div className="lp-trust-item"><b>{modules.length}</b><span>Módulos integrados</span></div>
          <div className="lp-trust-item"><b>100%</b><span>Modular — pague só o que usa</span></div>
          <div className="lp-trust-item"><b>0</b><span>Fidelização ou contratos longos</span></div>
          <div className="lp-trust-item"><b>AO</b><span>Feito para o mercado angolano</span></div>
        </div>
      </div>

      {/* Módulos */}
      <section className="lp-section" id="modulos">
        <div className="lp-wrap">
          <div className="lp-section-head">
            <p className="lp-eyebrow">Os seus módulos</p>
            <h2>Tudo o que a sua empresa precisa, num só lugar</h2>
            <p>Cada módulo funciona sozinho ou em conjunto — os dados fluem automaticamente entre eles.</p>
          </div>
          <div className="lp-modules-grid">
            {modules.map((mod, i) => (
              <div className="lp-module-card" key={i}>
                <div className="lp-mod-icon"><mod.icon size={19} /></div>
                <span>{mod.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Value props */}
      <section className="lp-props-section">
        <div className="lp-wrap" style={{ padding: '84px 32px' }}>
          <div className="lp-props-grid">
            <div className="lp-prop-card">
              <div className="lp-prop-icon"><Shield size={20} /></div>
              <h3>Seguro por desenho</h3>
              <p>Cada empresa só acede aos seus próprios dados. Isolamento total entre clientes, com autenticação e permissões por utilizador.</p>
            </div>
            <div className="lp-prop-card">
              <div className="lp-prop-icon"><Zap size={20} /></div>
              <h3>Autopilot</h3>
              <p>Construa fluxos de trabalho visuais — sem código — que respondem clientes, atualizam o CRM e enviam mensagens sozinhos.</p>
            </div>
            <div className="lp-prop-card">
              <div className="lp-prop-icon"><Sparkles size={20} /></div>
              <h3>IA em cada módulo</h3>
              <p>Da triagem de currículos à análise de relatórios, a inteligência artificial já está integrada — não é um extra.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Testemunho / vídeo */}
      <section className="lp-testi-section">
        <div className="lp-wrap lp-testi-inner" style={{ padding: '84px 32px' }}>
          <div className="lp-testi-video">
            {TESTIMONIAL_YOUTUBE_ID ? (
              <iframe
                src={`https://www.youtube.com/embed/${TESTIMONIAL_YOUTUBE_ID}`}
                title="Depoimento de cliente"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <div className="lp-testi-placeholder">
                <div className="lp-testi-play"><Play size={22} fill="white" /></div>
                <span style={{ fontSize: '13px', maxWidth: '26ch' }}>O vídeo de um cliente a falar sobre a plataforma aparecerá aqui.</span>
              </div>
            )}
          </div>
          <div>
            <p className="lp-eyebrow lp-testi-eyebrow">Na voz de quem usa</p>
            <p className="lp-testi-quote">
              {TESTIMONIAL_YOUTUBE_ID
                ? 'Veja como esta empresa usa o BusinessOS no dia a dia.'
                : 'Este espaço está pronto para o depoimento em vídeo de um cliente real — assim que tiver o vídeo, basta adicionar o link.'}
            </p>
          </div>
        </div>
      </section>

      {/* Preços */}
      <section className="lp-section" id="precos">
        <div className="lp-wrap">
          <div className="lp-section-head">
            <p className="lp-eyebrow">Preços</p>
            <h2>Simples: um preço, todos os módulos</h2>
            <p>Sem escalões, sem letras pequenas. Ative os módulos que precisa e pague só por esses.</p>
          </div>
          <div className="lp-pricing-card">
            <div className="lp-pricing-top">
              <div className="lp-pricing-price">{formatKz(PRICE_PER_MODULE_KZ)} <span>/ módulo / mês</span></div>
              <p className="lp-pricing-note">Exemplo: CRM + RH + WhatsApp = {formatKz(PRICE_PER_MODULE_KZ * 3)}/mês</p>
            </div>
            <div className="lp-pricing-body">
              <div className="lp-pricing-list">
                <div><CheckCircle2 size={15} /> Ative e cancele quando quiser</div>
                <div><CheckCircle2 size={15} /> Sem contrato de fidelização</div>
                <div><CheckCircle2 size={15} /> Suporte incluído</div>
                <div><CheckCircle2 size={15} /> Atualizações incluídas</div>
                <div><CheckCircle2 size={15} /> Dados isolados e seguros</div>
                <div><CheckCircle2 size={15} /> Acesso via Windows e Web</div>
              </div>
              <div className="lp-pricing-cta">
                <a href="#orcamento" className="lp-btn lp-btn-primary">Pedir Orçamento <ArrowRight size={15} /></a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Orçamento */}
      <section className="lp-quote-section" id="orcamento">
        <div className="lp-wrap lp-quote-inner" style={{ padding: '84px 32px' }}>
          <div className="lp-quote-text">
            <p className="lp-eyebrow">Orçamento</p>
            <h2>Pronto para escalar o seu negócio?</h2>
            <p>Diga-nos quais módulos lhe interessam e a nossa equipa entra em contacto com uma proposta à medida.</p>
          </div>
          <form
            className="lp-quote-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setFormStatus('submitting');
              const formData = new FormData(e.currentTarget);
              const json = JSON.stringify({
                access_key: "bfbba17a-77bb-47cc-94bc-d3d0e7e90879",
                subject: "Novo Pedido de Orçamento - BusinessOS",
                from_name: "BusinessOS Website",
                nome: formData.get('nome'),
                empresa: formData.get('empresa'),
                email: formData.get('email'),
                whatsapp: formData.get('whatsapp'),
                mensagem: formData.get('mensagem'),
              });

              try {
                const response = await fetch("https://api.web3forms.com/submit", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json"
                  },
                  body: json
                });

                if (response.ok) {
                  setFormStatus('success');
                  (e.target as HTMLFormElement).reset();
                  setTimeout(() => setFormStatus('idle'), 5000);
                } else {
                  setFormStatus('error');
                  setTimeout(() => setFormStatus('idle'), 5000);
                }
              } catch (error) {
                console.error("Fetch blocked by browser:", error);
                // Fallback robusto caso o AdBlocker do cliente bloqueie a API
                const subject = encodeURIComponent(`Pedido de Orçamento - BusinessOS (${formData.get('empresa')})`);
                const body = encodeURIComponent(`Nome: ${formData.get('nome')}\nEmpresa: ${formData.get('empresa')}\nEmail: ${formData.get('email')}\nWhatsApp: ${formData.get('whatsapp')}\n\nMensagem/Módulos de Interesse:\n${formData.get('mensagem')}`);
                window.location.href = `mailto:geral@topia.solutions?subject=${subject}&body=${body}`;

                setFormStatus('error');
                setTimeout(() => setFormStatus('idle'), 5000);
              }
            }}
          >
            <input type="text" name="nome" placeholder="O seu nome" required />
            <input type="text" name="empresa" placeholder="Nome da empresa" required />
            <input type="email" name="email" placeholder="O seu email profissional" required />
            <input type="tel" name="whatsapp" placeholder="O seu WhatsApp" required />
            <textarea name="mensagem" placeholder="Que módulos gostaria de ativar? (ex: CRM, IA, RH...)" rows={3} required />
            <button type="submit" className="lp-btn lp-btn-primary" disabled={formStatus === 'submitting' || formStatus === 'success'}>
              {formStatus === 'idle' && <>Solicitar Orçamento <ArrowRight size={15} /></>}
              {formStatus === 'submitting' && 'A enviar...'}
              {formStatus === 'success' && 'Pedido Enviado!'}
              {formStatus === 'error' && 'Erro. Tente novamente.'}
            </button>
          </form>
        </div>
      </section>

      {/* FAQ */}
      <section className="lp-section" id="faq">
        <div className="lp-wrap">
          <div className="lp-section-head">
            <p className="lp-eyebrow">FAQ</p>
            <h2>Perguntas frequentes</h2>
          </div>
          <div className="lp-faq-list">
            <details className="lp-faq-item">
              <summary>Tenho de pagar por todo o sistema se só usar um módulo?</summary>
              <p>Não. O BusinessOS foi construído para ser 100% modular. Pode ativar apenas o módulo de CRM, por exemplo, a {formatKz(PRICE_PER_MODULE_KZ)}/mês, e ativar os restantes quando precisar.</p>
            </details>
            <details className="lp-faq-item">
              <summary>Existem fidelizações ou contratos de longo prazo?</summary>
              <p>Não acreditamos em prender os nossos clientes. Pode subscrever ou cancelar módulos mensalmente com total liberdade.</p>
            </details>
            <details className="lp-faq-item">
              <summary>Como funciona a integração entre os módulos?</summary>
              <p>O ecossistema é nativo. Se ativar o CRM e o Email, por exemplo, um cliente inserido no CRM fica imediatamente pronto para receber emails, sem qualquer configuração da sua parte.</p>
            </details>
            <details className="lp-faq-item">
              <summary>O sistema funciona em telemóveis e tablets?</summary>
              <p>Sim. A nossa arquitetura moderna garante uma experiência rápida em qualquer dispositivo, permitindo-lhe gerir o seu negócio de qualquer lugar.</p>
            </details>
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-inner">
          <p>BusinessOS Angola &copy; 2026. Todos os direitos reservados.</p>
          <p>
            Desenvolvido pela <a href="https://www.topia.solutions" target="_blank" rel="noopener noreferrer">TOP IA</a>
            <span style={{ margin: '0 8px' }}>|</span>
            <a href="mailto:geral@topia.solutions">geral@topia.solutions</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
