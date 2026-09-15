import { formatUGX } from './mockData';
import { sendToNetworkPrinter, getPrinterConfig } from './printBridge';
import { jsPDF } from 'jspdf';

function wrapText(text: string, maxLength: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  words.forEach((word) => {
    if ((currentLine + (currentLine ? ' ' : '') + word).length <= maxLength) currentLine += (currentLine ? ' ' : '') + word;
    else { if (currentLine) lines.push(currentLine); currentLine = word; }
  });
  if (currentLine) lines.push(currentLine);
  return lines;
}

export function generateFormattedThermalReceipt(
  order: any,
  paperWidth: '80mm' | '58mm' = '80mm',
  ticketType: 'receipt' | 'prep' | 'cashier_order' | 'split' = 'receipt',
  splitData?: { splitIndex: number; totalSplits: number; amount: number; paymentMethod: string; seatCovered?: string; guestLabel?: string; guestItems?: { name: string; price: number; quantity: number; amount: number }[] }
): string {
  const lineCharLength = paperWidth === '58mm' ? 32 : 48;
  const divider = '-'.repeat(lineCharLength);
  const doubleDivider = '='.repeat(lineCharLength);
  const centerText = (text: string) => {
    if (text.length >= lineCharLength) return text.slice(0, lineCharLength);
    return ' '.repeat(Math.floor((lineCharLength - text.length) / 2)) + text;
  };
  const formatLine = (left: string, right: string) => {
    const spaceAvailable = lineCharLength - right.length;
    if (left.length > spaceAvailable - 1) left = left.slice(0, spaceAvailable - 1);
    return left + ' '.repeat(Math.max(1, spaceAvailable - left.length)) + right;
  };

  if (ticketType === 'prep') {
    let text = '';
    text += centerText('KROWN ERP') + '\n';
    text += centerText('*** KITCHEN ORDER TICKET ***') + '\n';
    text += doubleDivider + '\n';
    text += formatLine('TABLE:', `${order.table || 'T1'}`) + '\n';
    text += formatLine('AREA:', `${order.place || 'Main Dining'}`) + '\n';
    text += formatLine('TYPE:', `${order.type || 'Dine In'}`) + '\n';
    text += formatLine('TIME:', new Date(order.createdAt || Date.now()).toLocaleTimeString()) + '\n';
    text += formatLine('ORDER #:', `#${(order.id || '').toUpperCase().slice(-8)}`) + '\n';
    text += doubleDivider + '\n';
    text += formatLine('ITEM', 'QTY') + '\n';
    text += divider + '\n';
    if (order.items && Array.isArray(order.items)) {
      order.items.forEach((item: any) => {
        const itemTitle = `${item.name}`;
        const qtyStr = `x${item.quantity}`;
        const wrappedLines = wrapText(itemTitle, lineCharLength - qtyStr.length - 2);
        text += formatLine(wrappedLines[0], qtyStr) + '\n';
        for (let i = 1; i < wrappedLines.length; i++) text += wrappedLines[i] + '\n';
        if (item.addOns?.length) item.addOns.forEach((a: any) => text += wrapText(`  + ${a.name}`, lineCharLength).join('\n') + '\n');
        if (item.note) text += wrapText(`  >> ${item.note.toUpperCase()}`, lineCharLength).join('\n') + '\n';
        text += '\n';
      });
    }
    text += doubleDivider + '\n';
    text += centerText(`TOTAL ITEMS: ${(order.items || []).reduce((s: number, i: any) => s + (i.quantity || 1), 0)}`) + '\n';
    text += doubleDivider + '\n\n\n';
    return text;
  }

  // Receipt identity is tenant/branch data captured during onboarding and resolved from
  // the authoritative order. Never fall back to a platform label when the restaurant is known.
  const restaurantName = order.organizationName || order.organization_name || order.restaurantName || order.restaurant_name || '';
  const branchName = order.branchName || order.branch_name || '';
  const branchAddress = order.branchAddress || order.branch_address || order.branchLocation || order.branch_location || order.location || '';
  const branchPhone = order.branchPhone || order.branch_phone || '';
  const branchTaxId = order.branchTaxId || order.branch_tax_id || '';
  const dateStr = new Date(order.createdAt || order.created_at || Date.now()).toLocaleString();
  const total = order.total || 0;
  let text = '';
  text += centerText(String(restaurantName || branchName || 'Restaurant').toUpperCase()) + '\n';
  if (branchName && String(branchName).toUpperCase() !== String(restaurantName).toUpperCase()) text += centerText(String(branchName).toUpperCase()) + '\n';
  if (branchAddress) text += centerText(String(branchAddress)) + '\n';
  if (branchPhone) text += centerText(branchTaxId ? `TEL: ${branchPhone} | TIN: ${branchTaxId}` : `TEL: ${branchPhone}`) + '\n';
  else if (branchTaxId) text += centerText(`TIN: ${branchTaxId}`) + '\n';
  text += doubleDivider + '\n';
  if (ticketType === 'cashier_order') text += centerText('*** CUSTOMER BILL - UNPAID ***') + '\n';
  else if (ticketType === 'split' && splitData) text += centerText(`*** SPLIT RECEIPT (${splitData.splitIndex}/${splitData.totalSplits}) ***`) + '\n';
  else text += centerText('*** OFFICIAL PAYMENT RECEIPT ***') + '\n';
  text += formatLine('ORDER NUMBER:', `#${(order.id || '').toUpperCase()}`) + '\n';
  text += formatLine('TABLE ID:', `${order.table || order.table_number || 'T1'}`) + '\n';
  text += formatLine('SEATING AREA:', `${order.place || 'Main Dining'}`) + '\n';
  text += formatLine('SEAT / COVER:', `${order.seat || 'Whole Table'}`) + '\n';
  text += formatLine('ORDER TYPE:', `${order.type || 'Dine In'}`) + '\n';
  text += formatLine('DATE / TIME:', dateStr) + '\n';
  if (ticketType === 'split' && splitData) {
    if (splitData.guestLabel) text += formatLine('GUEST:', splitData.guestLabel) + '\n';
    text += formatLine('PAYMENT METHOD:', splitData.paymentMethod) + '\n';
    if (splitData.seatCovered) text += formatLine('SPLIT SEAT:', splitData.seatCovered) + '\n';
  } else if (ticketType === 'receipt') text += formatLine('PAYMENT METHOD:', order.paymentMethod || order.payment_method || 'Paid') + '\n';
  if ((order.tinNumber || order.tin_number) && ticketType === 'receipt') text += formatLine('CUSTOMER TIN:', order.tinNumber || order.tin_number) + '\n';
  if (order.isCorporateCredit || order.is_corporate_credit || order.paymentMethod === 'Corporate Credit' || order.payment_method === 'Corporate Credit') {
    text += divider + '\n';
    text += centerText('*** CORPORATE CREDIT ACCOUNT ***') + '\n';
    text += formatLine('Company:', order.companyName || order.company_name || 'Corporate Client') + '\n';
    if (order.companyStaffName || order.company_staff_name) text += formatLine('Billed Staff:', order.companyStaffName || order.company_staff_name) + '\n';
    if (order.workId || order.work_id) text += formatLine('Staff Work ID:', order.workId || order.work_id) + '\n';
  }
  text += divider + '\n';
  text += formatLine('ITEM DESCRIPTION', 'PRICE') + '\n';
  text += divider + '\n';
  if (ticketType === 'split' && splitData?.guestItems?.length) {
    splitData.guestItems.forEach((it: any) => {
      const leftText = `${it.quantity}x ${it.name}`;
      const rightText = formatUGX(it.amount);
      const wrappedLines = wrapText(leftText, lineCharLength - rightText.length - 2);
      text += formatLine(wrappedLines[0], rightText) + '\n';
      for (let i = 1; i < wrappedLines.length; i++) text += wrappedLines[i] + '\n';
    });
  } else if (order.items && Array.isArray(order.items)) {
    order.items.forEach((item: any) => {
      const itemTitle = `${item.quantity}x ${item.name}`;
      const addOnsTotal = (item.addOns || []).reduce((s: number, a: any) => s + (a.price * (item.quantity || 1)), 0);
      const itemPriceStr = formatUGX(((item.price || item.unitPrice || 0) * item.quantity) + addOnsTotal);
      const wrappedLines = wrapText(itemTitle, lineCharLength - itemPriceStr.length - 2);
      text += formatLine(wrappedLines[0], itemPriceStr) + '\n';
      for (let i = 1; i < wrappedLines.length; i++) text += wrappedLines[i] + '\n';
      if (item.addOns?.length) item.addOns.forEach((a: any) => text += formatLine(`   + ${a.name}`, formatUGX(a.price * (item.quantity || 1))) + '\n');
      if (item.note || item.notes) text += '  ' + wrapText(`(Note: ${item.note || item.notes})`, lineCharLength - 4).join('\n  ') + '\n';
    });
  }
  text += divider + '\n';
  if (ticketType === 'split' && splitData) {
    text += formatLine('Full Order Total:', formatUGX(total)) + '\n';
    text += doubleDivider + '\n';
    text += formatLine(`THIS SPLIT (${splitData.splitIndex}/${splitData.totalSplits}):`, formatUGX(splitData.amount)) + '\n';
    text += doubleDivider + '\n';
    text += centerText('Thank you for dining with us!') + '\n';
    text += centerText('Powered by KROWN ERP') + '\n\n\n';
    return text;
  }
  text += doubleDivider + '\n';
  if (ticketType === 'cashier_order') {
    text += formatLine('TOTAL DUE:', formatUGX(total)) + '\n';
    text += doubleDivider + '\n';
    text += centerText('*** CUSTOMER BILL - UNPAID ***') + '\n';
  } else {
    text += formatLine('TOTAL AMOUNT PAID:', formatUGX(total)) + '\n';
    if (order.amountReceived || order.amount_received) text += formatLine('CASH RECEIVED:', formatUGX(order.amountReceived || order.amount_received)) + '\n';
    if (order.change !== undefined || order.change_amount !== undefined) text += formatLine('CHANGE DUE:', formatUGX(order.change !== undefined ? order.change : order.change_amount)) + '\n';
    text += doubleDivider + '\n';
    text += centerText('*** PAID - THANK YOU ***') + '\n';
  }
  text += centerText('Powered by KROWN ERP') + '\n\n\n';
  return text;
}

