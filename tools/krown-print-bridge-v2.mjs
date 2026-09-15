#!/usr/bin/env node
/**
 * KROWN Print Bridge v2
 *
 * Local-only print agent. It never connects directly to Neon/Supabase and never
 * stores cloud credentials. The browser sends an authenticated KROWN print-job
 * payload to localhost, and this agent talks to the physical printer.
 *
 * Supported transports:
 *   - Windows USB printer queue via the Windows Print Spooler (RAW)
 *   - LAN ESC/POS printer via TCP 9100 (configurable)
 *
 * Endpoints:
 *   GET  /health
 *   GET  /printers/discover
 *   POST /printers/test
 *   POST /print
 *   POST /print/test
 *   POST /print/retry
 */
import http from 'node:http';
import net from 'node:net';
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = Number(process.env.KROWN_PRINT_BRIDGE_PORT || process.argv[2] || 9101);
const IS_WIN = process.platform === 'win32';

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5_000_000) req.destroy(new Error('Payload too large'));
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function escPos(payload, paperWidth = '80mm') {
  const ESC = 0x1b, GS = 0x1d;
  const width = paperWidth === '58mm' ? 32 : 48;
  const chunks = [Buffer.from([ESC, 0x40]), Buffer.from([ESC, 0x74, 0x00])];
  const txt = value => Buffer.from(String(value ?? '').replace(/[^\x00-\x7F]/g, '?') + '\n', 'ascii');
  const left = value => chunks.push(Buffer.from([ESC, 0x61, 0x00]), txt(value));
  const center = value => chunks.push(Buffer.from([ESC, 0x61, 0x01]), txt(value));
  const divider = char => left(String(char || '-').slice(0, 1).repeat(width));
  const lr = (a, b) => {
    const right = String(b ?? '');
    const maxLeft = Math.max(1, width - right.length - 1);
    const leftText = String(a ?? '').slice(0, maxLeft);
    left(leftText + ' '.repeat(Math.max(1, width - leftText.length - right.length)) + right);
  };

  if (typeof payload === 'string') {
    for (const line of payload.split(/\r?\n/)) left(line);
  } else {
    const order = payload || {};
    const items = Array.isArray(order.items) ? order.items : [];
    chunks.push(Buffer.from([GS, 0x21, 0x11]), Buffer.from([ESC, 0x45, 0x01]));
    center('KROWN ERP');
    chunks.push(Buffer.from([GS, 0x21, 0x00]), Buffer.from([ESC, 0x45, 0x00]));
    center(String(order.branchName || 'KROWN RESTAURANT').toUpperCase());
    divider('=');
    center(order.type === 'KITCHEN_TICKET' ? '*** KITCHEN ORDER TICKET ***' : '*** PAYMENT RECEIPT ***');
    divider('-');
    lr('ORDER:', `#${String(order.id || '').slice(-8).toUpperCase()}`);
    lr('TABLE:', order.table || 'T1');
    for (const item of items) {
      const qty = Number(item.quantity || 1);
      const price = Number(item.price || 0) * qty;
      lr(`${qty}x ${item.name || 'Item'}`, order.type === 'KITCHEN_TICKET' ? `x${qty}` : `UGX ${price.toLocaleString()}`);
    }
    divider('=');
    if (order.type !== 'KITCHEN_TICKET') lr('TOTAL:', `UGX ${Number(order.total || 0).toLocaleString()}`);
    center('Thank you!');
    center('Powered by KROWN ERP');
  }

  chunks.push(Buffer.from([ESC, 0x64, 0x04]), Buffer.from([GS, 0x56, 0x01]));
  return Buffer.concat(chunks);
}

function tcpPrint(ip, port, buffer) {
  return new Promise((resolve, reject) => {
    if (!ip) return reject(new Error('Printer IP address is required'));
    const socket = net.createConnection({ host: ip, port: Number(port || 9100) });
    let settled = false;
    const fail = error => { if (!settled) { settled = true; socket.destroy(); reject(error); } };
    socket.setTimeout(5000, () => fail(new Error(`Printer timeout: ${ip}:${port}`)));
    socket.once('error', fail);
    socket.once('connect', () => {
      socket.write(buffer, error => {
        if (error) return fail(error);
        setTimeout(() => {
          if (settled) return;
          settled = true;
          socket.end();
          resolve(true);
        }, 150);
      });
    });
  });
}

function discoverWindowsPrinters() {
  if (!IS_WIN) return [];
  const script = `Get-CimInstance Win32_Printer | Select-Object Name,PortName,DriverName,Network,WorkOffline,PrinterStatus | ConvertTo-Json -Compress`;
  try {
    const raw = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { encoding: 'utf8', windowsHide: true, timeout: 5000 }).trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.map(p => ({
      name: p.Name,
      port: p.PortName,
      driver: p.DriverName,
      network: Boolean(p.Network),
      offline: Boolean(p.WorkOffline),
      status: p.PrinterStatus,
      likelyThermal: /thermal|receipt|xprinter|xprinter|rongta|epson|pos|bixolon|star|citizen|gprinter|80mm|58mm/i.test(`${p.Name} ${p.DriverName} ${p.PortName}`),
    }));
  } catch {
    return [];
  }
}

