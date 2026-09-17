#!/usr/bin/env node
/**
 * KROWN Print Engine v3-compatible transport layer.
 * Local-only: no Neon/Supabase credentials and no cloud network access.
 * USB uses the Windows print spooler; LAN uses TCP/9100 (configurable).
 */
import http from 'node:http';
import net from 'node:net';
import { execFile, execFileSync } from 'node:child_process';
import os from 'node:os';

const PORT = Number(process.env.KROWN_PRINT_BRIDGE_PORT || process.argv[2] || 9101);
const IS_WIN = process.platform === 'win32';

function headers() {
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': 'http://localhost:3000',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  };
}
function json(res, status, body) { res.writeHead(status, headers()); res.end(JSON.stringify(body)); }
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 5_000_000) req.destroy(new Error('Payload too large')); });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}
function discoverWindowsPrinters() {
  if (!IS_WIN) return [];
  try {
    const script = `Get-CimInstance Win32_Printer | Select-Object Name,PortName,DriverName,WorkOffline,PrinterStatus | ConvertTo-Json -Compress`;
    const raw = execFileSync('powershell.exe', ['-NoProfile','-NonInteractive','-Command',script], { encoding:'utf8', windowsHide:true, timeout:10000 }).trim();
    if (!raw) return [];
    const rows = JSON.parse(raw); const list = Array.isArray(rows) ? rows : [rows];
    return list.map(p => ({ name:p.Name, port:p.PortName, driver:p.DriverName, offline:!!p.WorkOffline, thermal:/pos|thermal|xprinter|receipt|80mm|58mm/i.test(`${p.Name} ${p.DriverName}`), connection:'usb' }));
  } catch { return []; }
}
function pickUsbPrinter(name) {
  const printers = discoverWindowsPrinters().filter(p => p.thermal && !p.offline);
  if (!printers.length) return null;
  return name ? printers.find(p => p.name === name) || null : printers[0];
}
function escPos(payload, paperWidth='80mm') {
  const ESC=0x1b, GS=0x1d, width=paperWidth==='58mm'?32:48;
  const chunks=[Buffer.from([ESC,0x40])];
  const txt=v=>Buffer.from(String(v??'').replace(/[^\x00-\x7F]/g,'?')+'\n','ascii');
  const left=v=>chunks.push(Buffer.from([ESC,0x61,0x00]),txt(v));
  const center=v=>chunks.push(Buffer.from([ESC,0x61,0x01]),txt(v));
  const divider=c=>left(String(c||'-').slice(0,1).repeat(width));
  const lr=(a,b)=>{const r=String(b??'');const l=String(a??'').slice(0,Math.max(1,width-r.length-1));left(l+' '.repeat(Math.max(1,width-l.length-r.length))+r);};
  if(typeof payload==='string'){for(const line of payload.split(/\r?\n/))left(line);}
  else { const order=payload||{}; const items=Array.isArray(order.items)?order.items:[]; center('KROWN ERP'); center(String(order.branchName||'KROWN RESTAURANT').toUpperCase()); divider('='); center(order.type==='KITCHEN_TICKET'?'*** KITCHEN ORDER TICKET ***':'*** PAYMENT RECEIPT ***'); divider('-'); lr('ORDER:',`#${String(order.id||'').slice(-8).toUpperCase()}`); lr('TABLE:',order.table||'T1'); for(const item of items) lr(`${item.quantity||1} x ${item.name||'Item'}`, item.price==null?'':Number(item.price).toLocaleString()); divider('-'); lr('TOTAL:',Number(order.total||0).toLocaleString()); left(''); left(''); }
  chunks.push(Buffer.from([GS,0x56,0x00])); return Buffer.concat(chunks);
}
function tcpPrint(ip,port,buffer){ return new Promise((resolve,reject)=>{ if(!ip) return reject(new Error('LAN printer IP is required')); const s=net.createConnection({host:ip,port},()=>s.end(buffer)); s.setTimeout(8000,()=>s.destroy(new Error('Printer connection timed out'))); s.on('error',reject); s.on('close',()=>resolve(true)); }); }
function windowsRawPrint(printerName,buffer){
  const encoded=buffer.toString('base64');
  const script=`Add-Type -TypeDefinition @'\nusing System; using System.Runtime.InteropServices; public class KrownRawPrinter { [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool OpenPrinter(string p, out IntPtr h, IntPtr d); [DllImport("winspool.drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr h); [DllImport("winspool.drv", CharSet=CharSet.Unicode)] public static extern bool StartDocPrinter(IntPtr h,int l,IntPtr di); [DllImport("winspool.drv")] public static extern bool EndDocPrinter(IntPtr h); [DllImport("winspool.drv")] public static extern bool StartPagePrinter(IntPtr h); [DllImport("winspool.drv")] public static extern bool EndPagePrinter(IntPtr h); [DllImport("winspool.drv")] public static extern bool WritePrinter(IntPtr h,byte[] b,int n,out int w); public static void Print(string p,byte[] b){IntPtr h;if(!OpenPrinter(p,out h,IntPtr.Zero))throw new Exception("OpenPrinter failed");try{StartDocPrinter(h,1,IntPtr.Zero);StartPagePrinter(h);int w;WritePrinter(h,b,b.Length,out w);EndPagePrinter(h);EndDocPrinter(h);}finally{ClosePrinter(h);}} }\n'@\n$data=[Convert]::FromBase64String('${encoded}')\n[KrownRawPrinter]::Print('${String(printerName).replace(/'/g,"''")}', $data)`;
  return new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',script],{windowsHide:true,timeout:15000},(e,out,err)=>e?reject(new Error((err||out||e.message).trim())):resolve(true)));
}
async function print(payload){ const buffer=escPos(payload.payload??payload.text??'',payload.paperWidth||'80mm'); const mode=payload.mode||(payload.type==='KITCHEN_TICKET'?'lan':'usb'); if(mode==='usb'){const p=pickUsbPrinter(payload.printerName);if(!p)throw new Error('No available USB thermal printer was detected in Windows.');await windowsRawPrint(p.name,buffer);return{printer:p.name,mode:'usb'};} await tcpPrint(payload.ip,Number(payload.port||9100),buffer);return{printer:`${payload.ip}:${Number(payload.port||9100)}`,mode:'lan'}; }
async function testPrinter(payload){ const mode=payload.mode||(payload.target==='receipt'?'usb':'lan'); const testPayload={type:'CUSTOMER_RECEIPT',branchName:'KROWN PRINTER TEST',id:'TEST',table:'TEST',items:[{name:'Printer connection test',quantity:1,price:0}],total:0,paperWidth:'80mm'}; return print({...payload,mode,payload:testPayload}); }

http.createServer(async(req,res)=>{try{if(req.method==='OPTIONS'){res.writeHead(204,headers());return res.end();}if(req.method==='GET'&&req.url==='/health')return json(res,200,{ok:true,service:'krown-print-engine',version:3,platform:process.platform});if(req.method==='GET'&&req.url==='/printers/discover')return json(res,200,{ok:true,printers:discoverWindowsPrinters()});if(req.method==='POST'&&(req.url==='/print'||req.url==='/print/test'||req.url==='/printers/test')){const body=await readBody(req);const result=req.url==='/printers/test'||req.url==='/print/test'?await testPrinter(body):await print(body);return json(res,200,{ok:true,status:'PRINTED',...result});}return json(res,404,{ok:false,error:'Not found'});}catch(e){return json(res,500,{ok:false,status:'FAILED',error:e?.message||String(e)});}}).listen(PORT,'127.0.0.1',()=>console.log(`[KROWN] Print Engine v3 listening on http://127.0.0.1:${PORT} | ${os.platform()}`));
