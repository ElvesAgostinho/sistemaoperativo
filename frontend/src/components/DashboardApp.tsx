export default function DashboardApp() {
  return (
    <div className="ios-app-container">
      <h1 className="ios-large-title">Dashboard</h1>
      
      <div className="ios-widget-grid">
        {[
          { label: 'Vendas Totais', value: '€45k', change: '+12%', positive: true },
          { label: 'Novos Leads', value: '124', change: '+5%', positive: true },
          { label: 'Candidatos', value: '32', change: '-2%', positive: false },
          { label: 'Conversão', value: '18%', change: '+1%', positive: true }
        ].map(kpi => (
          <div key={kpi.label} className="ios-widget">
            <div className="ios-widget-title">{kpi.label}</div>
            <div className="ios-widget-value">{kpi.value}</div>
            <div className="ios-widget-sub" style={{ color: kpi.positive ? '#34C759' : '#FF3B30' }}>
              {kpi.change} este mês
            </div>
          </div>
        ))}
      </div>

      <div className="ios-section-header">Relatório do Copiloto</div>
      <div className="ios-list-group">
        <div className="ios-list-item" style={{ cursor: 'default' }}>
          <div>
            <div className="ios-list-item-title" style={{ fontSize: '15px', lineHeight: '1.5' }}>
              "Com base nos dados de vendas e RH deste mês, a empresa apresenta um crescimento sustentável. A equipa de Vendas (B2B) fechou 12% mais negócios. Recomendo focar no recrutamento de mais um perfil de Marketing para manter o pipeline de leads cheio."
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
