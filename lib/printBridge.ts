// KROWN local print bridge client
// The browser talks to the local bridge for silent printing, while Neon remains
// the authoritative print-job record. The bridge never needs direct DB credentials.

import { dataStore } from './dataStore';

export interface PrinterBridgeConfig {
  enabled: boolean;
  bridgeHost: string;
  bridgePort: number;
  kitchenIp: string;
  kitchenPort: number;
  receiptIp: string;
  receiptPort: number;
  receiptMode?: 'usb' | 'lan';
  receiptPrinterName?: string;
  paperWidth: '80mm' | '58mm';
}

const CONFIG_KEY = 'krown_printer_bridge_config';

export function getPrinterConfig(): PrinterBridgeConfig {
  const defaultConfig: PrinterBridgeConfig = {
    enabled: true,
    bridgeHost: '127.0.0.1',
    bridgePort: 9101,
    kitchenIp: '',
    kitchenPort: 9100,
    receiptIp: '',
    receiptPort: 9100,
    receiptMode: 'usb',
    receiptPrinterName: '',
    paperWidth: '80mm',
  };

  if (typeof window === 'undefined') return defaultConfig;
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return { ...defaultConfig, ...JSON.parse(raw) };
  } catch {
    // Keep safe defaults if local configuration is corrupt.
  }
  return defaultConfig;
}

export function setPrinterConfig(cfg: Partial<PrinterBridgeConfig>) {
  const merged = { ...getPrinterConfig(), ...cfg };
  if (typeof window !== 'undefined') {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(merged));
  }
  return merged;
}

async function updateServerPrintJob(jobId: string, status: 'PRINTED' | 'FAILED' | 'QUEUED', details: { lastError?: string | null; attempts?: number } = {}) {
  try {
    await dataStore.updatePrintJobStatus(jobId, status, {
      printedAt: status === 'PRINTED' ? Date.now() : undefined,
      lastError: details.lastError ?? undefined,
      attempts: details.attempts,
    });
  } catch (error) {
    // Printing must not be declared failed merely because status reconciliation failed.
    // The Neon job can be reconciled by the retry/status UI later.
    console.warn(`[PrintBridge] Could not reconcile Neon job ${jobId}:`, error);
  }
}

/**
 * Ask the local agent for printer discovery information.
 * This is intentionally local-only; printer hardware must never be exposed to the cloud.
 */
export async function discoverLocalPrinters(): Promise<any[]> {
  const cfg = getPrinterConfig();
  try {
    const res = await fetch(`http://${cfg.bridgeHost}:${cfg.bridgePort}/printers/discover`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.printers) ? data.printers : [];
  } catch {
    return [];
  }
}

/**
 * Verify the local bridge and a configured printer without producing a normal receipt.
 */
export async function testNetworkPrinter(target: string = 'kitchen', port: number = 9100): Promise<boolean> {
  const cfg = getPrinterConfig();
  const host = cfg.bridgeHost || '127.0.0.1';
  const bridgePort = cfg.bridgePort || 9101;

  try {
    const res = await fetch(`http://${host}:${bridgePort}/printers/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        target,
        ip: target === 'kitchen' ? cfg.kitchenIp : cfg.receiptIp,
        port: target === 'kitchen' ? cfg.kitchenPort : (cfg.receiptPort || port),
        printerName: target === 'receipt' ? cfg.receiptPrinterName : undefined,
        mode: target === 'receipt' ? cfg.receiptMode : 'lan',
      }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.ok === true || data.status === 'CONNECTED';
  } catch {
    return false;
  }
}

export async function sendToNetworkPrinter(
  text: string,
  kind: 'kitchen' | 'receipt',
  jobId: string,
  orderId: string,
  type: 'KITCHEN_TICKET' | 'BILL' | 'CUSTOMER_RECEIPT',
  paperWidth: '80mm' | '58mm' = '80mm'
): Promise<boolean> {
  const cfg = getPrinterConfig();
  if (!cfg.enabled) {
    await updateServerPrintJob(jobId, 'FAILED', { lastError: 'Local printing is disabled on this POS station.', attempts: 1 });
    return false;
  }

  const host = cfg.bridgeHost || '127.0.0.1';
  const port = cfg.bridgePort || 9101;
  const mode = kind === 'receipt' ? (cfg.receiptMode || 'usb') : 'lan';
  const ip = kind === 'kitchen' ? cfg.kitchenIp : cfg.receiptIp;
  const printerPort = Number(kind === 'kitchen' ? (cfg.kitchenPort || 9100) : (cfg.receiptPort || 9100));

  try {
    const res = await fetch(`http://${host}:${port}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        id: jobId,
        orderId,
        type,
        destination: `${kind === 'kitchen' ? 'Kitchen' : 'Receipt'} Printer`,
        printer_id: kind,
        payload: text,
        mode,
        ip,
        port: printerPort,
        printerName: kind === 'receipt' ? cfg.receiptPrinterName : undefined,
        paperWidth,
      }),
    });

    const responseBody = await res.json().catch(() => ({}));

    if (!res.ok || responseBody.ok === false) {
      const message = responseBody.error || `Bridge returned ${res.status}`;
      await updateServerPrintJob(jobId, 'FAILED', { lastError: message, attempts: 1 });
      return false;
    }

    // IMPORTANT: the old implementation printed successfully but left the Neon job
    // in `pending` forever. Reconcile immediately after the local bridge confirms
    // delivery so the cloud queue reflects the actual printer result.
    await updateServerPrintJob(jobId, 'PRINTED', { attempts: 1 });
    return true;
  } catch (err: any) {
    const message = `Local print bridge unavailable: ${err?.message || 'connection failed'}`;
    await updateServerPrintJob(jobId, 'QUEUED', { lastError: message, attempts: 1 });
    return false;
  }
}

export async function retryNetworkPrintJob(jobId: string): Promise<boolean> {
  const cfg = getPrinterConfig();
  await updateServerPrintJob(jobId, 'QUEUED', { lastError: null, attempts: 0 });
  try {
    const res = await fetch(`http://${cfg.bridgeHost}:${cfg.bridgePort}/print/retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ id: jobId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function sendTestPrintTicket(ip: string, port: number = 9100, target?: 'kitchen' | 'receipt'): Promise<{ ok: boolean; status: string; error?: string }> {
  const cfg = getPrinterConfig();
  const host = cfg.bridgeHost || '127.0.0.1';
  const bridgePort = cfg.bridgePort || 9101;

  try {
    const res = await fetch(`http://${host}:${bridgePort}/print/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ip,
        port,
        target,
        mode: target === 'receipt' ? cfg.receiptMode : 'lan',
        printerName: target === 'receipt' ? cfg.receiptPrinterName : undefined,
      }),
    });
    return res.ok ? await res.json() : { ok: false, status: 'FAILED', error: `Bridge returned ${res.status}` };
  } catch (err: any) {
    return { ok: false, status: 'FAILED', error: err?.message || 'Bridge unreachable' };
  }
}
