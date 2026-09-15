import { getSql } from '@/lib/neon-server';
import type { TenantContext } from '@/lib/tenant';
import { setTenantContext } from '@/lib/tenant';
import { generateId } from '@/lib/id';

export interface PrintJobInput {
  id?: string;
  orderId?: string;
  type: string;
  destination: string;
  printerId?: string;
  payload: any;
}

export interface PrintJob {
  id: string;
  order_id: string | null;
  type: string;
  destination: string;
  printer_id: string | null;
  payload: any;
  status: string;
  attempts: number;
  last_error: string | null;
  printed_at: any;
  branch_name: string | null;
  organization_id: string;
  created_at: any;
}

export async function listPrintJobs(ctx: TenantContext, orderId?: string): Promise<PrintJob[]> {
  const sql = getSql();
  await setTenantContext(sql, ctx.organizationId);
  if (orderId) {
    const rows = await sql`
      SELECT * FROM print_jobs
      WHERE order_id = ${orderId} AND organization_id = ${ctx.organizationId}
      ORDER BY created_at DESC
    ` as PrintJob[];
    return rows;
  }
  const rows = await sql`
    SELECT * FROM print_jobs
    WHERE organization_id = ${ctx.organizationId}
    ORDER BY created_at DESC
  ` as PrintJob[];
  return rows;
}

export async function createPrintJob(ctx: TenantContext, input: PrintJobInput): Promise<PrintJob> {
  const sql = getSql();
  await setTenantContext(sql, ctx.organizationId);

  // The browser creates the ID before dispatching to the local bridge. Preserve it so
  // the bridge, Neon queue and status-reconciliation endpoint all reference one job.
  const id = input.id || generateId();

  const rows = await sql`
    INSERT INTO print_jobs (
      id, order_id, type, destination, printer_id,
      payload, status, attempts, organization_id, created_at
    )
    VALUES (
      ${id},
      ${input.orderId ?? null},
      ${input.type},
      ${input.destination},
      ${input.printerId ?? null},
      ${JSON.stringify(input.payload)}::jsonb,
      'pending',
      0,
      ${ctx.organizationId},
      NOW()
    )
    RETURNING *
  ` as PrintJob[];

  return rows[0];
}

export async function updatePrintJobStatus(
  ctx: TenantContext,
  jobId: string,
  status: string,
  details?: { attempts?: number; lastError?: string; printedAt?: Date }
): Promise<PrintJob | null> {
  const sql = getSql();
  await setTenantContext(sql, ctx.organizationId);
  const setClauses: string[] = ['status = $1'];
  const values: any[] = [status];
  let paramIdx = 2;
  if (details?.attempts !== undefined) { setClauses.push(`attempts = $${paramIdx++}`); values.push(details.attempts); }
  if (details?.lastError !== undefined) { setClauses.push(`last_error = $${paramIdx++}`); values.push(details.lastError); }
  if (details?.printedAt !== undefined) { setClauses.push(`printed_at = $${paramIdx++}`); values.push(details.printedAt); }
  values.push(jobId, ctx.organizationId);
  const rows = await sql(
    `UPDATE print_jobs SET ${setClauses.join(', ')} WHERE id = $${paramIdx} AND organization_id = $${paramIdx + 1} RETURNING *`,
    values
  ) as PrintJob[];
  return rows.length > 0 ? rows[0] : null;
}
