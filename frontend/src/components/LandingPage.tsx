import React, { useState } from 'react';
import { ArrowRight, Sparkles, Shield, Zap, Database, Users, Briefcase, MessageCircle, PieChart, Share2, Bot, Monitor, BookOpen, Mail, Settings, Globe, Video, Calculator, CheckCircle2 } from 'lucide-react';
import '../styles/landing.css';
import heroImg from '../assets/hero_business_os_dark.png';

const LogoSVG = () => (
  <svg width="36" height="36" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="nav-logo-svg">
    <path d="M50 10 L90 30 L90 70 L50 90 L10 70 L10 30 Z" stroke="url(#logo-grad)" strokeWidth="8" fill="rgba(255,255,255,0.02)" />
    <path d="M50 10 L50 50 L90 30" stroke="url(#logo-grad)" strokeWidth="6" />
    <path d="M10 30 L50 50 L50 90" stroke="url(#logo-grad)" strokeWidth="6" />
    <circle cx="50" cy="50" r="12" fill="#fff" />
    <defs>
      <linearGradient id="logo-grad" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
        <stop stopColor="#3b82f6" />
        <stop offset="1" stopColor="#8b5cf6" />
      </linearGradient>
    </defs>
  </svg>
);

const modules = [
  { name: 'RH & Triagem', icon: Users, color: '#956488' },
  { name: 'Vendas CRM', icon: Briefcase, color: '#0097a7' },
  { name: 'Autopilot', icon: Zap, color: '#9b51e0' },
  { name: 'WhatsApp', icon: MessageCircle, color: '#27ae60' },
  { name: 'Relatórios', icon: PieChart, color: '#f39c12' },
  { name: 'Parcerias', icon: Share2, color: '#0f9d58' },
  { name: 'Assistente IA', icon: Bot, color: '#34495e' },
  { name: 'Meu PC', icon: Monitor, color: '#95a5a6' },
  { name: 'Conhecimento IA', icon: BookOpen, color: '#2d7ff9' },
  { name: 'Email', icon: Mail, color: '#1a3687' },
  { name: 'Definições', icon: Settings, color: '#4b5363' },
  { name: 'SaaS Global', icon: Globe, color: '#2c3338' },
  { name: 'Reuniões IA', icon: Video, color: '#d32f2f' },
  { name: 'Contabilidade', icon: Calculator, color: '#059669' }
];

