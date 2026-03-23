import { useEffect, useState } from 'react';
import { Clock, Send, XCircle, Search, RefreshCw, AlertCircle, MessageCircle, X, Trash2 } from 'lucide-react';
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

  const fetchFollowUps = async () => {
    try {
      const res = await fetch('/api/followups');
      if (!res.ok) throw new Error('Failed to fetch data from backend');
      const data = await res.json();
      setFollowUps(data);
      if (errorMsg) setErrorMsg(null);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || 'Backend connection error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFollowUps();
    const interval = setInterval(fetchFollowUps, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchMessages = async (chatId: string) => {
    setSelectedChatId(chatId);
    try {
      const res = await fetch(`/api/messages/${chatId}`);
      if (!res.ok) throw new Error('Failed to fetch messages');
      const data = await res.json();
      setChatMessages(data);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message);
    }
  };

  const handleAction = async (id: string, action: 'trigger' | 'cancel') => {
    try {
      const res = await fetch(`/api/followups/${id}/${action}`, { method: 'POST' });
      if (!res.ok) throw new Error(`Action ${action} failed`);
      fetchFollowUps();
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message);
    }
  };

  const handleDelete = async (leadId: string) => {
    if (!confirm('Are you sure you want to permanently delete this lead and ALL its history? This is for testing only.')) return;
    try {
      const res = await fetch(`/api/leads/${leadId}`, { method: 'DELETE' });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to delete lead');
      }
      setSelectedChatId(null);
      fetchFollowUps();
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message);
    }
  };

  const getTimerText = (scheduledAt: string, status: string) => {
    if (status !== 'pending') return '—';
    const diff = new Date(scheduledAt).getTime() - new Date().getTime();
    if (diff <= 0) return 'Ready';
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
  };

  const filteredUps = followUps.filter(f => 
    f.lead.chatId.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (f.aiReasonCode || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return (
    <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center font-sans">
      <div className="flex flex-col items-center gap-4 text-[#2B303A]">
        <RefreshCw className="w-8 h-8 animate-spin text-[#94A3B8]" />
        <div className="text-sm font-medium tracking-wide">Loading Dashboard...</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#2B303A] font-sans selection:bg-[#E2E8F0]">
      
      {/* Top Navbar */}
      <header className="bg-white border-b border-[#E2E8F0] sticky top-0 z-40 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-8 h-[72px] flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-[#0F172A] rounded flex items-center justify-center shadow-sm">
              <span className="text-white font-serif font-bold text-xl leading-none tracking-tight">M</span>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-[#0F172A]">Magnat Follow-Up UI</h1>
              <p className="text-xs uppercase tracking-widest text-[#64748B] font-semibold mt-[2px]">AI Monitoring</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-[#F1F5F9] border border-[#E2E8F0]">
              <div className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
              <span className="text-xs font-semibold text-[#475569] uppercase tracking-wider">Live Sync</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1400px] mx-auto px-8 py-10 flex gap-8 items-start">
        
        {/* Table/List Section */}
        <div className={`flex-1 transition-all duration-300 ${selectedChatId ? 'w-[calc(100%-480px)]' : 'w-full'}`}>
          <div className="mb-6 flex items-end justify-between">
            <div className="relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
              <input 
                type="text" 
                placeholder="Search leads, reasons..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2.5 w-[320px] bg-white border border-[#CBD5E1] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#94A3B8] transition-shadow shadow-sm"
              />
            </div>
            <div className="text-sm font-medium text-[#64748B] flex items-center gap-2">
              <span>Total Active:</span>
              <span className="bg-[#E2E8F0] text-[#0F172A] px-2.5 py-1 rounded font-mono shadow-sm">{followUps.length}</span>
            </div>
          </div>

          <div className="bg-white border border-[#CBD5E1] rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-[#F8F9FA] border-b border-[#CBD5E1] text-[#64748B] text-xs uppercase tracking-wider">
                  <th className="px-6 py-4 font-semibold">Client Target</th>
                  <th className="px-6 py-4 font-semibold">Automated Status</th>
                  <th className="px-6 py-4 font-semibold">AI Decision Logic</th>
                  <th className="px-6 py-4 font-semibold">Timer Delay</th>
                  <th className="px-6 py-4 font-semibold text-right">Intervention</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-sm">
                {filteredUps.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-24 text-center text-[#94A3B8]">
                      <div className="flex flex-col items-center gap-4">
                        <AlertCircle className="w-12 h-12 opacity-50" />
                        <p className="font-medium">No tracking entries match this criteria.</p>
                      </div>
                    </td>
                  </tr>
                )}
                {filteredUps.map(fu => (
                  <tr key={fu.id} className="hover:bg-[#F8F9FA] transition-colors group">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-8 h-8 rounded-full bg-[#E2E8F0] flex items-center justify-center text-[#64748B] cursor-pointer hover:bg-[#CBD5E1] transition-colors"
                          onClick={() => fetchMessages(fu.lead.chatId)}
                          title="View Conversation Context"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </div>
                        <div>
                          <div 
                            className="font-semibold text-[#0F172A] cursor-pointer hover:underline decoration-[#94A3B8] underline-offset-4"
                            onClick={() => fetchMessages(fu.lead.chatId)}
                          >
                            @{fu.lead.chatId}
                          </div>
                          <div className="text-[11px] text-[#94A3B8] mt-0.5 font-mono uppercase tracking-wider">{fu.leadId.slice(0, 18)}...</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      {fu.status === 'pending' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold">
                          <Clock className="w-3.5 h-3.5" /> Scheduled
                        </span>
                      )}
                      {fu.status === 'sent' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold">
                          <Send className="w-3.5 h-3.5" /> Message Sent
                        </span>
                      )}
                      {fu.status === 'cancelled' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-100 text-slate-600 border border-slate-300 text-xs font-semibold">
                          <XCircle className="w-3.5 h-3.5" /> Dropped
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#CBD5E1]" />
                          <span className="text-[#334155] font-medium text-[13px]">{fu.aiReasonCode || 'Unknown Evaluation'}</span>
                        </div>
                        {(fu.templateGroup || fu.language) && (
                          <div className="pl-4 text-[11px] text-[#64748B] font-mono whitespace-nowrap">
                            TMPL_{fu.templateGroup} [{fu.language?.toUpperCase()}]
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="font-mono text-[#475569] bg-[#F1F5F9] px-3 py-1.5 rounded inline-block text-[13px] shadow-sm">
                        {getTimerText(fu.scheduledAt, fu.status)}
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {fu.status === 'pending' && (
                          <>
                            <button 
                              onClick={() => handleAction(fu.id, 'trigger')}
                              className="px-4 py-2 bg-[#0F172A] hover:bg-[#334155] text-white text-[11px] uppercase tracking-wider font-semibold rounded transition-colors"
                            >
                              Push
                            </button>
                            <button 
                              onClick={() => handleAction(fu.id, 'cancel')}
                              className="px-4 py-2 bg-white border border-[#CBD5E1] hover:bg-[#F1F5F9] text-[#475569] text-[11px] uppercase tracking-wider font-semibold rounded transition-colors"
                            >
                              Halt
                            </button>
                          </>
                        )}
                        <button 
                          onClick={() => handleDelete(fu.leadId)}
                          className="w-[34px] h-[34px] flex items-center justify-center bg-white border border-red-200 hover:bg-red-50 text-red-500 rounded transition-colors"
                          title="Delete Lead & History"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* Detail Panel */}
        {selectedChatId && (
          <div className="w-[440px] sticky top-[104px] h-[calc(100vh-144px)] bg-white border border-[#CBD5E1] rounded-xl shadow-xl flex flex-col overflow-hidden animate-in slide-in-from-right-8 fade-in duration-200">
            
            <div className="h-[68px] px-6 border-b border-[#E2E8F0] flex justify-between items-center bg-[#F8F9FA]">
              <div>
                <h3 className="font-bold text-[#0F172A] text-sm">Target: @{selectedChatId}</h3>
                <p className="text-[11px] text-[#64748B] tracking-wide mt-0.5">MESSAGES SYNCED</p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => setSelectedChatId(null)} 
                  className="w-8 h-8 flex items-center justify-center rounded bg-white border border-[#CBD5E1] hover:bg-[#F1F5F9] text-[#64748B] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5 bg-white relative">
              {chatMessages.length === 0 ? (
                <div className="m-auto text-center text-[#94A3B8] flex flex-col items-center gap-3">
                  <Search className="w-8 h-8 opacity-30" />
                  <p className="text-sm font-medium">No history logged for this chat.</p>
                </div>
              ) : (
                chatMessages.map((m, idx) => {
                  const isManager = m.sender === 'manager';
                  return (
                    <div key={m.id || idx} className={`flex flex-col w-full ${isManager ? 'items-end' : 'items-start'}`}>
                      <div className="text-[10px] text-[#94A3B8] font-semibold tracking-wider font-sans mb-1 uppercase">
                        {isManager ? 'Manager' : 'Client'}
                      </div>
                      <div className={`p-4 text-[13px] leading-relaxed shadow-sm w-[85%]
                        ${isManager 
                          ? 'bg-[#0F172A] text-white rounded-2xl rounded-tr-sm' 
                          : 'bg-[#F1F5F9] border border-[#E2E8F0] text-[#334155] rounded-2xl rounded-tl-sm'
                        }`}
                      >
                        {m.text}
                      </div>
                      <span className="text-[10px] text-[#94A3B8] font-mono mt-1.5">
                        {new Date(m.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

      </main>

      {/* Global Error Toast */}
      {errorMsg && (
        <div className="fixed bottom-6 right-6 bg-red-600 text-white px-5 py-3.5 rounded-lg shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-8 z-50">
          <AlertCircle className="w-5 h-5 opacity-90" />
          <div className="flex-1">
            <p className="text-sm font-bold tracking-wide">Sync Error</p>
            <p className="text-xs opacity-90">{errorMsg}</p>
          </div>
          <button 
            onClick={() => setErrorMsg(null)}
            className="w-6 h-6 flex items-center justify-center hover:bg-red-500 rounded transition-colors ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
