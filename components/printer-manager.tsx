'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Network, Plus, Printer, RefreshCw, Usb, X } from 'lucide-react';
import type { DiscoveredPrinter, PrinterConfig, PrinterDestination } from '@/lib/printing/printer-types';
import { getDirectPrintCapabilities, getRememberedSerialPrinters, getRememberedUsbPrinters, pairSerialPrinter, pairUsbPrinter, printEpsonEpos, printSerial, printUsb } from '@/lib/printing/direct-print';

const BRIDGE = 'http://127.0.0.1:9101';
const STORAGE = 'krown_printer_manager_v2';
const destinations: { value: PrinterDestination; label: string }[] = [
  { value: 'receipt', label: 'Receipt' }, { value: 'kitchen', label: 'Kitchen' }, { value: 'bar', label: 'Bar' },
  { value: 'report', label: 'Reports' }, { value: 'packing', label: 'Packing' }, { value: 'custom', label: 'Custom' },
];

function loadSaved(): PrinterConfig[] {
  try { return JSON.parse(localStorage.getItem(STORAGE) || '[]'); } catch { return []; }
}
function saveSaved(value: PrinterConfig[]) { localStorage.setItem(STORAGE, JSON.stringify(value)); }

export default function PrinterManager({ organizationId = 'local', branchId = 'local-branch' }: { organizationId?: string; branchId?: string }) {
  const [printers, setPrinters] = useState<PrinterConfig[]>([]);
  const [discovered, setDiscovered] = useState<DiscoveredPrinter[]>([]);
  const [direct, setDirect] = useState<Array<{ name: string; transport: string; vendorId?: number; productId?: number; serialNumber?: string }>>([]);
  const [bridgeOnline, setBridgeOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({
    name: '', destination: 'receipt' as PrinterDestination, connection: 'usb' as 'usb' | 'lan',
    protocol: 'browser-direct-usb' as 'browser-direct-usb' | 'browser-direct-serial' | 'epson-epos' | 'raw-tcp-bridge',
    usb: null as { name: string; transport: 'webusb' | 'webserial'; vendorId?: number; productId?: number; serialNumber?: string } | null,
    ipAddress: '', port: '8008', deviceId: 'local_printer', paperWidth: '80mm' as '58mm' | '80mm',
  });

  const discover = useCallback(async () => {
    setLoading(true); setError(''); setNotice('');
    const caps = getDirectPrintCapabilities();
    try {
      const [usb, serial] = await Promise.all([getRememberedUsbPrinters(), getRememberedSerialPrinters()]);
      setDirect([...usb, ...serial].map((p) => ({ name: p.name || 'USB printer', transport: p.transport, vendorId: p.vendorId, productId: p.productId, serialNumber: p.serialNumber })));
    } catch { setDirect([]); }

    try {
      const health = await fetch(`${BRIDGE}/health`, { cache: 'no-store' });
      setBridgeOnline(health.ok);
      if (health.ok) {
        const response = await fetch(`${BRIDGE}/printers/discover`, { cache: 'no-store' });
        const data = await response.json();
        setDiscovered(Array.isArray(data.printers) ? data.printers : []);
      } else setDiscovered([]);
    } catch {
      setBridgeOnline(false); setDiscovered([]);
    }

    if (!caps.webUsb && !caps.webSerial) {
      setNotice('Direct USB is unavailable in this browser. Use Chrome or Edge over HTTPS for browser-direct USB printing.');
    } else if (!caps.secureContext) {
      setNotice('KROWN must be opened over HTTPS for direct printer access.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const saved = loadSaved().filter(p => p.organizationId === organizationId && p.branchId === branchId);
    setPrinters(saved);
    void discover();
  }, [organizationId, branchId, discover]);

  const thermal = useMemo(() => discovered.filter(p => p.likelyThermal), [discovered]);

  function persist(next: PrinterConfig[]) {
    const other = loadSaved().filter(p => !(p.organizationId === organizationId && p.branchId === branchId));
    saveSaved([...other, ...next]); setPrinters(next);
  }

  async function pairUsb() {
    setError(''); setNotice('');
    try {
      const p = await pairUsbPrinter();
      setForm(v => ({ ...v, connection: 'usb', protocol: 'browser-direct-usb', usb: { name: p.name || 'USB printer', transport: 'webusb', vendorId: p.vendorId, productId: p.productId, serialNumber: p.serialNumber } }));
      setNotice(`Connected to ${p.name || 'USB printer'}. Save it to make it the branch printer.`);
      setShowAdd(true);
    } catch (e: any) { setError(e?.message || 'USB pairing failed.'); }
  }

  async function pairSerial() {
    setError(''); setNotice('');
    try {
      const p = await pairSerialPrinter();
      setForm(v => ({ ...v, connection: 'usb', protocol: 'browser-direct-serial', usb: { name: p.name || 'USB/Serial printer', transport: 'webserial', vendorId: p.vendorId, productId: p.productId } }));
      setNotice('USB/Serial printer paired. Save it to make it the branch printer.');
      setShowAdd(true);
    } catch (e: any) { setError(e?.message || 'Serial pairing failed.'); }
  }

  function addPrinter(e: React.FormEvent) {
    e.preventDefault(); setError('');
    if (form.connection === 'usb' && !form.usb) { setError('Pair the USB printer first.'); return; }
    if (form.connection === 'lan' && !/^([0-9]{1,3}\.){3}[0-9]{1,3}$/.test(form.ipAddress.trim())) { setError('Enter a valid LAN printer IP address.'); return; }
    const item: PrinterConfig = {
      id: crypto.randomUUID(), organizationId, branchId, name: form.name.trim() || `${form.destination} printer`,
      destination: form.destination, connection: form.connection,
      usbPrinterName: form.usb?.name,
      ipAddress: form.connection === 'lan' ? form.ipAddress.trim() : undefined,
      port: form.connection === 'lan' ? Number(form.port || 8008) : undefined,
      protocol: form.protocol, vendorId: form.usb?.vendorId, productId: form.usb?.productId, serialNumber: form.usb?.serialNumber,
      deviceId: form.connection === 'lan' ? form.deviceId.trim() || 'local_printer' : undefined,
      paperWidth: form.paperWidth, enabled: true, status: 'unknown',
    };
    persist([...printers, item]); setShowAdd(false);
    setForm({ name: '', destination: 'receipt', connection: 'usb', protocol: 'browser-direct-usb', usb: null, ipAddress: '', port: '8008', deviceId: 'local_printer', paperWidth: '80mm' });
  }

  async function testPrinter(printer: PrinterConfig) {
    setTesting(printer.id); setError(''); setNotice('');
    const payload = { branchName: 'KROWN PRINTER TEST', id: 'TEST', table: 'TEST', type: 'CUSTOMER_RECEIPT' as const, items: [{ name: 'Printer connection test', quantity: 1, price: 0 }], total: 0 };
    try {
      if (printer.protocol === 'browser-direct-usb' && printer.vendorId && printer.productId) {
        await printUsb({ transport: 'webusb', name: printer.usbPrinterName, vendorId: printer.vendorId, productId: printer.productId, serialNumber: printer.serialNumber }, payload);
      } else if (printer.protocol === 'browser-direct-serial') {
        await printSerial({ transport: 'webserial', name: printer.usbPrinterName, vendorId: printer.vendorId, productId: printer.productId }, payload);
      } else if (printer.protocol === 'epson-epos') {
        await printEpsonEpos({ transport: 'epson-epos', name: printer.name, ipAddress: printer.ipAddress, port: printer.port, deviceId: printer.deviceId }, payload);
      } else {
        if (!bridgeOnline) throw new Error('This printer uses raw LAN/Windows printing, which browsers cannot access directly. Connect KROWN Print Engine or choose a browser-direct printer.');
        const body = printer.connection === 'usb'
          ? { mode: 'usb', printerName: printer.usbPrinterName, paperWidth: printer.paperWidth }
          : { mode: 'lan', ip: printer.ipAddress, port: printer.port || 9100, paperWidth: printer.paperWidth };
        const response = await fetch(`${BRIDGE}/print/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.status !== 'PRINTED') throw new Error(data.error || 'Print Engine test failed.');
      }
      persist(printers.map(p => p.id === printer.id ? { ...p, status: 'online', lastTestAt: new Date().toISOString() } : p));
      setNotice(`${printer.name} printed successfully.`);
    } catch (e: any) {
      persist(printers.map(p => p.id === printer.id ? { ...p, status: 'offline' } : p));
      setError(e?.message || 'Printer test failed.');
    } finally { setTesting(null); }
  }

  function remove(id: string) { persist(printers.filter(p => p.id !== id)); }

  return <div className="min-h-screen bg-[#F4F4F6] dark:bg-[#0A0A0C] p-5 sm:p-8 text-slate-900 dark:text-white">
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div><div className="flex items-center gap-3"><Printer className="w-7 h-7 text-orange-500"/><h1 className="text-2xl font-black">KROWN Printing OS</h1></div><p className="text-sm text-slate-500 mt-1">Browser-direct printing first. No CMD window, daemon or Task Scheduler is required for supported printers.</p></div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void discover()} className="px-4 py-2.5 rounded-xl bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 font-bold text-sm"><RefreshCw className="w-4 h-4 inline mr-2"/>Refresh</button>
          <button onClick={pairUsb} className="px-4 py-2.5 rounded-xl bg-orange-500 text-white font-bold text-sm"><Usb className="w-4 h-4 inline mr-2"/>Pair USB</button>
          <button onClick={pairSerial} className="px-4 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-sm">Pair Serial</button>
          <button onClick={() => setShowAdd(true)} className="px-4 py-2.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold text-sm"><Plus className="w-4 h-4 inline mr-2"/>Add LAN</button>
        </div>
      </header>

      {notice && <div className="rounded-2xl bg-blue-500/10 border border-blue-500/20 p-4 text-sm font-semibold text-blue-700 dark:text-blue-300"><CheckCircle2 className="w-4 h-4 inline mr-2"/>{notice}</div>}
      {error && <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-4 text-sm font-semibold text-red-600 dark:text-red-400"><AlertTriangle className="w-4 h-4 inline mr-2"/>{error}</div>}

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-3xl bg-white/80 dark:bg-[#121214]/80 border p-5"><p className="text-xs text-slate-500">Browser Direct USB</p><p className="mt-1 font-black">{getDirectPrintCapabilities().webUsb ? 'Available' : 'Unavailable'}</p></div>
        <div className="rounded-3xl bg-white/80 dark:bg-[#121214]/80 border p-5"><p className="text-xs text-slate-500">Remembered devices</p><p className="mt-1 text-2xl font-black">{direct.length}</p></div>
        <div className="rounded-3xl bg-white/80 dark:bg-[#121214]/80 border p-5"><p className="text-xs text-slate-500">Print Engine</p><p className={`mt-1 font-black ${bridgeOnline ? 'text-emerald-500' : 'text-slate-400'}`}>{bridgeOnline ? 'Optional / online' : 'Not running'}</p></div>
        <div className="rounded-3xl bg-white/80 dark:bg-[#121214]/80 border p-5"><p className="text-xs text-slate-500">Configured</p><p className="mt-1 text-2xl font-black">{printers.length}</p></div>
      </section>

      <section className="rounded-3xl bg-white/80 dark:bg-[#121214]/80 border overflow-hidden">
        <div className="p-5 border-b"><h2 className="font-black">Browser-direct devices</h2><p className="text-xs text-slate-500 mt-1">These devices can print without a KROWN local service when the browser grants access.</p></div>
        {direct.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No remembered direct devices. Use Pair USB or Pair Serial once.</div> : <div className="divide-y">{direct.map((p,i)=><div key={`${p.transport}-${p.vendorId}-${p.productId}-${i}`} className="p-4 flex items-center justify-between"><div><p className="font-bold">{p.name}</p><p className="text-xs text-slate-500">{p.transport} · {p.vendorId ? `VID ${p.vendorId.toString(16)}` : ''} {p.productId ? `PID ${p.productId.toString(16)}` : ''}</p></div><CheckCircle2 className="text-emerald-500 w-5 h-5"/></div>)}</div>}
      </section>

      <section className="rounded-3xl bg-white/80 dark:bg-[#121214]/80 border overflow-hidden">
        <div className="p-5 border-b"><h2 className="font-black">Configured printers</h2><p className="text-xs text-slate-500 mt-1">Settings are isolated to this organization and branch. Actual persistence will move to the printer configuration tables before production.</p></div>
        {loading ? <div className="p-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto"/></div> : printers.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">No printers configured.</div> : <div className="divide-y">{printers.map(p=><div key={p.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"><div><p className="font-black">{p.name}</p><p className="text-xs text-slate-500">{destinations.find(d=>d.value===p.destination)?.label} · {p.protocol} · {p.connection==='lan'?`${p.ipAddress}:${p.port}`:p.usbPrinterName}</p></div><div className="flex gap-2 items-center"><span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${p.status==='online'?'bg-emerald-500/10 text-emerald-600':p.status==='offline'?'bg-red-500/10 text-red-600':'bg-slate-500/10 text-slate-500'}`}>{p.status}</span><button onClick={()=>void testPrinter(p)} disabled={testing===p.id} className="px-3 py-2 rounded-xl bg-blue-500/10 text-blue-700 text-xs font-bold">{testing===p.id?<Loader2 className="w-3.5 h-3.5 inline animate-spin"/>:'Test'}</button><button onClick={()=>remove(p.id)} className="px-3 py-2 rounded-xl bg-red-500/10 text-red-600 text-xs font-bold"><X className="w-3.5 h-3.5 inline"/></button></div></div>)}</div>}
      </section>

      {showAdd && <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"><form onSubmit={addPrinter} className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#151517] p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between"><div><h2 className="text-xl font-black">Configure printer</h2><p className="text-xs text-slate-500">Choose a browser-direct USB/Serial device or an HTTP-capable LAN printer.</p></div><button type="button" onClick={()=>setShowAdd(false)}><X/></button></div>
        <input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Printer name" className="w-full rounded-xl border p-3 bg-transparent"/>
        <select value={form.destination} onChange={e=>setForm({...form,destination:e.target.value as PrinterDestination})} className="w-full rounded-xl border p-3 bg-transparent">{destinations.map(d=><option key={d.value} value={d.value}>{d.label}</option>)}</select>
        <div className="grid grid-cols-2 gap-2"><button type="button" onClick={()=>setForm({...form,connection:'usb',protocol:'browser-direct-usb'})} className={`p-3 rounded-xl border font-bold ${form.connection==='usb'?'border-orange-500 bg-orange-500/10':''}`}><Usb className="w-4 h-4 inline mr-1"/>USB</button><button type="button" onClick={()=>setForm({...form,connection:'lan',protocol:'epson-epos'})} className={`p-3 rounded-xl border font-bold ${form.connection==='lan'?'border-orange-500 bg-orange-500/10':''}`}><Network className="w-4 h-4 inline mr-1"/>LAN</button></div>
        {form.connection==='usb' ? <div className="space-y-2"><div className="p-3 rounded-xl bg-slate-500/10 text-sm">{form.usb ? <><b>{form.usb.name}</b><br/><span className="text-xs text-slate-500">{form.usb.transport}</span></> : 'No direct USB device paired yet.'}</div><button type="button" onClick={pairUsb} className="w-full rounded-xl border p-3 font-bold">Pair USB printer</button><button type="button" onClick={pairSerial} className="w-full rounded-xl border p-3 font-bold">Use USB/Serial printer</button></div> : <div className="space-y-2"><select value={form.protocol} onChange={e=>setForm({...form,protocol:e.target.value as any})} className="w-full rounded-xl border p-3 bg-transparent"><option value="epson-epos">Epson ePOS / browser HTTP</option><option value="raw-tcp-bridge">Generic TCP/9100 (requires optional Print Engine)</option></select><input required value={form.ipAddress} onChange={e=>setForm({...form,ipAddress:e.target.value})} placeholder="Printer IP e.g. 192.168.1.34" className="w-full rounded-xl border p-3 bg-transparent"/><div className="grid grid-cols-2 gap-2"><input required type="number" value={form.port} onChange={e=>setForm({...form,port:e.target.value})} placeholder="Port" className="rounded-xl border p-3 bg-transparent"/><input value={form.deviceId} onChange={e=>setForm({...form,deviceId:e.target.value})} placeholder="Device ID" className="rounded-xl border p-3 bg-transparent"/></div></div>}
        <select value={form.paperWidth} onChange={e=>setForm({...form,paperWidth:e.target.value as '58mm'|'80mm'})} className="w-full rounded-xl border p-3 bg-transparent"><option value="80mm">80mm</option><option value="58mm">58mm</option></select>
        <button className="w-full rounded-xl bg-orange-500 text-white p-3 font-black">Save printer</button>
      </form></div>}
    </div>
  </div>;
}
