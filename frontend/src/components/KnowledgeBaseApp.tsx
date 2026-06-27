import React, { useState, useEffect } from 'react';
import { BookOpen, Upload, Trash2, FileText, Search } from 'lucide-react';

interface KnowledgeFile {
  name: string;
  size: number;
  date: string;
}

export default function KnowledgeBaseApp() {
  const [files, setFiles] = useState<KnowledgeFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchFiles = async () => {
    try {
      const res = await fetch('http://127.0.0.1:3001/api/knowledge');
      const data = await res.json();
      if (data.success) {
        setFiles(data.files);
      }
    } catch (err) {
      console.error('Erro ao buscar base de conhecimento', err);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('http://127.0.0.1:3001/api/knowledge/upload', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        fetchFiles();
      } else {
        alert('Erro no upload.');
      }
    } catch (err) {
      alert('Erro na conexão de upload.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (filename: string) => {
    if (!window.confirm(`Apagar o documento "${filename}" da Base de Conhecimento?`)) return;
    try {
      const res = await fetch(`http://127.0.0.1:3001/api/knowledge/${filename}`, { method: 'DELETE' });
      if (res.ok) {
        fetchFiles();
      }
    } catch(err) {
      alert("Erro ao apagar");
    }
  };

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUpload(e.dataTransfer.files[0]);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
  };

  const filteredFiles = files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc', padding: '32px' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '28px', color: '#0f172a', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <BookOpen size={32} color="#0078D4" /> Base de Conhecimento IA
          </h1>
          <p style={{ color: '#475569', margin: 0, fontSize: '15px' }}>Documentos, Regras e Contexto para a Inteligência Artificial consultar.</p>
        </div>
        
        <div style={{ position: 'relative' }}>
          <Search size={18} color="#94a3b8" style={{ position: 'absolute', top: '10px', left: '12px' }} />
          <input 
            type="text" 
            placeholder="Pesquisar documento..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ padding: '10px 10px 10px 36px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '250px', outline: 'none' }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '24px', flex: 1, minHeight: 0 }}>
        
        {/* Lista de Documentos */}
        <div style={{ flex: 2, backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f1f5f9', fontWeight: 'bold', color: '#334155' }}>
            Ficheiros de Contexto ({filteredFiles.length})
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            {filteredFiles.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px 20px' }}>
                Nenhum documento encontrado.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                {filteredFiles.map(file => (
                  <div key={file.name} style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', display: 'flex', alignItems: 'flex-start', gap: '12px', backgroundColor: '#f8fafc' }}>
                    <div style={{ padding: '10px', backgroundColor: '#e0f2fe', borderRadius: '8px', color: '#0284c7' }}>
                      <FileText size={24} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '4px' }} title={file.name}>
                        {file.name}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        {formatSize(file.size)} • {new Date(file.date).toLocaleDateString()}
                      </div>
                    </div>
                    <button 
                      onClick={() => handleDelete(file.name)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#ef4444', opacity: 0.6 }}
                      onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
                      onMouseOut={(e) => e.currentTarget.style.opacity = '0.6'}
                      title="Apagar Ficheiro"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Zona de Upload */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div 
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            style={{ 
              backgroundColor: dragActive ? '#e0f2fe' : 'white',
              border: `2px dashed ${dragActive ? '#0284c7' : '#cbd5e1'}`, 
              borderRadius: '12px', 
              padding: '40px 24px', 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center',
              textAlign: 'center',
              transition: 'all 0.2s',
              cursor: 'pointer'
            }}
            onClick={() => document.getElementById('kb-file-upload')?.click()}
          >
            <input 
              id="kb-file-upload" 
              type="file" 
              style={{ display: 'none' }} 
              accept=".txt,.md,.pdf"
              onChange={(e) => e.target.files && handleUpload(e.target.files[0])}
            />
            <div style={{ backgroundColor: '#f1f5f9', padding: '16px', borderRadius: '50%', marginBottom: '16px' }}>
              <Upload size={32} color={dragActive ? '#0284c7' : '#64748b'} />
            </div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: '#334155' }}>Adicionar Conhecimento</h3>
            <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Arraste ficheiros .TXT, .MD ou .PDF ou clique para procurar.</p>
            {isUploading && <p style={{ color: '#0284c7', fontSize: '13px', marginTop: '12px', fontWeight: 'bold' }}>A enviar...</p>}
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', color: '#334155' }}>Dicas para a IA</h3>
            <ul style={{ paddingLeft: '20px', margin: 0, fontSize: '13px', color: '#475569', lineHeight: '1.6' }}>
              <li><strong>Ficheiros de Texto Puro (.txt)</strong> são mais rápidos de processar pela IA.</li>
              <li>A IA tem acesso a estes ficheiros através da ferramenta <code>pesquisar_base_conhecimento</code>.</li>
              <li>Pode criar um ficheiro "Regras_Empresa.txt" com políticas de devolução e FAQs.</li>
            </ul>
          </div>

        </div>
      </div>
    </div>
  );
}
