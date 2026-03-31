import { useEffect, useState, useRef } from 'react';
declare const __BUILD_TIME__: string;
import { Search, AlertCircle, X, Trash2, Settings as SettingsIcon, Save, Activity, ChevronDown, RefreshCw } from 'lucide-react';
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
  lead: { chatId: string; status: string; }
}

interface BotLog {
  id: string;
  level: 'info' | 'warn' | 'error' | 'decision';
  leadId?: string;
  chatId?: string;
  event: string;
  message: string;
  meta?: string;
  createdAt: string;
}

const LEVEL_STYLES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  info:     { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200',  dot: 'bg-blue-500' },
  warn:     { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200', dot: 'bg-amber-500' },
  error:    { bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200',   dot: 'bg-red-500' },
  decision: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', dot: 'bg-violet-500' },
};

function App() {
  const [tab, setTab] = useState<'followups' | 'logs' | 'settings'>('followups');
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [logs, setLogs] = useState<BotLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [logFilter, setLogFilter] = useState('all');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(() => localStorage.getItem('magnat_auth') === 'true');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [debounceVal, setDebounceVal] = useState('15');
  const [followupVal, setFollowupVal] = useState('15');
  const [testModeVal, setTestModeVal] = useState('1');
  const [autoRefreshLogs, setAutoRefreshLogs] = useState(true);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const logsBottomRef = useRef<HTMLDivElement>(null);

  const fetchFollowUps = async () => {
    try {
      const res = await fetch('/api/followups');
      if (!res.ok) throw new Error('Failed to fetch');
      setFollowUps(await res.json());
    } catch (e: any) { setErrorMsg(e.message); } finally { setLoading(false); }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/logs?limit=200');
      if (!res.ok) return;
      const data = await res.json();
      setLogs(data.reverse()); // newest at bottom
    } catch (e) { console.error(e); }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      const deb = data.find((s: any) => s.key === 'manager_debounce_minutes');
      const fol = data.find((s: any) => s.key === 'followup_delay_minutes');
      const test = data.find((s: any) => s.key === 'test_mode');
      if (deb) setDebounceVal(deb.value);
      if (fol) setFollowupVal(fol.value);
      if (test) setTestModeVal(test.value);
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

  const clearLogs = async () => {
    if (!confirm('Clear all logs?')) return;
    await fetch('/api/logs', { method: 'DELETE' });
    setLogs([]);
  };

  useEffect(() => {
    fetchFollowUps();
    fetchSettings();
    fetchLogs();
    const ffInterval = setInterval(fetchFollowUps, 10000);
    return () => clearInterval(ffInterval);
  }, []);

  useEffect(() => {
    if (!autoRefreshLogs) return;
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, [autoRefreshLogs]);

  useEffect(() => {
    if (tab === 'logs') {
      setTimeout(() => logsBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [logs, tab]);

  const fetchMessages = async (chatId: string) => {
    setSelectedChatId(chatId);
    try {
      const res = await fetch(`/api/messages/${chatId}`);
      setChatMessages(await res.json());
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
    if (diff <= 0) return 'Processing...';
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return `${mins}m ${secs}s`;
  };

  const filteredLogs = logs.filter(l => {
    if (logFilter === 'all') return true;
    return l.level === logFilter;
  });

  const filteredUps = followUps.filter(f =>
    f.lead.chatId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (f.aiReasonCode || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (email === 'operations@magnatdiamonds.com' && password === 'SergyCOO2026') {
      localStorage.setItem('magnat_auth', 'true');
      setIsAuthenticated(true);
    } else {
      alert('Invalid credentials');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('magnat_auth');
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center font-sans text-white p-6">
        <form onSubmit={handleLogin} className="bg-slate-900 border border-slate-800 p-8 rounded-2xl w-full max-w-sm flex flex-col gap-5 shadow-2xl">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow">
              <span className="text-slate-900 font-bold text-lg">M</span>
            </div>
            <div>
              <h1 className="font-bold text-xl tracking-tight">Magnat Bot</h1>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">Secure Dashboard</p>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-white focus:ring-1 focus:ring-slate-500 transition-colors" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-white focus:ring-1 focus:ring-slate-500 transition-colors" />
          </div>
          <button type="submit" className="w-full bg-white text-slate-900 font-bold py-3 mt-2 rounded-lg text-sm hover:bg-slate-200 transition-colors shadow">Login to Dashboard</button>
        </form>
      </div>
    );
  }

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white text-sm">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900 md:sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-6 py-4 md:py-0 md:h-16 flex flex-col md:flex-row items-center justify-between gap-4 md:gap-0">
          <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-start">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 bg-white rounded flex items-center justify-center">
                <span className="text-slate-900 font-bold text-sm">M</span>
              </div>
              <span className="font-bold text-white tracking-tight">Magnat Bot</span>
              <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 bg-slate-800 rounded border border-slate-700">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-slate-400 text-[10px] font-mono whitespace-nowrap">
                  build {new Date(__BUILD_TIME__).toLocaleString('uk-UA', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                </span>
              </div>
            </div>
            <button onClick={handleLogout} className="md:hidden text-xs text-slate-500 hover:text-white border border-slate-700 px-3 py-1 rounded">Logout</button>
          </div>
          <nav className="flex gap-1 overflow-x-auto w-full md:w-auto no-scrollbar pb-1 md:pb-0 items-center">
            {(['followups', 'logs', 'settings'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded text-xs font-semibold uppercase tracking-wider transition-colors whitespace-nowrap ${
                  tab === t ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {t === 'followups' ? 'Monitor' : t === 'logs' ? '⚡ Logs' : '⚙ Settings'}
              </button>
            ))}
            <button onClick={handleLogout} className="hidden md:block ml-2 px-3 py-1.5 text-xs text-slate-500 hover:text-white border border-slate-700 hover:border-slate-500 rounded transition-colors whitespace-nowrap">Logout</button>
          </nav>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-8">

        {/* ===================== FOLLOWUPS TAB ===================== */}
        {tab === 'followups' && (
          <div className="flex flex-col xl:flex-row gap-6 items-start">
            <div className="flex-1 w-full overflow-hidden">
              <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-0">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search by username or reason..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-9 pr-4 py-2 w-72 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs text-slate-400 font-mono">{followUps.length} active</span>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto w-full">
                <table className="w-full text-left text-sm whitespace-nowrap md:whitespace-normal">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500 text-[11px] uppercase tracking-widest">
                      <th className="px-5 py-3 font-semibold">Target</th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                      <th className="px-5 py-3 font-semibold">AI Reason</th>
                      <th className="px-5 py-3 font-semibold">Time Left</th>
                      <th className="px-5 py-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {filteredUps.length === 0 && (
                      <tr><td colSpan={5} className="py-20 text-center text-slate-600">
                        <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-40" />
                        <p>No follow-ups found</p>
                      </td></tr>
                    )}
                    {filteredUps.map(fu => (
                      <tr key={fu.id} className="hover:bg-slate-800/50 group transition-colors">
                        <td className="px-5 py-4">
                          <div className="font-semibold text-white cursor-pointer hover:text-blue-400 transition-colors" onClick={() => fetchMessages(fu.lead.chatId)}>
                            @{fu.lead.chatId}
                          </div>
                          <div className="text-[10px] text-slate-600 font-mono mt-0.5">{fu.leadId}</div>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                            fu.status === 'sent' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                            fu.status === 'pending' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                            'bg-slate-700 text-slate-400 border-slate-600'
                          }`}>
                            {fu.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-slate-400 text-[13px]">
                          {fu.aiReasonCode || '—'}
                          {fu.language && <span className="ml-2 px-1.5 py-0.5 bg-slate-800 rounded text-[10px] uppercase font-bold text-slate-300 border border-slate-700">{fu.language}</span>}
                        </td>
                        <td className="px-5 py-4">
                          <span className="font-mono text-[13px] text-slate-300 tabular-nums">{getTimerText(fu.scheduledAt, fu.status)}</span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex justify-end gap-2">
                            <button onClick={() => handleDelete(fu.leadId)} className="p-1.5 rounded hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors">
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

            {/* Chat panel */}
            {selectedChatId && (
              <div className="w-full xl:w-[400px] xl:sticky top-20 bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-[60vh] xl:h-[calc(100vh-120px)] overflow-hidden mt-6 xl:mt-0">
                <div className="px-5 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
                  <div>
                    <div className="font-bold text-white text-sm">@{selectedChatId}</div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Conversation History</div>
                  </div>
                  <button onClick={() => setSelectedChatId(null)} className="p-1.5 hover:bg-slate-700 rounded transition-colors">
                    <X className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
                  {chatMessages.map((m, i) => (
                    <div key={i} className={`flex flex-col ${m.sender === 'manager' ? 'items-end' : 'items-start'}`}>
                      <div className={`p-3.5 rounded-xl text-sm max-w-[90%] leading-relaxed ${
                        m.sender === 'manager' ? 'bg-white text-slate-900 rounded-tr-sm' : 'bg-slate-800 text-slate-200 rounded-tl-sm'
                      }`}>{m.text}</div>
                      <div className="text-[9px] font-mono text-slate-600 mt-1 uppercase">
                        {m.sender} · {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================== LOGS TAB ===================== */}
        {tab === 'logs' && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-violet-400" />
                <h2 className="text-white font-bold">Real-time Bot Logs</h2>
                <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded-full text-slate-400 font-mono">{filteredLogs.length}</span>
              </div>
              <div className="flex items-center gap-3">
                {/* Level filter */}
                <div className="hidden sm:flex gap-1">
                  {['all', 'info', 'warn', 'error', 'decision'].map(l => (
                    <button
                      key={l}
                      onClick={() => setLogFilter(l)}
                      className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors border ${
                        logFilter === l
                          ? l === 'error' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                            l === 'warn' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                            l === 'decision' ? 'bg-violet-500/20 text-violet-400 border-violet-500/30' :
                            l === 'info' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                            'bg-slate-700 text-white border-slate-600'
                          : 'text-slate-500 border-slate-700 hover:border-slate-600 hover:text-slate-300'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setAutoRefreshLogs(!autoRefreshLogs)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-semibold border transition-colors ${
                    autoRefreshLogs ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'text-slate-500 border-slate-700'
                  }`}
                >
                  <RefreshCw className={`w-3 h-3 ${autoRefreshLogs ? 'animate-spin' : ''}`} />
                  Auto
                </button>
                <button onClick={() => fetchLogs()} className="px-3 py-1.5 rounded text-[11px] font-semibold border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-colors">
                  Refresh
                </button>
                <button onClick={clearLogs} className="px-3 py-1.5 rounded text-[11px] font-semibold border border-red-500/20 text-red-500 hover:bg-red-500/10 transition-colors">
                  Clear
                </button>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden font-mono text-sm">
              {filteredLogs.length === 0 && (
                <div className="py-24 text-center text-slate-600">
                  <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No logs yet. Start a test to see events here.</p>
                </div>
              )}
              <div className="divide-y divide-slate-800/50 max-h-[70vh] overflow-y-auto">
                {filteredLogs.map(log => {
                  const style = LEVEL_STYLES[log.level] || LEVEL_STYLES.info;
                  const isExpanded = expandedLog === log.id;
                  const hasMeta = log.meta && log.meta !== 'null';
                  return (
                    <div key={log.id} className="hover:bg-slate-800/30 transition-colors">
                      <div
                        className="px-5 py-3 flex items-start gap-3 cursor-pointer"
                        onClick={() => hasMeta && setExpandedLog(isExpanded ? null : log.id)}
                      >
                        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${style.dot}`} />
                        <div className="flex-shrink-0 w-20">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${style.bg.replace('bg-', 'bg-opacity-20 bg-')} ${style.text} ${style.border}`}>
                            {log.level}
                          </span>
                        </div>
                        <div className="flex-shrink-0 w-40 text-[11px] text-slate-500 font-bold uppercase tracking-wider truncate">
                          {log.event}
                        </div>
                        <div className="flex-1 text-slate-300 text-[13px]">
                          {log.message}
                          {log.chatId && <span className="ml-2 text-slate-600">@{log.chatId}</span>}
                        </div>
                        <div className="flex-shrink-0 text-[10px] text-slate-600 whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </div>
                        {hasMeta && (
                          <ChevronDown className={`w-3 h-3 text-slate-600 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        )}
                      </div>
                      {isExpanded && hasMeta && (
                        <div className="px-5 pb-3 pl-[4.5rem]">
                          <pre className="bg-slate-950 text-slate-400 text-[11px] p-3 rounded-lg overflow-x-auto border border-slate-800">
                            {JSON.stringify(JSON.parse(log.meta!), null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={logsBottomRef} />
              </div>
            </div>
          </div>
        )}

        {/* ===================== SETTINGS TAB ===================== */}
        {tab === 'settings' && (
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-6">
              <SettingsIcon className="w-5 h-5 text-slate-400" />
              <h2 className="text-white font-bold">Timer Configuration</h2>
            </div>
            <div className="flex flex-col gap-5">
              {[
                {
                  key: 'test_mode',
                  label: 'Test Mode (Bot Status)',
                  value: testModeVal,
                  set: setTestModeVal,
                  desc: 'If ON (1), bot ONLY replies to allowed test users (sanchiz.es, s.ageev, etc). If OFF (0), bot processes ALL Instagram messages.',
                  suffix: ''
                },
                {
                  key: 'manager_debounce_minutes',
                  label: 'Manager Silence Window',
                  value: debounceVal,
                  set: setDebounceVal,
                  desc: 'Minutes of silence after manager\'s last message before AI starts evaluating. Resets on every new manager message.',
                  suffix: 'min'
                },
                {
                  key: 'followup_delay_minutes',
                  label: 'AI Follow-up Delay',
                  value: followupVal,
                  set: setFollowupVal,
                  desc: 'Minutes the AI waits before sending the follow-up message after deciding to send.',
                  suffix: 'min'
                }
              ].map(s => (
                <div key={s.key} className="bg-slate-900 border border-slate-800 rounded-xl p-5 md:p-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4 md:gap-6">
                  <div className="flex-1">
                    <div className="font-semibold text-white mb-1">{s.label}</div>
                    <div className="text-slate-500 text-sm leading-relaxed">{s.desc}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <input
                      type="number"
                      value={s.value}
                      onChange={e => s.set(e.target.value)}
                      className="w-16 md:w-20 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-center font-mono text-base md:text-lg focus:outline-none focus:ring-1 focus:ring-slate-500"
                    />
                    {s.suffix && <span className="text-slate-500 text-sm w-6">{s.suffix}</span>}
                    <button
                      onClick={() => saveSetting(s.key, s.value)}
                      className="flex items-center gap-1.5 px-3 md:px-4 py-2 bg-white text-slate-900 rounded-lg text-sm font-bold hover:bg-slate-200 transition-colors whitespace-nowrap"
                    >
                      <Save className="w-3.5 h-3.5" /> Save
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Chat Panel Overlay for logs tab too */}
      {selectedChatId && tab !== 'followups' && (
        <div className="fixed inset-0 bg-black/60 z-50 flex justify-end" onClick={() => setSelectedChatId(null)}>
          <div className="w-full max-w-sm md:w-96 bg-slate-900 h-full border-l border-slate-800 transition-transform" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-800 flex justify-between">
              <span className="font-bold text-white">@{selectedChatId}</span>
              <button onClick={() => setSelectedChatId(null)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto h-full">
              {chatMessages.map((m, i) => (
                <div key={i} className={`flex ${m.sender === 'manager' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`p-3 rounded-xl text-sm max-w-[85%] ${m.sender === 'manager' ? 'bg-white text-slate-900' : 'bg-slate-800 text-slate-200'}`}>
                    {m.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="fixed bottom-6 right-6 bg-red-600 text-white px-5 py-3.5 rounded-xl shadow-2xl z-50 flex gap-3 items-center">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm font-semibold">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="ml-2"><X className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  );
}

export default App;
