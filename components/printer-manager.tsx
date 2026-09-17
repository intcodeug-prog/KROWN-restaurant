'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleAlert, Loader2, Network, Plus, Printer, RefreshCw, Settings2, Usb, Wifi, X } from 'lucide-react';
import type { DiscoveredPrinter, PrinterConfig, PrinterDestination, PrinterConnection } from '@/lib/printing/printer-types';

const BRIDGE = 'http://127.0.0.1:9101';
const STORAGE = 'krown_printer_manager_v1';
const destinations: { value: PrinterDestination; label: string }[] = [
  { value: 'receipt', label: 'Receipt' }, { value: 'kitchen', label: 'Kitchen' }, { value: 'bar', label: 'Bar' },
  { value: 'report', label: 'Reports' }, { value: 'packing', label: 'Packing' }, { value: 'custom', label: 'Custom' },
];

function loadSaved(): PrinterConfig[] { try { return JSON.parse(localStorage.getItem(STORAGE) || '[]'); } catch { return []; } }
function saveSaved(value: PrinterConfig[]) { localStorage.setItem(STORAGE, JSON.stringify(value)); }

export default function PrinterManager({ organizationId = 'local', branchId = 'local-branch' }: { organizationId?: string; branchId?: string }) {
  const [printers, setPrinters] = useState<PrinterConfig[]>([]);
  const [discovered, setDiscovered] = useState<DiscoveredPrinter[]>([]);
  const [bridgeOnline, setBridgeOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', destination: 'receipt' as PrinterDestination, connection: 'usb' as PrinterConnection, usbPrinterName: '', ipAddress: '', port: '9100', paperWidth: '80mm' as '58mm' | '80mm' });

  const discover = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const health = await fetch(`${BRIDGE}/health`, { cache: 'no-store' });
      if (!health.ok) throw new Error('KROWN Print Engine is not running on this computer.');
      setBridgeOnline(true);
      const response = await fetch(`${BRIDGE}/printers/discover`, { cache: 'no-store' });
      const data = await response.json();
      setDiscovered(Array.isArray(data.printers) ? data.printers : []);
    } catch (e: any) { setBridgeOnline(false); setError(e?.message || 'Unable to discover local printers.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { setPrinters(loadSaved().filter(p => p.organizationId === organizationId && p.branchId === branchId)); discover(); }, [organizationId, branchId, discover]);

  const thermal = useMemo(() => discovered.filter(p => p.likelyThermal), [discovered]);

  function addPrinter(e: React.FormEvent) {
    e.preventDefault(); setError('');
    if (form.connection === 'usb' && !form.usbPrinterName) { setError('Select a USB printer.'); return; }
    if (form.connection === 'lan' && !/^([0-9]{1,3}\.){3}[0-9]{1,3}$/.test(form.ipAddress.trim())) { setError('Enter a valid LAN printer IP address.'); return; }
    const item: PrinterConfig = { id: crypto.randomUUID(), organizationId, branchId, name: form.name.trim() || `${form.destination} printer`, destination: form.destination, connection: form.connection, usbPrinterName: form.connection === 'usb' ? form.usbPrinterName : undefined, ipAddress: form.connection === 'lan' ? form.ipAddress.trim() : undefined, port: form.connection === 'lan' ? Number(form.port || 9100) : undefined, paperWidth: form.paperWidth, enabled: true, status: 'unknown' };
    const all = loadSaved().filter(p => !(p.organizationId === organizationId && p.branchId === branchId && p.id === item.id));
    all.push(item); saveSaved(all); setPrinters(v => [...v, item]); setShowAdd(false); setForm({ name: '', destination: 'receipt', connection: 'usb', usbPrinterName: '', ipAddress: '', port: '9100', paperWidth: '80mm' });
  }

  async function testPrinter(printer: PrinterConfig) {
    setTesting(printer.id); setError('');
    try {
      const body = printer.connection === 'usb' ? { mode: 'usb', printerName: printer.usbPrinterName, target: printer.destination, paperWidth: printer.paperWidth } : { mode: 'lan', ip: printer.ipAddress, port: printer.port || 9100, target: printer.destination, paperWidth: printer.paperWidth };
      const response = await fetch(`${BRIDGE}/print/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.status !== 'PRINTED') throw new Error(data.error || 'Printer test failed.');
      const updated = { ...printer, status: 'online' as const, lastTestAt: new Date().toISOString() };
      const all = loadSaved().map(p => p.id === printer.id ? updated : p); saveSaved(all); setPrinters(v => v.map(p => p.id === printer.id ? updated : p));
    } catch (e: any) { setError(e?.message || 'Printer test failed.'); setPrinters(v => v.map(p => p.id === printer.id ? { ...p, status: 'offline' } : p)); }
    finally { setTesting(null); }
  }

  function remove(id: string) { const all = loadSaved().filter(p => p.id !== id); saveSaved(all); setPrinters(v => v.filter(p => p.id !== id)); }

  return <div className="min-h-screen bg-[#F4F4F6] dark:bg-[#0A0A0C] p-5 sm:p-8 text-slate-900 dark:text-white">
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"><div><div className="flex items-center gap-3"><Printer className="w-7 h-7 text-orange-500"/><h1 className="text-2xl font-black">Printer Setup</h1></div><p className="text-sm text-slate-500 mt-1">Configure receipts, kitchen, bar and other printers for this branch.</p></div><div className="flex gap-2"><button onClick={discover} className="px-4 py-2.5 rounded-xl bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 font-bold text-sm"><RefreshCw className="w-4 h-4 inline mr-2"/>Discover</button><button onClick={() => setShowAdd(true)} className="px-4 py-2.5 rounded-xl bg-orange-500 text-white font-bold text-sm"><Plus className="w-4 h-4 inline mr-2"/>Add printer</button></div></header>
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4"><div className="rounded-3xl bg-white/80 dark:bg-[#121214]/80 border border-black/5 dark:border-white/5 p-5"><p className="text-xs text-slate-500">Print Engine</p><p className={`mt-1 font-black ${bridgeOnline ? 'text-emerald-500' : 'text-red-500'}`}>{bridgeOnline ? 'Connected' : 'Not connected'}</p></div><div className="rounded-3xl bg-white/80 dark:bg-[#121214]/80 border border-black/5 dark:border-white/5 p-5"><p className="text-xs text-slate-500">Detected thermal printers</p><p className="mt-1 text-2xl font-black">{thermal.length}</p></div><div className="rounded-3xl bg-white/80 dark:bg-[#121214]/80 border border-black/5 dark:border-white/5 p-5"><p className="text-xs text-slate-500">Configured printers</p><p className="mt-1 text-2xl font-black">{printers.length}</p></div></section>
      {error && <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-4 text-sm font-semibold text-red-600 dark:text-red-400"><CircleAlert className="w-4 h-4 inline mr-2"/>{error}</div>}
      <section className="rounded-3xl bg-white/80 dark:bg-[#121214]/80 border border-black/5 dark:border-white/5 overflow-hidden"><div className="p-5 border-b border-black/5 dark:border-white/5"><h2 className="font-black">Detected printers</h2><p className="text-xs text-slate-500 mt-1">USB printers are discovered from Windows; LAN printers can be configured by IP.</p></div>{loading ? <div className="p-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto"/></div> : discovered.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No local printers detected.</div> : <div className="divide-y divide-black/5 dark:divide-white/5">{discovered.map(p => <div key={`${p.name}-${p.port}`} className="p-4 flex items-center justify-between gap-4"><div><p className="font-bold">{p.name}</p><p className="text-xs text-slate-500">{p.port || 'Unknown port'} · {p.driver || 'Unknown driver'}</p></div><span className="text-[10px] font-black uppercase px-2 py-1 rounded-lg bg-slate-500/10">{p.likelyThermal ? 'Thermal' : 'Other'}</span></div>)}</div>}</section>
      <section className="rounded-3xl bg-white/80 dark:bg-[#121214]/80 border border-black/5 dark:border-white/5 overflow-hidden"><div className="p-5 border-b border-black/5 dark:border-white/5"><h2 className="font-black">Configured printers</h2><p className="text-xs text-slate-500 mt-1">These settings are isolated to the current organization and branch.</p></div>{printers.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">No printers configured yet.</div> : <div className="divide-y divide-black/5 dark:divide-white/5">{printers.map(p => <div key={p.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-500">{p.connection === 'usb' ? <Usb className="w-5 h-5"/> : <Network className="w-5 h-5"/>}</div><div><p className="font-black">{p.name}</p><p className="text-xs text-slate-500">{destinations.find(d => d.value === p.destination)?.label} · {p.connection.toUpperCase()} · {p.connection === 'usb' ? p.usbPrinterName : `${p.ipAddress}:${p.port}`}</p></div></div><div className="flex items-center gap-2"><span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${p.status === 'online' ? 'bg-emerald-500/10 text-emerald-600' : p.status === 'offline' ? 'bg-red-500/10 text-red-600' : 'bg-slate-500/10 text-slate-500'}`}>{p.status}</span><button onClick={() => testPrinter(p)} disabled={testing === p.id} className="px-3 py-2 rounded-xl bg-blue-500/10 text-blue-700 text-xs font-bold">{testing === p.id ? <Loader2 className="w-3.5 h-3.5 inline animate-spin"/> : <Wifi className="w-3.5 h-3.5 inline"/>} Test</button><button onClick={() => remove(p.id)} className="px-3 py-2 rounded-xl bg-red-500/10 text-red-600 text-xs font-bold"><X className="w-3.5 h-3.5 inline"/> Remove</button></div></div>)}</div>}</section>
      {showAdd && <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"><form onSubmit={addPrinter} className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#151517] p-6 shadow-2xl space-y-4"><div className="flex items-center justify-between"><div><h2 className="text-xl font-black">Add printer</h2><p className="text-xs text-slate-500">Configure the printer once. KROWN uses it automatically.</p></div><button type="button" onClick={() => setShowAdd(false)}><X/></button></div><input required value={form.name} onChange={e => setForm({...form,name:e.target.value})} placeholder="Printer name" className="w-full rounded-xl border p-3 bg-transparent"/><select value={form.destination} onChange={e => setForm({...form,destination:e.target.value as PrinterDestination})} className="w-full rounded-xl border p-3 bg-transparent">{destinations.map(d=><option key={d.value} value={d.value}>{d.label}</option>)}</select><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setForm({...form,connection:'usb'})} className={`p-3 rounded-xl border font-bold ${form.connection==='usb'?'border-orange-500 bg-orange-500/10':''}`}><Usb className="w-4 h-4 inline mr-1"/>USB</button><button type="button" onClick={() => setForm({...form,connection:'lan'})} className={`p-3 rounded-xl border font-bold ${form.connection==='lan'?'border-orange-500 bg-orange-500/10':''}`}><Network className="w-4 h-4 inline mr-1"/>LAN</button></div>{form.connection==='usb' ? <select required value={form.usbPrinterName} onChange={e=>setForm({...form,usbPrinterName:e.target.value})} className="w-full rounded-xl border p-3 bg-transparent"><option value="">Select detected USB printer</option>{thermal.map(p=><option key={p.name} value={p.name}>{p.name} · {p.port}</option>)}</select> : <div className="grid grid-cols-3 gap-2"><input required value={form.ipAddress} onChange={e=>setForm({...form,ipAddress:e.target.value})} placeholder="192.168.1.34" className="col-span-2 rounded-xl border p-3 bg-transparent"/><input required type="number" value={form.port} onChange={e=>setForm({...form,port:e.target.value})} className="rounded-xl border p-3 bg-transparent"/></div>}<select value={form.paperWidth} onChange={e=>setForm({...form,paperWidth:e.target.value as '58mm'|'80mm'})} className="w-full rounded-xl border p-3 bg-transparent"><option value="80mm">80mm</option><option value="58mm">58mm</option></select><button className="w-full rounded-xl bg-orange-500 text-white p-3 font-black">Save printer</button></form></div>}
    </div>
  </div>;
}