export default function LandingPage({ onGoToApp }: { onGoToApp: () => void }) {
  const [formStatus, setFormStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  return (
    <div className="dark-theme-container">
      {/* Dynamic Backgrounds */}
      <div className="bg-glow spot-1"></div>
      <div className="bg-glow spot-2"></div>
      <div className="grid-overlay"></div>

      {/* Navbar */}
      <nav className="glass-nav">
        <div className="nav-content">
          <div className="nav-logo">
             <LogoSVG />
             <span style={{ marginLeft: '8px' }}>BusinessOS</span>
          </div>
          <div className="nav-links">
            <a href="#modulos">Os Seus Módulos</a>
            <a href="#orcamento">Orçamento</a>
            <a href="#faq">FAQ</a>
          </div>
          <button className="nav-cta" onClick={onGoToApp}>
            Aceder ao Sistema
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <h1 className="hero-title">
            O seu negócio. <span className="text-gradient">As suas regras.</span>
          </h1>
          <p className="hero-subtitle">
            Pague apenas pelo que usa. Ative módulos de Vendas, RH ou IA apenas quando precisar, à medida que a sua empresa cresce.
          </p>
          
          <ul className="hero-checklist">
            <li><span className="hero-checklist-icon"><CheckCircle2 size={16} /></span> Todos os Módulos de Gestão</li>
            <li><span className="hero-checklist-icon"><CheckCircle2 size={16} /></span> IA & Automação Avançada</li>
            <li><span className="hero-checklist-icon"><CheckCircle2 size={16} /></span> Colaboração em Equipa Real-time</li>
            <li><span className="hero-checklist-icon"><CheckCircle2 size={16} /></span> Relatórios Executivos</li>
          </ul>

          <div className="hero-actions">
            <button className="primary-btn" onClick={onGoToApp}>
              Iniciar Sessão <ArrowRight size={16} />
            </button>
          </div>
        </div>
        
        <div className="hero-image-container">
          <img src={heroImg} alt="BusinessOS Platform Interface Preview" />
        </div>
      </section>

      {/* Stunning Modules Grid */}
      <section className="modules-section" id="modulos">
         <p className="section-label">OS SEUS MÓDULOS</p>
         <div className="modules-grid">
           {modules.map((mod, index) => (
              <div className="module-card" key={index} style={{ '--mod-index': index, '--total-mods': modules.length } as any}>
                <div className="mod-glow" style={{ background: mod.color }}></div>
                <div className="mod-content">
                  <div className="mod-icon-wrapper" style={{ backgroundColor: mod.color }}>
                    <mod.icon size={24} strokeWidth={2.5} color="#ffffff" />
                  </div>
                  <span className="mod-name">{mod.name}</span>
                </div>
              </div>
           ))}
         </div>
      </section>

      {/* Feature Highlights */}
      <section className="features-section">
        <div className="feature-box">
           <div className="feat-icon-wrap"><Shield size={24} /></div>
           <h3>Legal & Seguro</h3>
           <p>Conformidade total com a LGT de Angola e encriptação militar.</p>
        </div>
        <div className="feature-box">
           <div className="feat-icon-wrap"><Zap size={24} /></div>
           <h3>Autopilot</h3>
           <p>Workflows desenhados em n8n que automatizam tarefas invisíveis.</p>
        </div>
        <div className="feature-box">
           <div className="feat-icon-wrap"><Database size={24} /></div>
           <h3>Router IA</h3>
           <p>Privacidade absoluta com processamento local de dados sensíveis.</p>
        </div>
      </section>

      {/* Quote/Contact Section */}
      <section className="quote-section" id="orcamento">
        <div className="quote-container">
          <div className="quote-text">
            <h2>Pronto para escalar o seu negócio?</h2>
            <p>Peça um orçamento à medida. Diga-nos quais os módulos que lhe interessam e a nossa equipa entrará em contacto com uma proposta personalizada.</p>
          </div>
          <form 
            className="quote-form"
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
            <div className="form-group">
              <input type="text" name="nome" placeholder="O seu nome" required />
            </div>
            <div className="form-group">
              <input type="text" name="empresa" placeholder="Nome da empresa" required />
            </div>
            <div className="form-group">
              <input type="email" name="email" placeholder="O seu email profissional" required />
            </div>
            <div className="form-group">
              <input type="tel" name="whatsapp" placeholder="O seu WhatsApp" required />
            </div>
            <div className="form-group">
              <textarea name="mensagem" placeholder="Que módulos gostaria de ativar? (ex: CRM, IA, RH...)" rows={4} required></textarea>
            </div>
            <button type="submit" className="primary-btn quote-btn" disabled={formStatus === 'submitting' || formStatus === 'success'}>
              {formStatus === 'idle' && <>Solicitar Orçamento <ArrowRight size={16} /></>}
              {formStatus === 'submitting' && 'A enviar...'}
              {formStatus === 'success' && 'Pedido Enviado! ✅'}
              {formStatus === 'error' && 'Erro. Tente novamente.'}
            </button>
          </form>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="faq-section" id="faq">
        <h2 className="section-title">Perguntas Frequentes</h2>
        <div className="faq-list">
          <details className="faq-item">
            <summary className="faq-question">Tenho de pagar por todo o sistema se só usar um módulo?</summary>
            <div className="faq-answer">
              Não. O BusinessOS foi construído para ser 100% modular. Pode ativar apenas o módulo de CRM, por exemplo, e pagará apenas por ele. Se a sua empresa crescer, pode ativar os restantes à distância de um clique.
            </div>
          </details>
          <details className="faq-item">
            <summary className="faq-question">Existem fidelizações ou contratos de longo prazo?</summary>
            <div className="faq-answer">
              Não acreditamos em prender os nossos clientes. Pode subscrever ou cancelar módulos mensalmente com total liberdade. As suas regras, o seu orçamento.
            </div>
          </details>
          <details className="faq-item">
            <summary className="faq-question">Como funciona a integração entre os módulos?</summary>
            <div className="faq-answer">
              O ecossistema é nativo. Isso significa que, se ativar o CRM e o módulo de Email, um cliente inserido no CRM fica imediatamente pronto para receber campanhas automáticas de Email, sem qualquer configuração da sua parte. A comunicação é imediata e fluída.
            </div>
          </details>
          <details className="faq-item">
            <summary className="faq-question">O sistema funciona em telemóveis e tablets?</summary>
            <div className="faq-answer">
              Sim. A nossa arquitetura moderna garante uma experiência luxuosa e ultrarrápida em qualquer dispositivo, permitindo-lhe gerir o seu negócio de qualquer lugar.
            </div>
          </details>
        </div>
      </section>

      <footer className="dark-footer">
         <p>BusinessOS Angola &copy; 2026. Todos os direitos reservados.</p>
         <p style={{ marginTop: '12px', fontSize: '13px', opacity: 0.7 }}>
           Desenvolvido pela <a href="https://www.topia.solutions" target="_blank" rel="noopener noreferrer" style={{ color: '#fff', textDecoration: 'none', fontWeight: 600 }}>TOP IA</a> 
           <span style={{ margin: '0 8px' }}>|</span> 
           <a href="mailto:geral@topia.solutions" style={{ color: '#fff', textDecoration: 'none' }}>geral@topia.solutions</a>
         </p>
      </footer>
    </div>
  );
}
