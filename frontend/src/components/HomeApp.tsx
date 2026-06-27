import React, { useState, useEffect } from 'react';

interface HomeAppProps {
  modules: { id: string, icon: string, name: string }[];
  onLaunch: (id: string) => void;
}

export default function HomeApp({ modules, onLaunch }: HomeAppProps) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);


  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date: Date) => {
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
    const formatted = date.toLocaleDateString('pt-PT', options);
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  };

  const getGreeting = (date: Date) => {
    const hours = date.getHours();
    if (hours < 12) return 'Bom dia';
    if (hours < 20) return 'Boa tarde';
    return 'Boa noite';
  };

  return (
    <div style={{ 
      width: '100%', 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center',
      padding: '80px 40px 140px 40px',
      overflowY: 'auto'
    }}>
      
      {/* Top Header: Clock & Greeting */}
      <div style={{ marginBottom: '50px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ 
          fontSize: '72px', 
          color: 'white', 
          fontWeight: 300, 
          letterSpacing: '-2px',
          textShadow: '0 4px 20px rgba(0,0,0,0.15)',
          lineHeight: '1'
        }}>
          {formatTime(time)}
        </div>
        <div style={{ 
          fontSize: '22px', 
          color: 'rgba(255, 255, 255, 0.9)', 
          fontWeight: 500,
          marginTop: '8px',
          textShadow: '0 2px 10px rgba(0,0,0,0.1)'
        }}>
          {formatDate(time)}
        </div>
        <div style={{ 
          fontSize: '34px', 
          color: 'white', 
          fontWeight: 600,
          marginTop: '24px',
          textShadow: '0 2px 15px rgba(0,0,0,0.1)'
        }}>
          {getGreeting(time)}, CEO.
        </div>
      </div>

      {/* Widgets Area */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
        gap: '24px',
        marginBottom: '60px',
        width: '100%',
        maxWidth: '1000px',
        justifyContent: 'center'
      }}>
        
        {/* Assistant Briefing Widget */}
        <div 
          onClick={() => onLaunch('assistente')}
          style={{
            background: 'rgba(255, 255, 255, 0.25)',
            backdropFilter: 'blur(30px)',
            borderRadius: '28px',
            padding: '24px',
            border: '1px solid rgba(255, 255, 255, 0.4)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
            cursor: 'pointer',
            transition: 'transform 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.transform = 'scale(0.98)'}
          onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ 
              background: 'var(--copilot-gradient)', 
              width: '40px', height: '40px', 
              borderRadius: '50%', 
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '20px', color: 'white'
            }}>✨</div>
            <span style={{ color: 'white', fontWeight: 600, fontSize: '18px' }}>Briefing do Assistente</span>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '16px', lineHeight: '1.5' }}>
            O BusinessOS processou <strong>2 novos contratos</strong> hoje de manhã. O fluxo de caixa atual encontra-se estável e sem anomalias.
          </p>
        </div>

        {/* KPI Mini Widget */}
        <div 
          onClick={() => onLaunch('dashboard')}
          style={{
            background: 'rgba(255, 255, 255, 0.25)',
            backdropFilter: 'blur(30px)',
            borderRadius: '28px',
            padding: '24px',
            border: '1px solid rgba(255, 255, 255, 0.4)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
            cursor: 'pointer',
            transition: 'transform 0.2s',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
          onMouseOver={(e) => e.currentTarget.style.transform = 'scale(0.98)'}
          onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600, fontSize: '16px' }}>Receita Mensal</span>
            <div style={{ background: 'rgba(52, 199, 89, 0.2)', color: '#34C759', padding: '4px 8px', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold' }}>
              +12.4%
            </div>
          </div>
          <div style={{ fontSize: '38px', color: 'white', fontWeight: 700, marginTop: '10px' }}>
            €14.250
          </div>
          <div style={{ height: '30px', marginTop: '15px', display: 'flex', alignItems: 'flex-end', gap: '4px' }}>
            {/* Fake Sparkline Graph */}
            {[40, 50, 35, 60, 45, 80, 100].map((h, i) => (
              <div key={i} style={{ flex: 1, background: 'rgba(255,255,255,0.5)', borderRadius: '2px', height: `${h}%` }}></div>
            ))}
          </div>
        </div>
      </div>


      
    </div>
  );
}