function pickUsbPrinter(requestedName) {
  const printers = discoverWindowsPrinters();
  if (requestedName) {
    const exact = printers.find(p => p.name?.toLowerCase() === String(requestedName).toLowerCase());
    if (exact) return exact;
  }
  return printers.find(p => p.likelyThermal && !p.offline) || printers.find(p => !p.network && !p.offline) || null;
}

function windowsRawPrint(printerName, buffer) {
  if (!IS_WIN) return Promise.reject(new Error('Windows spooler transport is only available on Windows'));
  if (!printerName) return Promise.reject(new Error('No USB printer was selected or detected'));

  const encoded = buffer.toString('base64');
  const script = `
$ErrorActionPreference='Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class KrownRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public class DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern IntPtr OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern int StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFO docInfo);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);
  public static void Print(string printer, byte[] data) {
    IntPtr h; if(OpenPrinter(printer, out h, IntPtr.Zero)==IntPtr.Zero) throw new Exception("OpenPrinter failed: " + Marshal.GetLastWin32Error());
    try {
      var d = new DOCINFO { pDocName="KROWN Receipt", pDataType="RAW" };
      if(StartDocPrinter(h,1,d)<=0) throw new Exception("StartDocPrinter failed: " + Marshal.GetLastWin32Error());
      try {
        if(!StartPagePrinter(h)) throw new Exception("StartPagePrinter failed: " + Marshal.GetLastWin32Error());
        try { int written; if(!WritePrinter(h,data,data.Length,out written) || written!=data.Length) throw new Exception("WritePrinter failed: " + Marshal.GetLastWin32Error()); }
        finally { EndPagePrinter(h); }
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
  }
}
'@
$data=[Convert]::FromBase64String('${encoded}')
[KrownRawPrinter]::Print('${String(printerName).replace(/'/g, "''")}', $data)
`;

  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true, timeout: 15000 }, (error, stdout, stderr) => {
      if (error) return reject(new Error((stderr || stdout || error.message).trim()));
      resolve(true);
    });
  });
}

async function print(payload) {
  const buffer = escPos(payload.payload ?? payload.text ?? '', payload.paperWidth || '80mm');
  const mode = payload.mode || (payload.type === 'KITCHEN_TICKET' ? 'lan' : 'usb');

  if (mode === 'usb') {
    const printer = pickUsbPrinter(payload.printerName);
    if (!printer) throw new Error('No available USB thermal printer was detected in Windows.');
    await windowsRawPrint(printer.name, buffer);
    return { printer: printer.name, mode: 'usb' };
  }

  await tcpPrint(payload.ip, Number(payload.port || 9100), buffer);
  return { printer: `${payload.ip}:${Number(payload.port || 9100)}`, mode: 'lan' };
}

async function testPrinter(payload) {
  const mode = payload.mode || (payload.target === 'receipt' ? 'usb' : 'lan');
  const testPayload = { type: 'CUSTOMER_RECEIPT', branchName: 'KROWN PRINTER TEST', id: 'TEST', table: 'TEST', items: [{ name: 'Printer connection test', quantity: 1, price: 0 }], total: 0, paperWidth: '80mm' };
  return print({ ...payload, mode, payload: testPayload });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' });
      return res.end();
    }
    if (req.method === 'GET' && req.url === '/health') return json(res, 200, { ok: true, service: 'krown-print-bridge', version: 2, platform: process.platform });
    if (req.method === 'GET' && req.url === '/printers/discover') return json(res, 200, { ok: true, printers: discoverWindowsPrinters() });

    if (req.method === 'POST' && (req.url === '/print' || req.url === '/print/test' || req.url === '/printers/test')) {
      const body = await readBody(req);
      if (req.url === '/printers/test') {
        const result = await testPrinter(body);
        return json(res, 200, { ok: true, status: 'CONNECTED', ...result });
      }
      const result = req.url === '/print/test' ? await testPrinter(body) : await print(body);
      return json(res, 200, { ok: true, status: 'PRINTED', ...result });
    }

    if (req.method === 'POST' && req.url === '/print/retry') return json(res, 200, { ok: true, status: 'QUEUED' });
    return json(res, 404, { ok: false, error: 'Not found' });
  } catch (error) {
    return json(res, 500, { ok: false, status: 'FAILED', error: error?.message || String(error) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[KROWN] Print Bridge v2 listening on http://127.0.0.1:${PORT}`);
  console.log(`[KROWN] Platform: ${os.platform()} | USB auto-discovery: ${IS_WIN ? 'enabled' : 'Windows only'}`);
});
