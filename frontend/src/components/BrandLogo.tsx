// Logo da marca BusinessOS — duas formas sobrepostas (módulos que se
// encaixam/conectam), num quadrado arredondado teal. Substitui o
// hexágono com gradiente azul/roxo genérico usado anteriormente.
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="11" fill="#017E84" />
      <rect x="8" y="8" width="15" height="15" rx="4.5" fill="#FFFFFF" />
      <rect x="18" y="18" width="15" height="15" rx="4.5" fill="#FFFFFF" fillOpacity="0.55" />
    </svg>
  );
}

export function LogoWithText({ size = 36, textColor = '#16211F' }: { size?: number; textColor?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <LogoMark size={size} />
      <span style={{ fontFamily: "'Manrope', 'Segoe UI', sans-serif", fontWeight: 800, fontSize: `${Math.round(size * 0.56)}px`, letterSpacing: '-0.01em', color: textColor }}>
        BusinessOS
      </span>
    </div>
  );
}
