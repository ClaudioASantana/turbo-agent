import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Loader2, Mic } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

type Message = {
  id: string;
  role: 'user' | 'agent' | 'system' | 'tool';
  content: string;
};

const Orb = ({ status }: { status: 'idle' | 'processing' | 'paused' | 'recording' }) => {
  let colors = "from-indigo-400 to-blue-500";
  let animate = "animate-pulse";
  
  if (status === 'processing') {
     colors = "from-indigo-400 to-purple-600";
     animate = "animate-ping";
  } else if (status === 'paused') {
     colors = "from-amber-400 to-orange-500";
     animate = "animate-bounce";
  } else if (status === 'recording') {
     colors = "from-red-400 to-rose-600";
     animate = "animate-pulse";
  }

  return (
    <div className={`w-3 h-3 rounded-full bg-gradient-to-r ${colors} shadow-[0_0_15px_rgba(99,102,241,0.6)] ${animate}`} />
  );
};

export default function App() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [workspacePath, setWorkspacePath] = useState<string>('');
  const [activeFile, setActiveFile] = useState<string>('');
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data && data.type === 'CONTEXT_UPDATE' && data.payload) {
        if (data.payload.workspacePath) {
          setWorkspacePath(data.payload.workspacePath);
        }
        if (data.payload.fileName) {
          setActiveFile(data.payload.fileName);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    const eventSource = new EventSource('http://localhost:3333/api/stream');

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'token') {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'agent') {
            return [...prev.slice(0, -1), { ...last, content: last.content + data.text }];
          }
          return [...prev, { id: Date.now().toString(), role: 'agent', content: data.text }];
        });
      } else if (data.type === 'system') {
        setMessages((prev) => [...prev, { id: Date.now().toString(), role: 'system', content: data.text }]);
      } else if (data.type === 'tool_start') {
        setCurrentTool(data.toolName);
      } else if (data.type === 'tool_end') {
        setCurrentTool(null);
      } else if (data.type === 'open_artifact') {
        window.dispatchEvent(new CustomEvent('vscode-command', { 
          detail: { type: 'OPEN_FILE', filePath: data.filePath } 
        }));
      } else if (data.type === 'open_diff') {
        window.dispatchEvent(new CustomEvent('vscode-command', { 
          detail: { type: 'OPEN_DIFF', originalPath: data.originalPath, proposedPath: data.proposedPath } 
        }));
      } else if (data.type === 'pause') {
        setIsProcessing(false);
        setIsPaused(true);
      } else if (data.type === 'end' || data.type === 'error') {
        setIsProcessing(false);
        setIsPaused(false);
        setCurrentTool(null);
        if (data.type === 'error') {
          setMessages((prev) => [...prev, { id: Date.now().toString(), role: 'system', content: `❌ Error: ${data.error}` }]);
        }
      }
    };

    return () => eventSource.close();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentTool]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing || isPaused) return;

    handleSend();
  };

  const handleApprove = async (approved: boolean) => {
    setIsPaused(false);
    setIsProcessing(true);
    setMessages((prev) => [...prev, { id: Date.now().toString(), role: 'user', content: approved ? '✅ Spec Aprovada' : '❌ Plano Abortado' }]);
    
    try {
      await fetch('http://localhost:3333/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved })
      });
    } catch (error) {
      console.error('Failed to approve:', error);
    }
  };

  const handleSend = async () => {
    if (!input.trim() && !isPaused) return;

    if (isPaused) {
      handleApprove(true);
      return;
    }

    const currentInput = input;
    setInput('');
    setMessages((prev) => [...prev, { id: Date.now().toString(), role: 'user', content: currentInput }]);
    setIsProcessing(true);

    try {
      await fetch('http://localhost:3333/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: currentInput,
          context: {
             workspacePath,
             activeFile
          }
        })
      });
    } catch (error) {
      console.error('Failed to send:', error);
      setIsProcessing(false);
    }
  };

  const handleCancel = async () => {
    try {
      await fetch('http://localhost:3333/api/cancel', { method: 'POST' });
    } catch (error) {
      console.error('Failed to cancel:', error);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio', audioBlob, 'voice.webm');

        try {
          setIsProcessing(true);
          const response = await fetch('http://localhost:3333/api/transcribe', {
            method: 'POST',
            body: formData,
          });
          const data = await response.json();
          if (data.text) {
            setInput(prev => prev + (prev ? ' ' : '') + data.text);
          }
        } catch (err) {
          console.error("Transcription failed", err);
        } finally {
          setIsProcessing(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone error", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  const [tasks, setTasks] = useState<any[]>([]);
  const [isTasksPanelOpen, setIsTasksPanelOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskLogs, setTaskLogs] = useState<string[]>([]);

  const [isAuditPanelOpen, setIsAuditPanelOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditStats, setAuditStats] = useState<any>(null);

  const [isAgentsPanelOpen, setIsAgentsPanelOpen] = useState(false);
  const [customAgents, setCustomAgents] = useState<any[]>([]);

  useEffect(() => {
    if (isAgentsPanelOpen) {
      const fetchAgents = async () => {
        try {
          const res = await fetch('http://localhost:3333/api/agents');
          const data = await res.json();
          setCustomAgents(data || []);
        } catch (e) {
          console.error("Failed to fetch agents", e);
        }
      };
      fetchAgents();
    }
  }, [isAgentsPanelOpen]);  useEffect(() => {
    if (isAuditPanelOpen) {
      const fetchAudit = async () => {
        try {
          const res = await fetch('http://localhost:3333/api/audit');
          const data = await res.json();
          setAuditLogs(data.logs || []);
          setAuditStats(data.stats || null);
        } catch (e) {
          console.error("Failed to fetch audit data", e);
        }
      };
      fetchAudit();
      const interval = setInterval(fetchAudit, 5000); // Polling 5s
      return () => clearInterval(interval);
    }
  }, [isAuditPanelOpen]);

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const res = await fetch('http://localhost:3333/api/tasks');
        const data = await res.json();
        setTasks(data.tasks || []);
      } catch (e) {
        // ignore
      }
    };
    fetchTasks();
    const interval = setInterval(fetchTasks, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isTasksPanelOpen && selectedTaskId) {
      const fetchLogs = async () => {
        try {
          const res = await fetch(`http://localhost:3333/api/tasks/${selectedTaskId}/logs`);
          const data = await res.json();
          setTaskLogs(data.logs || []);
        } catch (e) {
          // ignore
        }
      };
      fetchLogs();
      const interval = setInterval(fetchLogs, 2000);
      return () => clearInterval(interval);
    }
  }, [isTasksPanelOpen, selectedTaskId]);

  const handleKillTask = async (id: string) => {
    try {
      await fetch(`http://localhost:3333/api/tasks/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex flex-col h-screen font-sans relative bg-[var(--premium-bg)] text-gray-200 overflow-hidden">
      
      {/* Top Bar with Orb */}
      <div className="absolute top-4 left-4 z-50 flex items-center space-x-3 glass-panel px-4 py-2 rounded-full">
         <Orb status={isRecording ? 'recording' : isPaused ? 'paused' : isProcessing ? 'processing' : 'idle'} />
         <span className="text-[10px] font-bold tracking-widest uppercase opacity-80 text-indigo-100">Turbo Agent</span>
      </div>

      {/* Top Buttons: Tasks & Audit & Agents */}
      <div className="absolute top-4 right-4 z-50 flex space-x-3">
         <button 
           onClick={() => setIsAgentsPanelOpen(true)}
           className="px-4 py-1.5 text-xs font-medium rounded-full glass-panel hover:bg-indigo-500/20 transition-colors shadow-lg border border-indigo-500/30 text-indigo-200"
         >
           🧪 Lab de Agentes
         </button>
         {tasks.length > 0 && (
           <button 
             onClick={() => setIsTasksPanelOpen(!isTasksPanelOpen)}
             className="px-3 py-1.5 text-xs font-medium rounded-full glass-panel hover:bg-white/10 transition-colors flex items-center space-x-1"
           >
             <span>⚙️ {tasks.filter(t => t.status === 'running').length}</span>
           </button>
         )}
         <button 
           onClick={() => setIsAuditPanelOpen(true)}
           className="px-4 py-1.5 text-xs font-medium rounded-full glass-panel hover:bg-white/10 transition-colors shadow-lg"
         >
           📊 Auditoria
         </button>
      </div>

      {/* Agents Dashboard Overlay */}
      <AnimatePresence>
      {isAgentsPanelOpen && (
        <motion.div 
           initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
           className="absolute inset-8 glass-panel shadow-2xl rounded-2xl z-[70] flex flex-col border border-indigo-500/20"
        >
           <div className="flex justify-between items-center p-6 border-b border-white/10">
              <h2 className="text-xl font-bold bg-gradient-to-r from-indigo-300 to-purple-400 bg-clip-text text-transparent">🧪 Laboratório de Sub-Agentes</h2>
              <button onClick={() => setIsAgentsPanelOpen(false)} className="text-xl opacity-50 hover:opacity-100 transition-opacity">✕</button>
           </div>
           
           <div className="flex flex-1 overflow-hidden">
             {/* Lista de Agentes */}
             <div className="w-1/3 border-r border-white/10 p-6 overflow-y-auto">
                <h3 className="text-sm font-bold opacity-70 mb-4 uppercase tracking-wider">Seus Agentes</h3>
                <div className="space-y-3">
                   {customAgents.length === 0 && <p className="text-xs opacity-50">Nenhum agente customizado. Crie um ao lado!</p>}
                   {customAgents.map(a => (
                     <div key={a.id} className="bg-black/30 p-4 rounded-xl border border-white/5 relative group">
                        <h4 className="font-bold text-indigo-300">{a.name}</h4>
                        <p className="text-xs opacity-70 mt-1">{a.description}</p>
                        <button 
                           onClick={async () => {
                             await fetch(`http://localhost:3333/api/agents/${a.id}`, { method: 'DELETE' });
                             setCustomAgents(prev => prev.filter(x => x.id !== a.id));
                           }}
                           className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-rose-400 hover:text-rose-300 transition-opacity"
                        >
                           Excluir
                        </button>
                     </div>
                   ))}
                </div>
             </div>
             
             {/* Criador de Agentes */}
             <div className="w-2/3 p-6 overflow-y-auto">
                <h3 className="text-sm font-bold opacity-70 mb-4 uppercase tracking-wider">🧬 Criar Novo Agente</h3>
                <form className="space-y-4" onSubmit={async (e) => {
                   e.preventDefault();
                   const form = e.target as HTMLFormElement;
                   const newAgent = {
                     name: (form.elements.namedItem('name') as HTMLInputElement).value,
                     description: (form.elements.namedItem('description') as HTMLInputElement).value,
                     systemPrompt: (form.elements.namedItem('prompt') as HTMLTextAreaElement).value,
                     allowedTools: Array.from(form.querySelectorAll('input[type="checkbox"]:checked')).map(cb => (cb as HTMLInputElement).value)
                   };
                   try {
                      const res = await fetch('http://localhost:3333/api/agents', {
                         method: 'POST',
                         headers: { 'Content-Type': 'application/json' },
                         body: JSON.stringify(newAgent)
                      });
                      const data = await res.json();
                      setCustomAgents(prev => [...prev.filter(a => a.id !== data.agent.id), data.agent]);
                      form.reset();
                   } catch (err) {
                      console.error(err);
                   }
                }}>
                   <div className="grid grid-cols-2 gap-4">
                     <div>
                       <label className="block text-xs font-semibold opacity-70 mb-1">Nome do Persona (Sem espaços)</label>
                       <input name="name" required placeholder="UX_Reviewer" className="w-full bg-black/30 border border-white/10 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                     </div>
                     <div>
                       <label className="block text-xs font-semibold opacity-70 mb-1">Descrição Curta (Para o Arquiteto saber)</label>
                       <input name="description" required placeholder="Revisa o design usando Tailwind" className="w-full bg-black/30 border border-white/10 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                     </div>
                   </div>
                   
                   <div>
                     <label className="block text-xs font-semibold opacity-70 mb-1">System Prompt (A alma do agente)</label>
                     <textarea name="prompt" required rows={4} placeholder="Você é um especialista frontend. Avalie o arquivo CSS fornecido..." className="w-full bg-black/30 border border-white/10 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"></textarea>
                   </div>
                   
                   <div>
                     <label className="block text-xs font-semibold opacity-70 mb-2">Ferramentas Permitidas</label>
                     <div className="grid grid-cols-3 gap-2">
                        {['read_file', 'write_file', 'run_command', 'web_search', 'semantic_search', 'invoke_browser_subagent'].map(t => (
                           <label key={t} className="flex items-center space-x-2 text-xs bg-black/20 p-2 rounded border border-white/5 cursor-pointer hover:bg-black/40">
                              <input type="checkbox" value={t} className="rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-indigo-500" />
                              <span className="font-mono text-[10px]">{t}</span>
                           </label>
                        ))}
                     </div>
                   </div>
                   
                   <div className="pt-4">
                      <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-6 rounded-lg transition-colors shadow-[0_0_15px_rgba(79,70,229,0.4)]">
                         Registrar no Cérebro Central
                      </button>
                   </div>
                </form>
             </div>
           </div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Audit Dashboard Overlay */}
      <AnimatePresence>
      {isAuditPanelOpen && (
        <motion.div 
           initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
           className="absolute inset-8 glass-panel shadow-2xl rounded-2xl z-[60] flex flex-col border border-white/10"
        >
           <div className="flex justify-between items-center p-6 border-b border-white/10">
              <h2 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">📊 Painel de Auditoria</h2>
              <button onClick={() => setIsAuditPanelOpen(false)} className="text-xl opacity-50 hover:opacity-100 transition-opacity">✕</button>
           </div>
           
           <div className="p-6 grid grid-cols-3 gap-6 border-b border-white/10">
              <div className="bg-black/30 p-4 rounded-xl text-center border border-white/5">
                 <p className="text-xs opacity-50 uppercase font-semibold tracking-wider mb-1">Total de Ações</p>
                 <p className="text-3xl font-mono">{auditStats?.total || 0}</p>
              </div>
              <div className="bg-black/30 p-4 rounded-xl text-center border border-white/5">
                 <p className="text-xs opacity-50 uppercase font-semibold tracking-wider mb-1">Ferramentas Usadas</p>
                 <p className="text-3xl font-mono text-indigo-400">{auditStats?.byType?.tool_call || 0}</p>
              </div>
              <div className="bg-black/30 p-4 rounded-xl text-center border border-white/5">
                 <p className="text-xs opacity-50 uppercase font-semibold tracking-wider mb-1">Erros Corrigidos</p>
                 <p className="text-3xl font-mono text-rose-400">{auditStats?.byType?.error || 0}</p>
              </div>
           </div>

           <div className="flex-1 overflow-y-auto p-6">
              <table className="w-full text-left text-sm border-collapse">
                 <thead>
                    <tr className="border-b border-white/10 opacity-60 text-xs uppercase tracking-wider">
                       <th className="pb-3 font-semibold">ID</th>
                       <th className="pb-3 font-semibold">Data/Hora</th>
                       <th className="pb-3 font-semibold">Tipo</th>
                       <th className="pb-3 font-semibold">Ferramenta</th>
                       <th className="pb-3 font-semibold">Detalhes</th>
                    </tr>
                 </thead>
                 <tbody>
                    {auditLogs.length === 0 && <tr><td colSpan={5} className="text-center p-8 opacity-40">Nenhum log encontrado.</td></tr>}
                    {auditLogs.map(log => (
                       <tr key={log.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="py-3 font-mono text-xs opacity-60">{log.id}</td>
                          <td className="py-3 text-xs">{new Date(log.timestamp).toLocaleTimeString()}</td>
                          <td className="py-3">
                             <span className={`px-2 py-1 text-[10px] uppercase font-bold rounded-full ${log.type === 'error' ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'}`}>{log.type}</span>
                          </td>
                          <td className="py-3 font-mono text-indigo-300 text-xs">{log.tool || '-'}</td>
                          <td className="py-3 truncate max-w-xs text-xs opacity-80">{log.result || JSON.stringify(log.args) || log.message || '-'}</td>
                       </tr>
                    ))}
                 </tbody>
              </table>
           </div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Tasks Panel Overlay */}
      <AnimatePresence>
      {isTasksPanelOpen && (
        <motion.div 
           initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
           className="absolute top-16 right-4 w-96 glass-panel border border-white/10 shadow-2xl rounded-2xl z-50 flex flex-col max-h-[80vh]"
        >
           <div className="flex justify-between items-center p-4 border-b border-white/10">
              <h3 className="font-bold text-sm">Background Tasks</h3>
              <button onClick={() => setIsTasksPanelOpen(false)} className="text-xs opacity-50 hover:opacity-100">✕</button>
           </div>
           <div className="overflow-y-auto flex-1 p-4 space-y-3">
              {tasks.length === 0 && <p className="text-xs opacity-50 text-center py-6">No active tasks.</p>}
              {tasks.map(t => (
                <div key={t.id} className="bg-black/20 border border-white/5 rounded-xl p-3 text-xs">
                   <div className="flex justify-between items-center mb-2">
                      <span className="font-mono text-[10px] truncate w-3/4 opacity-80">{t.command}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] uppercase font-bold ${t.status === 'running' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                         {t.status}
                      </span>
                   </div>
                   <div className="flex justify-between mt-3">
                      <button 
                         onClick={() => setSelectedTaskId(t.id === selectedTaskId ? null : t.id)}
                         className="text-indigo-400 hover:text-indigo-300 font-medium"
                      >
                         {t.id === selectedTaskId ? 'Hide Logs' : 'View Logs'}
                      </button>
                      {t.status === 'running' && (
                        <button 
                           onClick={() => handleKillTask(t.id)}
                           className="text-rose-400 hover:text-rose-300 font-medium"
                        >
                           Kill
                        </button>
                      )}
                   </div>
                   {t.id === selectedTaskId && (
                      <div className="mt-3 bg-black/60 p-3 rounded-lg max-h-40 overflow-y-auto font-mono text-[10px] text-gray-300 leading-relaxed border border-white/5">
                         {taskLogs.map((log, i) => <div key={i}>{log}</div>)}
                      </div>
                   )}
                </div>
              ))}
           </div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto px-4 lg:px-20 py-8 pt-20 space-y-6">
        {messages.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center h-full opacity-70">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 mb-6 shadow-[0_0_40px_rgba(99,102,241,0.5)] animate-pulse flex items-center justify-center">
               <span className="text-3xl">✨</span>
            </div>
            <p className="text-center font-bold text-2xl mb-2 bg-gradient-to-r from-indigo-300 to-purple-300 bg-clip-text text-transparent">Turbo Agent Premium</p>
            <p className="text-center text-sm font-medium tracking-wide">Como posso acelerar seu código hoje?</p>
          </motion.div>
        ) : (
          <AnimatePresence>
          {messages.map((msg) => (
            <motion.div 
               key={msg.id} 
               initial={{ opacity: 0, y: 15, scale: 0.98 }}
               animate={{ opacity: 1, y: 0, scale: 1 }}
               className={`flex flex-col mb-8 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center mb-1.5 text-[10px] uppercase tracking-widest font-bold opacity-40 px-2">
                {msg.role === 'user' ? 'Você' : msg.role === 'agent' ? 'Turbo Agent' : 'System'}
              </div>
              <div className={`leading-relaxed p-5 rounded-2xl max-w-[85%] shadow-xl ${msg.role === 'user' ? 'bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-tr-sm border border-indigo-500/30' : 'glass-panel rounded-tl-sm'}`}>
                {msg.role === 'agent' ? (
                  <div className="prose prose-invert max-w-none prose-sm prose-pre:bg-transparent prose-pre:p-0">
                    <ReactMarkdown
                      components={{
                        code({node, inline, className, children, ...props}: any) {
                          const match = /language-(\w+)/.exec(className || '')
                          return !inline && match ? (
                            <div className="relative group mt-4 mb-4 rounded-xl overflow-hidden border border-white/10 shadow-2xl">
                              <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                <button onClick={() => navigator.clipboard.writeText(String(children))} className="bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-xs font-medium backdrop-blur-md transition-colors border border-white/10">Copiar</button>
                              </div>
                              <SyntaxHighlighter
                                {...props}
                                children={String(children).replace(/\n$/, '')}
                                style={vscDarkPlus}
                                language={match[1]}
                                PreTag="div"
                                customStyle={{ margin: 0, background: 'rgba(0,0,0,0.5)', padding: '1.5rem 1.25rem', fontSize: '13px' }}
                              />
                            </div>
                          ) : (
                            <code {...props} className={`${className} bg-black/30 border border-white/10 rounded-md px-1.5 py-0.5 text-indigo-300 text-[13px] font-mono`}>
                              {children}
                            </code>
                          )
                        }
                      }}
                    >
                      {msg.content
                        .replace(/<think>[\s\S]*?<\/think>/g, "")
                        .replace(/{\s*"tool"\s*:\s*"[^"]+"[\s\S]*}/g, "")
                        .replace(/<function=[^>]+>[\s\S]*?(?:<\/function>|})/g, "")
                        .trim()}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <span className="whitespace-pre-wrap text-sm font-medium">{msg.content}</span>
                )}
              </div>
            </motion.div>
          ))}
          </AnimatePresence>
        )}
        
        {/* HITL UI */}
        {isPaused && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mt-6 border border-amber-500/30 p-6 rounded-2xl bg-amber-500/10 backdrop-blur-md shadow-2xl">
            <h3 className="font-bold text-amber-400 mb-2 flex items-center"><span className="text-xl mr-2">⚠️</span> Plano de Ação Identificado</h3>
            <p className="text-sm mb-5 opacity-90">Deseja permitir que o Coder execute este plano em seus arquivos de forma autônoma?</p>
            <div className="flex space-x-3">
              <button
                onClick={() => handleApprove(true)}
                className="px-5 py-2 rounded-xl bg-amber-500 text-black font-bold hover:bg-amber-400 transition-colors shadow-lg"
              >
                Aprovar & Executar
              </button>
              <button
                onClick={() => handleApprove(false)}
                className="px-5 py-2 rounded-xl border border-amber-500/50 text-amber-500 font-bold hover:bg-amber-500/10 transition-colors"
              >
                Abortar
              </button>
            </div>
          </motion.div>
        )}
        
        {isProcessing && !isPaused && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between mt-2 max-w-[85%]">
             <div className="flex items-center space-x-3 opacity-60 text-sm font-medium">
               <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
               <span className="text-indigo-200">{currentTool ? `Executando: ${currentTool}...` : 'Raciocinando na matriz...'}</span>
             </div>
             <button
               onClick={handleCancel}
               className="px-3 py-1.5 text-xs font-semibold border border-rose-500/30 text-rose-400 rounded-lg hover:bg-rose-500/10 cursor-pointer transition-colors"
             >
               Interromper
             </button>
           </motion.div>
        )}
        
        <div ref={messagesEndRef} className="h-4" />
      </main>

      {/* Input Area */}
      <footer className="p-4 lg:px-20 pb-8 bg-gradient-to-t from-[var(--premium-bg)] to-transparent pt-10">
        <form onSubmit={handleSubmit} className="relative max-w-4xl mx-auto">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            disabled={isProcessing || isPaused}
            placeholder={isPaused ? "Aguardando aprovação do plano..." : "Digite sua instrução mágica ou use o áudio..."}
            className="w-full rounded-2xl p-5 pr-24 resize-none outline-none glass-panel focus:ring-2 focus:ring-indigo-500/50 transition-all disabled:opacity-50 text-[15px] shadow-2xl placeholder-white/30"
            rows={2}
          />
          <div className="absolute right-3 bottom-4 flex items-center space-x-2">
            <button
              type="button"
              onClick={toggleRecording}
              disabled={isProcessing || isPaused}
              className={`p-2 rounded-xl transition-all ${isRecording ? 'bg-rose-500/20 text-rose-400 scale-110 animate-pulse' : 'hover:bg-white/10 opacity-70 hover:opacity-100'} disabled:opacity-30 disabled:hover:opacity-30`}
              title="Comando de Voz"
            >
              <Mic className="w-5 h-5" />
            </button>
            <button
              type="submit"
              disabled={!input.trim() || isProcessing || isPaused}
              className="p-2 bg-indigo-600 rounded-xl hover:bg-indigo-500 transition-colors disabled:opacity-30 disabled:hover:bg-indigo-600 text-white shadow-lg"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </form>
      </footer>
    </div>
  );
}
