import { useEffect, useState } from 'react';
import { Clock, Send, XCircle, Search, RefreshCw, AlertCircle, MessageCircle, X, Trash2, Settings as SettingsIcon, Save } from 'lucide-react';
import './index.css';

interface FollowUp {
  id: string;
  leadId: string;
  scheduledAt: string;
  status: 'pending' | 'sent' | 'cancelled';
  language: string;
  templateGroup: string;
  attempts: number;
  aiReasonCode: string;
  lead: {
    chatId: string;
    status: string;
  }
}

function App() {
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [debounceVal, setDebounceVal] = useState('15');
  const [followupVal, setFollowupVal] = useState('15');

  const fetchFollowUps = async () => {
    try {
      const res = await fetch('/api/followups');
      if (!res.ok) throw new Error('Failed to fetch data');
      const data = await res.json();
      setFollowUps(data);
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      const deb = data.find((s: any) => s.key === 'manager_debounce_minutes');
      const fol = data.find((s: any) => s.key === 'followup_delay_minutes');
      if (deb) setDebounceVal(deb.value);
      if (fol) setFollowupVal(fol.value);
    } catch (e) { console.error(e); }
  };

  const saveSetting = async (key: string, value: string) => {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value })
    });
    fetchSettings();
  };

  useEffect(() => {
    fetchFollowUps();
    fetchSettings();
    const interval = setInterval(fetchFollowUps, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchMessages = async (chatId: string) => {
    setSelectedChatId(chatId);
    try {
      const res = await fetch(`/api/messages/${chatId}`);
      const data = await res.json();
      setChatMessages(data);
    } catch (e: any) { setErrorMsg(e.message); }
  };

  const handleAction = async (id: string, action: 'trigger' | 'cancel') => {
    try {
      await fetch(`/api/followups/${id}/${action}`, { method: 'POST' });
      fetchFollowUps();
    } catch (e: any) { setErrorMsg(e.message); }
  };

  const handleDelete = async (leadId: string) => {
    if (!confirm('Delete this lead?')) return;
    try {
      await fetch(`/api/leads/${leadId}`, { method: 'DELETE' });
      setSelectedChatId(null);
      fetchFollowUps();
    } catch (e: any) { setErrorMsg(e.message); }
  };

  const getTimerText = (scheduledAt: string, status: string) => {
    if (status !== 'pending') return '—';
    const diff = new Date(scheduledAt).getTime() - new Date().getTime();
    if (diff <= 0) return 'Ready';
    const mins = Math.floor(diff / 60000);
    return `${mins}m`;
  };

  const filteredUps = followUps.filter(f => 
    f.lead.chatId.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (f.aiReasonCode || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="p-10 text-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#2B303A] font-sans">
      <header className="bg-white border-b border-[#E2E8F0] shadow-sm p-6 flex justify-between items-center">
        <div className="flex items-center gap-4">
           <div className="w-10 h-10 bg-[#0F172A] rounded flex items-center justify-center shadow-sm">
             <span className="text-white font-serif font-bold text-xl leading-none">M</span>
           </div>
           <h1 className="text-lg font-bold tracking-tight text-[#0F172A]">Magnat Control Center</h1>
        </div>
        <button 
          onClick={() => setShowSettings(!showSettings)}
          className="p-2.5 rounded-full hover:bg-slate-100 transition-colors"
        >
          <SettingsIcon className="w-5 h-5 text-slate-500" />
        </button>
      </header>

      <main className="max-w-[1400px] mx-auto px-8 py-10">
        
        {showSettings && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 mb-8 shadow-sm animate-in fade-in slide-in-from-top-4 duration-200">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-6 font-mono flex items-center gap-2">
              <SettingsIcon className="w-4 h-4" /> Global Timer Configuration
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-600">Manager Wait Time (Silence Window)</label>
                <div className="flex gap-2">
                  <input 
                    type="number" 
                    value={debounceVal}
                    onChange={(e) => setDebounceVal(e.target.value)}
                    className="border border-slate-300 rounded px-3 py-2 text-sm w-32 focus:ring-2 focus:ring-slate-400 outline-none"
                  />
                  <button 
                    onClick={() => saveSetting('manager_debounce_minutes', debounceVal)}
                    className="bg-slate-800 text-white px-4 py-2 rounded text-xs font-bold hover:bg-slate-700 flex items-center gap-2"
                  >
                    <Save className="w-3.5 h-3.5" /> Save
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Minutes of silence required after manager's last message before AI evaluates the chat.</p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-600">AI Follow-up Queue Delay</label>
                <div className="flex gap-2">
                  <input 
                    type="number" 
                    value={followupVal}
                    onChange={(e) => setFollowupVal(e.target.value)}
                    className="border border-slate-300 rounded px-3 py-2 text-sm w-32 focus:ring-2 focus:ring-slate-400 outline-none"
                  />
                  <button 
                    onClick={() => saveSetting('followup_delay_minutes', followupVal)}
                    className="bg-slate-800 text-white px-4 py-2 rounded text-xs font-bold hover:bg-slate-700 flex items-center gap-2"
                  >
                    <Save className="w-3.5 h-3.5" /> Save
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Minutes AI should wait for client reply after the initial evaluation check.</p>
              </div>
            </div>
          </div>
        )}

        <div className="mb-6 flex items-end justify-between">
            <div className="relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
              <input 
                type="text" 
                placeholder="Search leads, reasons..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2.5 w-[320px] bg-white border border-[#CBD5E1] rounded-lg text-sm focus:outline-none shadow-sm"
              />
            </div>
            <div className="text-sm font-medium text-[#64748B] flex items-center gap-2">
              <span>Sync Status:</span>
              <span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border border-emerald-200 shadow-sm">Online</span>
            </div>
        </div>

        <div className="bg-white border border-[#CBD5E1] rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F8F9FA] border-b border-[#CBD5E1] text-[#64748B] text-xs uppercase tracking-wider">
                <th className="px-6 py-4 font-bold">Target</th>
                <th className="px-6 py-4 font-bold">Status</th>
                <th className="px-6 py-4 font-bold">Reasoning</th>
                <th className="px-6 py-4 font-bold">Timer</th>
                <th className="px-6 py-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] text-sm">
              {filteredUps.map(fu => (
                <tr key={fu.id} className="hover:bg-[#F8F9FA] group transition-colors">
                  <td className="px-6 py-5">
                    <div className="font-bold text-[#0F172A] cursor-pointer hover:underline" onClick={() => fetchMessages(fu.lead.chatId)}>@{fu.lead.chatId}</div>
                    <div className="text-[10px] text-slate-400 uppercase mt-0.5 font-mono">{fu.leadId}</div>
                  </td>
                  <td className="px-6 py-5">
                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase border ${fu.status === 'sent' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : fu.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-600 border-slate-300'}`}>
                      {fu.status}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-slate-600 font-medium">{fu.aiReasonCode}</td>
                  <td className="px-6 py-5 font-mono text-slate-500 font-bold bg-slate-50 border-r border-l border-slate-200">{getTimerText(fu.scheduledAt, fu.status)}</td>
                  <td className="px-6 py-5 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100">
                      <button onClick={() => handleDelete(fu.leadId)} className="p-2 hover:bg-red-50 text-red-400 rounded transition-colors"><Trash2 className="w-4 h-4" /></button>
                      {fu.status === 'pending' && <button onClick={() => handleAction(fu.id, 'trigger')} className="px-3 py-1.5 bg-slate-900 text-white rounded text-[10px] font-bold hover:bg-slate-700">Push</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {selectedChatId && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex justify-end">
            <div className="w-[480px] bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right-full duration-300">
               <div className="p-6 border-b flex justify-between items-center bg-slate-50">
                  <div>
                    <h3 className="font-bold text-slate-900">@{selectedChatId}</h3>
                    <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">Sync History</p>
                  </div>
                  <button onClick={() => setSelectedChatId(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X className="w-5 h-5 text-slate-500" /></button>
               </div>
               <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
                  {chatMessages.map((m, i) => (
                    <div key={i} className={`flex flex-col ${m.sender === 'manager' ? 'items-end' : 'items-start'}`}>
                       <div className={`p-4 rounded-xl text-sm max-w-[90%] shadow-sm ${m.sender === 'manager' ? 'bg-slate-900 text-white rounded-tr-none' : 'bg-slate-100 text-slate-700 rounded-tl-none'}`}>
                         {m.text}
                       </div>
                       <div className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">
                         {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                       </div>
                    </div>
                  ))}
               </div>
            </div>
          </div>
      )}

      {errorMsg && <div className="fixed bottom-6 right-6 bg-red-600 text-white px-6 py-4 rounded-xl shadow-2xl z-50 flex gap-3"><AlertCircle /><div className="text-sm font-bold">{errorMsg}</div></div>}
    </div>
  );
}

export default App;
