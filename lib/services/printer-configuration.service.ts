import { getSql } from '@/lib/neon-server';
import { assertBranchAccess } from '@/lib/access-control';
import type { TenantContext } from '@/lib/tenant';

export type PrinterType = 'receipt' | 'kitchen' | 'bar' | 'report' | 'label' | 'other';
export type ConnectionType = 'usb' | 'lan';

export interface PrinterConfigurationInput {
  name: string;
  printerType: PrinterType;
  connectionType: ConnectionType;
  usbPrinterName?: string | null;
  usbPort?: string | null;
  ipAddress?: string | null;
  port?: number;
  paperWidth?: '58mm' | '80mm';
  enabled?: boolean;
}

const TYPES = new Set<PrinterType>(['receipt','kitchen','bar','report','label','other']);
const CONNECTIONS = new Set<ConnectionType>(['usb','lan']);

function validateInput(input: PrinterConfigurationInput) {
  if (!input.name?.trim()) throw new Error('Printer name is required');
  if (!TYPES.has(input.printerType)) throw new Error('Invalid printer type');
  if (!CONNECTIONS.has(input.connectionType)) throw new Error('Invalid connection type');
  const port = input.port ?? 9100;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid printer port');
  if (input.paperWidth && input.paperWidth !== '58mm' && input.paperWidth !== '80mm') throw new Error('Invalid paper width');
  if (input.connectionType === 'lan' && !input.ipAddress?.trim()) throw new Error('LAN printers require an IP address');
  if (input.connectionType === 'usb' && !input.usbPrinterName?.trim()) throw new Error('USB printers require a detected printer name');
}

export async function listPrinters(ctx: TenantContext, branchId: string) {
  await assertBranchAccess(ctx, branchId);
  const sql = getSql();
  return await sql`
    SELECT * FROM printer_configurations
    WHERE organization_id = ${ctx.organizationId} AND branch_id = ${branchId}
    ORDER BY printer_type, name
  `;
}

export async function createPrinter(ctx: TenantContext, branchId: string, input: PrinterConfigurationInput) {
  await assertBranchAccess(ctx, branchId);
  validateInput(input);
  const sql = getSql();
  const rows = await sql`
    INSERT INTO printer_configurations
      (organization_id, branch_id, name, printer_type, connection_type,
       usb_printer_name, usb_port, ip_address, port, paper_width, enabled, status, updated_at)
    VALUES
      (${ctx.organizationId}, ${branchId}, ${input.name.trim()}, ${input.printerType}, ${input.connectionType},
       ${input.usbPrinterName?.trim() || null}, ${input.usbPort?.trim() || null},
       ${input.ipAddress?.trim() || null}, ${input.port ?? 9100}, ${input.paperWidth ?? '80mm'},
       ${input.enabled ?? true}, 'unknown', NOW())
    RETURNING *
  `;
  return rows[0];
}

export async function updatePrinter(ctx: TenantContext, branchId: string, id: string, input: Partial<PrinterConfigurationInput>) {
  await assertBranchAccess(ctx, branchId);
  const sql = getSql();
  const existing = await sql`SELECT * FROM printer_configurations WHERE id=${id} AND organization_id=${ctx.organizationId} AND branch_id=${branchId} LIMIT 1`;
  if (!existing.length) throw new Error('Printer not found');
  const merged = { ...existing[0] as any,
    name: input.name ?? existing[0].name,
    printerType: input.printerType ?? existing[0].printer_type,
    connectionType: input.connectionType ?? existing[0].connection_type,
    usbPrinterName: input.usbPrinterName ?? existing[0].usb_printer_name,
    usbPort: input.usbPort ?? existing[0].usb_port,
    ipAddress: input.ipAddress ?? existing[0].ip_address,
    port: input.port ?? existing[0].port,
    paperWidth: input.paperWidth ?? existing[0].paper_width,
    enabled: input.enabled ?? existing[0].enabled,
  } as PrinterConfigurationInput;
  validateInput(merged);
  const rows = await sql`
    UPDATE printer_configurations SET
      name=${merged.name.trim()}, printer_type=${merged.printerType}, connection_type=${merged.connectionType},
      usb_printer_name=${merged.usbPrinterName?.trim() || null}, usb_port=${merged.usbPort?.trim() || null},
      ip_address=${merged.ipAddress?.trim() || null}, port=${merged.port ?? 9100},
      paper_width=${merged.paperWidth ?? '80mm'}, enabled=${merged.enabled ?? true}, updated_at=NOW()
    WHERE id=${id} AND organization_id=${ctx.organizationId} AND branch_id=${branchId}
    RETURNING *
  `;
  return rows[0];
}

export async function deletePrinter(ctx: TenantContext, branchId: string, id: string) {
  await assertBranchAccess(ctx, branchId);
  const sql = getSql();
  const rows = await sql`DELETE FROM printer_configurations WHERE id=${id} AND organization_id=${ctx.organizationId} AND branch_id=${branchId} RETURNING id`;
  if (!rows.length) throw new Error('Printer not found');
  return { success: true, id };
}

export async function updatePrinterHealth(ctx: TenantContext, branchId: string, id: string, status: 'online'|'offline'|'error'|'unknown', error?: string | null) {
  await assertBranchAccess(ctx, branchId);
  const sql = getSql();
  const rows = await sql`
    UPDATE printer_configurations
    SET status=${status}, last_seen_at=${status === 'online' ? new Date() : null}, last_test_at=NOW(), last_error=${error || null}, updated_at=NOW()
    WHERE id=${id} AND organization_id=${ctx.organizationId} AND branch_id=${branchId}
    RETURNING *
  `;
  if (!rows.length) throw new Error('Printer not found');
  return rows[0];
}