export function downloadReceiptFile(order: any) {
  const text = generateFormattedThermalReceipt(order, '80mm', 'receipt');
  const lines = text.split('\n');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: [226.8, Math.max(300, (lines.length * 11) + 40)] });
  doc.setFont('Courier', 'normal');
  doc.setFontSize(8.5);
  let y = 20;
  lines.forEach((line) => { doc.text(line, 10, y); y += 11; });
  doc.save(`Receipt_${(order.id || 'order').toUpperCase()}.pdf`);
}

/** Create the authoritative Neon print job first, then send its real ID to the local bridge. */
async function createServerPrintJob(input: {
  orderId?: string;
  type: 'KITCHEN_TICKET' | 'BILL' | 'CUSTOMER_RECEIPT';
  destination: string;
  printerId: 'kitchen' | 'receipt';
  payload: string;
}): Promise<{ id: string }> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('krown_session_token') || '' : '';
  const res = await fetch('/api/print-jobs', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.data?.id) {
    throw new Error(body?.error || `Unable to create print job (${res.status})`);
  }
  return { id: String(body.data.id) };
}

export async function printTicket(
  ticketType: 'receipt' | 'prep' | 'cashier_order' | 'split' = 'receipt',
  order: any,
  paperWidth: '80mm' | '58mm' = '80mm',
  splitData?: any
): Promise<boolean> {
  console.log(`[PRINTER] Printing ${ticketType} ticket for order:`, order.id);
  const formattedText = generateFormattedThermalReceipt(order, paperWidth, ticketType, splitData);
  const kind: 'kitchen' | 'receipt' = ticketType === 'prep' ? 'kitchen' : 'receipt';
  const typeMap = { prep: 'KITCHEN_TICKET', cashier_order: 'BILL', receipt: 'CUSTOMER_RECEIPT', split: 'CUSTOMER_RECEIPT' } as const;
  const dbType = typeMap[ticketType] || 'CUSTOMER_RECEIPT';
  const destination = `${kind === 'kitchen' ? 'Kitchen' : 'Receipt'} Printer`;

  const serverJob = await createServerPrintJob({ orderId: order.id, type: dbType, destination, printerId: kind, payload: formattedText });
  const cfg = getPrinterConfig();
  await sendToNetworkPrinter(formattedText, kind, serverJob.id, order.id, dbType, paperWidth);
  console.log(`[PRINTER] Server job ${serverJob.id} (${ticketType}) dispatched to local bridge.`);
  return true;
}

export async function autoPrintKitchenTicket(order: any) {
  console.log('[PRINTER] Sending Kitchen Order Ticket for order:', order.id);
  await printTicket('prep', order, '80mm');
}

export async function autoPrintOrderTickets(order: any) {
  console.log('[PRINTER MULTI-DISPATCH] Dispatching tickets for order:', order.id);
  await printTicket('prep', order, '80mm');
  await printTicket('cashier_order', order, '80mm');
}
