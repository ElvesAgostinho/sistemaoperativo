import { useEffect, useState, type CSSProperties } from 'react';
import { Video, AlertTriangle } from 'lucide-react';
import MeetingRoom from '../../components/reunioes/MeetingRoom';

interface ReuniaoPublica {
    titulo: string;
    room: string;
    data_hora: string;
    estado: string;
}

/**
 * Página pública (sem login) para convidados externos entrarem numa reunião pelo
 * próprio BusinessOS em vez de um link cru do Jitsi — é isso que permite que a
 * transcrição/ata capte também quem foi convidado, não só quem criou a reunião.
 * URL: /reuniao/:id
 */
export default function ReuniaoConvidado() {
    const id = window.location.pathname.split('/reuniao/')[1]?.split('/')[0];

    const [reuniao, setReuniao] = useState<ReuniaoPublica | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [nome, setNome] = useState('');
    const [entrou, setEntrou] = useState(false);

    useEffect(() => {
        if (!id) {
            setError('Link de reunião inválido.');
            setLoading(false);
            return;
        }
        fetch(`${import.meta.env.VITE_API_URL}/api/public/reuniao/${id}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setReuniao(data.reuniao);
                } else {
                    setError(data.error || 'Reunião não encontrada.');
                }
            })
            .catch(() => setError('Erro ao carregar os dados da reunião.'))
            .finally(() => setLoading(false));
    }, [id]);

    if (loading) {
        return (
            <div style={centerStyle}>
                <p style={{ color: '#6b7280' }}>A carregar reunião...</p>
            </div>
        );
    }

    if (error || !reuniao) {
        return (
            <div style={centerStyle}>
                <AlertTriangle size={40} color="#ef4444" style={{ marginBottom: '12px' }} />
                <h2 style={{ margin: '0 0 8px 0', color: '#111827' }}>Não foi possível entrar</h2>
                <p style={{ color: '#6b7280' }}>{error || 'Reunião não encontrada.'}</p>
            </div>
        );
    }

    if (reuniao.estado === 'Concluida') {
        return (
            <div style={centerStyle}>
                <Video size={40} color="#6b7280" style={{ marginBottom: '12px' }} />
                <h2 style={{ margin: '0 0 8px 0', color: '#111827' }}>{reuniao.titulo}</h2>
                <p style={{ color: '#6b7280' }}>Esta reunião já terminou.</p>
            </div>
        );
    }

    if (!entrou) {
        return (
            <div style={centerStyle}>
                <div style={{ width: '100%', maxWidth: '380px', background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '32px', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}>
                    <Video size={32} color="#3b82f6" style={{ marginBottom: '12px' }} />
                    <h2 style={{ margin: '0 0 4px 0', color: '#111827', fontSize: '20px' }}>{reuniao.titulo}</h2>
                    <p style={{ color: '#6b7280', fontSize: '13px', margin: '0 0 20px 0' }}>
                        {new Date(reuniao.data_hora).toLocaleString('pt-PT')}
                    </p>
                    <form onSubmit={e => { e.preventDefault(); if (nome.trim()) setEntrou(true); }}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#374151', marginBottom: '6px' }}>O seu nome</label>
                        <input
                            type="text"
                            value={nome}
                            onChange={e => setNome(e.target.value)}
                            required
                            placeholder="Como quer ser identificado na reunião"
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', marginBottom: '16px', boxSizing: 'border-box' }}
                        />
                        <button
                            type="submit"
                            disabled={!nome.trim()}
                            style={{ width: '100%', padding: '11px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '14px', cursor: nome.trim() ? 'pointer' : 'not-allowed', opacity: nome.trim() ? 1 : 0.6 }}
                        >
                            Entrar na Reunião
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div style={{ height: '100vh', width: '100vw' }}>
            <MeetingRoom
                reuniaoId={id!}
                roomName={reuniao.room}
                titulo={reuniao.titulo}
                participanteNome={nome}
                participanteTipo="convidado"
            />
        </div>
    );
}

const centerStyle: CSSProperties = {
    height: '100vh',
    width: '100vw',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    background: '#f9fafb',
    textAlign: 'center'
};
