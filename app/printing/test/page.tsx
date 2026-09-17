'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, Printer, RefreshCw, Usb, Wifi } from 'lucide-react';
import { discoverLocalPrinters } from '@/lib/printBridge';

export default function PrinterTestLab() {
  const [printers, setPrinters] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function scan() {
    setBusy(true); setResult(null);
    try { setPrinters(await discoverLocalPrinters()); }
    catch (e: any) { setResult({ ok: false, message: e.message || 'Discovery failed' }); }
    finally { setBusy(false); }
  }

  async function test(p: any) {
    setBusy(true); setResult(null);
    try {
      const body = p.port && /^\d+\.\d+\.\d+\.\d+$/.test(String(p.port))
        ? { mode: 'lan', ip: p.port, port: 9100, target: 'kitchen' }
        : { mode: 'usb', printerName: p.name, target: 'receipt' };
      const response = await fetch('http://127.0.0.1:9101/print/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      setResult({ ...data, printer: p.name });
    } catch (e: any) { setResult({ ok: false, message: e.message || 'KROWN Print Engine is not reachable' }); }
    finally { setBusy(false); }
  }

  useEffect(() => { scan(); }, []);

  return <main className="min-h-screen bg-[#F4F4F6] dark:bg-[#09090B] p-6 md:p-10"><div className="max-w-5xl mx-auto space-y-6">
    <header><p className="text-xs font-black uppercase tracking-[.18em] text-orange-500">KROWN QA</p><h1 className="text-3xl font-black text-slate-900 dark:text-white">Printer Test Lab</h1><p className="text-sm text-slate-500 mt-2">Safe local hardware testing. This page does not create orders or change restaurant data.</p></header>
    {result && <div className={`p-4 rounded-2xl ${result.ok ? 'bg-emerald-500/10 text-emerald-700' : 'bg-red-500/10 text-red-600'} font-semibold flex gap-2`}>{result.ok ? <CheckCircle2 className="w-5 h-5"/> : <CircleAlert className="w-5 h-5"/>}{result.message || result.status || (result.ok ? 'Test print sent successfully' : 'Test failed')}{result.printer ? ` · ${result.printer}` : ''}</div>}
    <section className="rounded-[2rem] bg-white dark:bg-[#121214] border border-black/5 dark:border-white/10 p-6 shadow-xl"><div className="flex items-center justify-between mb-5"><div><h2 className="font-black text-lg text-slate-900 dark:text-white">Local printers</h2><p className="text-xs text-slate-500">USB discovery is local to this computer. LAN printers can be tested when exposed by the Print Engine.</p></div><button onClick={scan} disabled={busy} className="px-4 py-2.5 rounded-xl bg-orange-500 text-white text-xs font-black flex gap-2"><RefreshCw className="w-4 h-4"/>Scan</button></div>
      <div className="space-y-3">{printers.map((p,i)=><div key={i} className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 flex items-center gap-4"><div className="w-11 h-11 rounded-xl bg-white dark:bg-black/20 flex items-center justify-center">{p.thermal ? <Usb className="w-5 h-5 text-orange-500"/> : <Wifi className="w-5 h-5 text-slate-400"/>}</div><div className="flex-1 min-w-0"><p className="font-bold text-slate-900 dark:text-white truncate">{p.name || 'Network printer'}</p><p className="text-xs text-slate-500">{p.port || 'Local device'} · {p.driver || 'Unknown driver'}</p></div><button onClick={()=>test(p)} disabled={busy} className="px-3 py-2 rounded-xl bg-blue-500/10 text-blue-700 text-xs font-bold">Print test</button></div>)}{printers.length===0 && <div className="py-12 text-center text-sm text-slate-500">No printers discovered. Make sure the KROWN Print Engine is installed and running, then scan again.</div>}</div>
    </section>
  </div></main>;
}
