'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, Network, Plus, Printer, RefreshCw, Trash2, Usb, Wifi } from 'lucide-react';
import { discoverLocalPrinters, sendTestPrintTicket } from '@/lib/printBridge';

type Config = any;

const typeOptions = [
  ['receipt', 'Receipt'], ['kitchen', 'Kitchen'], ['bar', 'Bar'], ['report', 'Reports'], ['label', 'Labels'], ['other', 'Other'],
];

export default function PrintingSettingsPage() {
  const [branchId, setBranchId] = useState('');
  const [printers, setPrinters] = useState<Config[]>([]);
  const [detected, setDetected] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({ name: '', printerType: 'receipt', connectionType: 'usb', usbPrinterName: '', usbPort: '', ipAddress: '', port: 9100, paperWidth: '80mm', enabled: true });

  const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('krown_session_token') || ''}`, 'Content-Type': 'application/json' });

  async function load() {
    setLoading(true); setError('');
    const b = localStorage.getItem('krown_branch_id') || '';
    setBranchId(b);
    if (!b) { setLoading(false); setError('No branch is selected for this account.'); return; }
    try {
      const r = await fetch(`/api/printers?branchId=${encodeURIComponent(b)}`, { headers: authHeaders(), cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Unable to load printers');
      setPrinters(d.data || []);
    } catch (e: any) { setError(e.message || 'Unable to load printers'); }
    finally { setLoading(false); }
  }

  async function discover() {
    setDiscovering(true); setError('');
    try { setDetected(await discoverLocalPrinters()); }
    catch (e: any) { setError(e.message || 'Printer discovery failed'); }
    finally { setDiscovering(false); }
  }

  useEffect(() => { load(); discover(); }, []);

  function selectUsb(p: any) {
    setForm((v: any) => ({ ...v, connectionType: 'usb', usbPrinterName: p.name || '', usbPort: p.port || '', name: v.name || p.name || 'USB Printer' }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('');
    try {
      const r = await fetch('/api/printers', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ ...form, branchId }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed to save printer');
      setPrinters(v => [...v, d.data]);
      setForm({ name: '', printerType: 'receipt', connectionType: 'usb', usbPrinterName: '', usbPort: '', ipAddress: '', port: 9100, paperWidth: '80mm', enabled: true });
    } catch (e: any) { setError(e.message || 'Failed to save printer'); }
    finally { setSaving(false); }
  }

  async function test(p: any) {
    setError('');
    const result = p.connection_type === 'usb'
      ? await fetch(`http://127.0.0.1:9101/print/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'usb', printerName: p.usb_printer_name, target: p.printer_type }) }).then(r => r.json().catch(() => ({ ok: false, error: `Bridge returned ${r.status}` }))).catch(e => ({ ok: false, error: e.message }))
      : await sendTestPrintTicket(p.ip_address, p.port, p.printer_type === 'receipt' ? 'receipt' : 'kitchen');
    if (!result?.ok) setError(result?.error || 'Printer test failed');
    else await load();
  }

  async function remove(p: any) {
    if (!confirm(`Remove ${p.name}?`)) return;
    const r = await fetch(`/api/printers/${p.id}?branchId=${encodeURIComponent(branchId)}`, { method: 'DELETE', headers: authHeaders() });
    const d = await r.json(); if (!r.ok) { setError(d.error || 'Unable to remove printer'); return; }
    setPrinters(v => v.filter(x => x.id !== p.id));
  }

  return <main className="min-h-screen bg-[#F4F4F6] dark:bg-[#09090B] p-5 md:p-8">
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div><p className="text-xs font-black uppercase tracking-[.18em] text-orange-500">KROWN Operations</p><h1 className="text-3xl font-black text-slate-900 dark:text-white mt-1">Printer Setup</h1><p className="text-sm text-slate-500 mt-2">Configure every receipt, kitchen, bar and report printer for this branch.</p></div>
        <button onClick={() => { load(); discover(); }} className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 font-bold text-sm"><RefreshCw className="w-4 h-4"/>Refresh</button>
      </header>

      {error && <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm font-semibold flex gap-2"><CircleAlert className="w-5 h-5 shrink-0"/>{error}</div>}

      <section className="grid lg:grid-cols-[1.1fr_.9fr] gap-6">
        <div className="rounded-[2rem] bg-white/90 dark:bg-[#121214] border border-black/5 dark:border-white/10 p-6 shadow-xl">
          <div className="flex items-center justify-between mb-5"><div><h2 className="font-black text-lg text-slate-900 dark:text-white">Detected on this computer</h2><p className="text-xs text-slate-500 mt-1">USB printers are discovered locally. LAN printers can be added by IP.</p></div><button onClick={discover} disabled={discovering} className="px-3 py-2 rounded-xl bg-orange-500/10 text-orange-600 text-xs font-black">{discovering ? 'Scanning…' : 'Scan again'}</button></div>
          <div className="space-y-2">{detected.filter(p => p.thermal).map((p, i) => <button key={i} onClick={() => selectUsb(p)} className="w-full flex items-center gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-black/5 dark:border-white/5 text-left hover:border-orange-400/50"><div className="w-10 h-10 rounded-xl bg-white dark:bg-black/20 flex items-center justify-center"><Usb className="w-5 h-5 text-orange-500"/></div><div className="min-w-0 flex-1"><p className="font-bold text-sm text-slate-900 dark:text-white truncate">{p.name}</p><p className="text-xs text-slate-500">{p.port || 'USB'} · {p.driver || 'Thermal printer'}</p></div><Plus className="w-4 h-4 text-slate-400"/></button>)}{detected.filter(p => p.thermal).length === 0 && <div className="py-10 text-center text-sm text-slate-500">No thermal USB printer detected. Connect a printer and scan again, or add a LAN printer.</div>}</div>
        </div>

        <form onSubmit={save} className="rounded-[2rem] bg-white/90 dark:bg-[#121214] border border-black/5 dark:border-white/10 p-6 shadow-xl space-y-4">
          <h2 className="font-black text-lg text-slate-900 dark:text-white">Add printer</h2>
          <input required value={form.name} onChange={e => setForm({...form,name:e.target.value})} placeholder="Printer name" className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-black/5 dark:border-white/10 outline-none"/>
          <div className="grid grid-cols-2 gap-3"><select value={form.printerType} onChange={e => setForm({...form,printerType:e.target.value})} className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-black/5 dark:border-white/10">{typeOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><select value={form.connectionType} onChange={e => setForm({...form,connectionType:e.target.value})} className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-black/5 dark:border-white/10"><option value="usb">USB</option><option value="lan">LAN / Ethernet</option></select></div>
          {form.connectionType === 'usb' ? <div className="grid grid-cols-2 gap-3"><input required value={form.usbPrinterName} onChange={e=>setForm({...form,usbPrinterName:e.target.value})} placeholder="Detected USB printer" className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/5 border"/><input value={form.usbPort} onChange={e=>setForm({...form,usbPort:e.target.value})} placeholder="USB002" className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/5 border"/></div> : <div className="grid grid-cols-[1fr_110px] gap-3"><input required value={form.ipAddress} onChange={e=>setForm({...form,ipAddress:e.target.value})} placeholder="192.168.1.34" className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/5 border"/><input type="number" min="1" max="65535" value={form.port} onChange={e=>setForm({...form,port:Number(e.target.value)})} placeholder="9100" className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/5 border"/></div>}
          <select value={form.paperWidth} onChange={e=>setForm({...form,paperWidth:e.target.value})} className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-white/5 border"><option value="80mm">80mm</option><option value="58mm">58mm</option></select>
          <button disabled={saving} className="w-full p-4 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black flex items-center justify-center gap-2"><Plus className="w-5 h-5"/>{saving ? 'Saving…' : 'Add printer'}</button>
        </form>
      </section>

      <section className="rounded-[2rem] bg-white/90 dark:bg-[#121214] border border-black/5 dark:border-white/10 overflow-hidden shadow-xl">
        <div className="p-6 border-b border-black/5 dark:border-white/5"><h2 className="font-black text-lg text-slate-900 dark:text-white">Configured printers</h2><p className="text-xs text-slate-500 mt-1">{printers.length} printer{printers.length === 1 ? '' : 's'} configured for this branch.</p></div>
        {loading ? <div className="p-10 text-center text-sm text-slate-500">Loading…</div> : printers.length === 0 ? <div className="p-12 text-center text-sm text-slate-500">No printers configured yet.</div> : <div className="divide-y divide-black/5 dark:divide-white/5">{printers.map(p => <div key={p.id} className="p-5 flex flex-col md:flex-row md:items-center gap-4"><div className="w-11 h-11 rounded-2xl bg-orange-500/10 flex items-center justify-center"><Printer className="w-5 h-5 text-orange-500"/></div><div className="flex-1"><p className="font-bold text-slate-900 dark:text-white">{p.name}</p><p className="text-xs text-slate-500 capitalize">{p.printer_type} · {p.connection_type === 'usb' ? `${p.usb_printer_name || 'USB'}${p.usb_port ? ` · ${p.usb_port}` : ''}` : `${p.ip_address}:${p.port}`}</p></div><span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500"><CircleStatus status={p.status}/>{p.status}</span><div className="flex gap-2"><button onClick={()=>test(p)} className="px-3 py-2 rounded-xl bg-blue-500/10 text-blue-700 text-xs font-bold">Test</button><button onClick={()=>remove(p)} className="px-3 py-2 rounded-xl bg-red-500/10 text-red-600 text-xs font-bold"><Trash2 className="w-4 h-4"/></button></div></div>)}</div>}
      </section>
    </div>
  </main>;
}

function CircleStatus({ status }: { status: string }) { return status === 'online' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500"/> : <Wifi className="w-3.5 h-3.5"/>; }
