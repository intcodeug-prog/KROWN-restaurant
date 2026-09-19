/* KROWN Direct Print
 * Browser-first printing transports.
 *
 * Supported without a local daemon:
 * - USB ESC/POS through WebUSB when the browser can claim the printer interface.
 * - USB/serial ESC/POS through Web Serial when the printer exposes a serial interface.
 * - LAN Epson ePOS over HTTP/HTTPS for printers exposing ePOS-Print.
 *
 * Important: browsers cannot open arbitrary TCP sockets, so generic LAN port 9100
 * printers cannot be reached directly from a web page. Generic Windows USB
 * printer-class devices may also be owned by usbprint.sys and therefore unavailable
 * to WebUSB. The caller must surface these facts instead of reporting false success.
 */

export type DirectTransport = 'webusb' | 'webserial' | 'epson-epos';

export type DirectPrinterDescriptor = {
  transport: DirectTransport;
  name?: string;
  vendorId?: number;
  productId?: number;
  serialNumber?: string;
  ipAddress?: string;
  port?: number;
  deviceId?: string;
};

export type DirectPrintPayload = {
  branchName?: string;
  id?: string;
  table?: string;
  type?: 'KITCHEN_TICKET' | 'CUSTOMER_RECEIPT';
  total?: number;
  items?: Array<{ name: string; quantity?: number; price?: number }>;
  text?: string;
};

type USBEndpoint = { endpointNumber: number; direction: 'in' | 'out'; type?: string };
type USBInterface = { interfaceNumber: number; alternate: { interfaceClass?: number; endpoints?: USBEndpoint[] } };
type USBConfiguration = { interfaces: USBInterface[] };

type USBDeviceLike = {
  vendorId: number;
  productId: number;
  productName?: string;
  serialNumber?: string;
  configurations?: USBConfiguration[];
  opened?: boolean;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  releaseInterface(interfaceNumber: number): Promise<void>;
  transferOut(endpointNumber: number, data: BufferSource): Promise<{ status?: string }>;
};

type SerialPortLike = {
  getInfo(): { usbVendorId?: number; usbProductId?: number };
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  writable: WritableStream<Uint8Array> | null;
};

type USBNavigator = Navigator & {
  usb?: {
    getDevices(): Promise<USBDeviceLike[]>;
    requestDevice(options: { filters: Array<{ classCode?: number; vendorId?: number; productId?: number }> }): Promise<USBDeviceLike>;
  };
};

type SerialNavigator = Navigator & {
  serial?: {
    getPorts(): Promise<SerialPortLike[]>;
    requestPort(): Promise<SerialPortLike>;
  };
};

const encoder = new TextEncoder();

function xmlEscape(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildEscPos(payload: DirectPrintPayload): Uint8Array {
  const ESC = 0x1b;
  const GS = 0x1d;
  const width = 48;
  const lines: string[] = [];

  const leftRight = (left: string, right: string) => {
    const r = String(right).slice(0, width - 2);
    const l = String(left).slice(0, Math.max(1, width - r.length - 1));
    return l + ' '.repeat(Math.max(1, width - l.length - r.length)) + r;
  };

  lines.push('KROWN ERP');
  lines.push(String(payload.branchName || 'KROWN RESTAURANT').toUpperCase());
  lines.push('='.repeat(width));
  lines.push(payload.type === 'KITCHEN_TICKET' ? '*** KITCHEN ORDER TICKET ***' : '*** PAYMENT RECEIPT ***');
  lines.push('-'.repeat(width));
  lines.push(leftRight('ORDER:', '#' + String(payload.id || 'TEST').slice(-8).toUpperCase()));
  lines.push(leftRight('TABLE:', payload.table || 'T1'));

  for (const item of payload.items || []) {
    const quantity = Number(item.quantity || 1);
    if (payload.type === 'KITCHEN_TICKET') {
      lines.push(leftRight(quantity + 'x ' + item.name, 'x' + quantity));
    } else {
      lines.push(leftRight(quantity + 'x ' + item.name, 'UGX ' + (Number(item.price || 0) * quantity).toLocaleString()));
    }
  }

  lines.push('='.repeat(width));
  if (payload.type !== 'KITCHEN_TICKET') {
    lines.push(leftRight('TOTAL:', 'UGX ' + Number(payload.total || 0).toLocaleString()));
  }
  lines.push('');
  lines.push('Thank you!');
  lines.push('Powered by KROWN ERP');

  const bytes: number[] = [
    ESC, 0x40,
    ESC, 0x61, 0x01,
    ESC, 0x21, 0x10,
  ];

  for (const line of lines) {
    bytes.push(...encoder.encode(line + '\n'));
  }

  bytes.push(
    ESC, 0x21, 0x00,
    ESC, 0x64, 0x04,
    GS, 0x56, 0x01,
  );

  return new Uint8Array(bytes);
}

function getUsb(): NonNullable<USBNavigator['usb']> | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as USBNavigator).usb || null;
}

function getSerial(): NonNullable<SerialNavigator['serial']> | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as SerialNavigator).serial || null;
}

function isChromiumDirectUsbAvailable(): boolean {
  return Boolean(getUsb() && window.isSecureContext);
}

function findPrinterInterface(device: USBDeviceLike): { interfaceNumber: number; endpointNumber: number } | null {
  for (const configuration of device.configurations || []) {
    for (const iface of configuration.interfaces || []) {
      const alternate = iface.alternate;
      const isPrinterClass = alternate.interfaceClass === 7;
      const outEndpoint = (alternate.endpoints || []).find((endpoint) => endpoint.direction === 'out');
      if (isPrinterClass && outEndpoint) {
        return { interfaceNumber: iface.interfaceNumber, endpointNumber: outEndpoint.endpointNumber };
      }
    }
  }
  return null;
}

async function prepareUsb(device: USBDeviceLike) {
  if (!device.opened) await device.open();

  try {
    if (!device.configuration) await device.selectConfiguration(1);
  } catch {
    // The device may already have an active configuration.
  }

  const target = findPrinterInterface(device);

  if (!target) {
    throw new Error('KROWN could not find a writable USB printer interface. Windows may already own this printer through its printer driver.');
  }

  try {
    await device.claimInterface(target.interfaceNumber);
  } catch {
    throw new Error('This USB printer is controlled by the operating system driver and cannot be claimed directly by the browser. Use a printer with browser-direct USB support or KROWN Print Engine.');
  }

  return target;
}

export async function getRememberedUsbPrinters(): Promise<DirectPrinterDescriptor[]> {
  const usb = getUsb();
  if (!usb || !isChromiumDirectUsbAvailable()) return [];

  const devices = await usb.getDevices();
  return devices.map((device) => ({
    transport: 'webusb' as const,
    name: device.productName || 'USB thermal printer',
    vendorId: device.vendorId,
    productId: device.productId,
    serialNumber: device.serialNumber,
  }));
}

export async function pairUsbPrinter(): Promise<DirectPrinterDescriptor> {
  const usb = getUsb();
  if (!usb || !isChromiumDirectUsbAvailable()) {
    throw new Error('Direct USB printing requires Chrome or Edge on an HTTPS KROWN page.');
  }

  const device = await usb.requestDevice({ filters: [{ classCode: 7 }] });
  return {
    transport: 'webusb',
    name: device.productName || 'USB thermal printer',
    vendorId: device.vendorId,
    productId: device.productId,
    serialNumber: device.serialNumber,
  };
}

export async function printUsb(
  descriptor: DirectPrinterDescriptor,
  payload: DirectPrintPayload,
): Promise<{ transport: 'webusb'; printer: string }> {
  const usb = getUsb();
  if (!usb) throw new Error('WebUSB is unavailable in this browser.');

  const devices = await usb.getDevices();
  let device = devices.find(
    (candidate) =>
      candidate.vendorId === descriptor.vendorId &&
      candidate.productId === descriptor.productId &&
      (!descriptor.serialNumber || candidate.serialNumber === descriptor.serialNumber),
  );

  if (!device) {
    device = await usb.requestDevice({
      filters: [{ vendorId: descriptor.vendorId, productId: descriptor.productId }],
    });
  }

  const target = await prepareUsb(device);
  const data = buildEscPos(payload);

  // Keep USB packets modest for inexpensive ESC/POS controllers.
  for (let offset = 0; offset < data.length; offset += 4096) {
    await device.transferOut(target.endpointNumber, data.slice(offset, offset + 4096));
  }

  try {
    await device.releaseInterface(target.interfaceNumber);
  } finally {
    await device.close();
  }

  return { transport: 'webusb', printer: device.productName || descriptor.name || 'USB printer' };
}

export async function getRememberedSerialPrinters(): Promise<DirectPrinterDescriptor[]> {
  const serial = getSerial();
  if (!serial || !window.isSecureContext) return [];

  const ports = await serial.getPorts();
  return ports.map((port) => {
    const info = port.getInfo();
    return {
      transport: 'webserial' as const,
      name: 'USB/Serial thermal printer',
      vendorId: info.usbVendorId,
      productId: info.usbProductId,
    };
  });
}

export async function pairSerialPrinter(): Promise<DirectPrinterDescriptor> {
  const serial = getSerial();
  if (!serial || !window.isSecureContext) {
    throw new Error('Direct Serial printing requires Chrome or Edge on an HTTPS KROWN page.');
  }

  const port = await serial.requestPort();
  const info = port.getInfo();
  return {
    transport: 'webserial',
    name: 'USB/Serial thermal printer',
    vendorId: info.usbVendorId,
    productId: info.usbProductId,
  };
}

export async function printSerial(
  descriptor: DirectPrinterDescriptor,
  payload: DirectPrintPayload,
  baudRate = 9600,
): Promise<{ transport: 'webserial'; printer: string }> {
  const serial = getSerial();
  if (!serial) throw new Error('Web Serial is unavailable in this browser.');

  const ports = await serial.getPorts();
  let port = ports.find((candidate) => {
    const info = candidate.getInfo();
    return (!descriptor.vendorId || info.usbVendorId === descriptor.vendorId)
      && (!descriptor.productId || info.usbProductId === descriptor.productId);
  });

  if (!port) port = await serial.requestPort();
  await port.open({ baudRate });

  const writer = port.writable?.getWriter();
  if (!writer) {
    await port.close();
    throw new Error('The selected serial printer does not expose a writable serial stream.');
  }

  try {
    await writer.write(buildEscPos(payload));
  } finally {
    writer.releaseLock();
    await port.close();
  }

  return { transport: 'webserial', printer: descriptor.name || 'USB/Serial printer' };
}

export async function printEpsonEpos(
  descriptor: DirectPrinterDescriptor,
  payload: DirectPrintPayload,
): Promise<{ transport: 'epson-epos'; printer: string }> {
  if (!descriptor.ipAddress) throw new Error('LAN printer IP address is required.');

  const port = descriptor.port || 8008;
  const protocol = port === 443 ? 'https' : 'http';
  const endpoint = `${protocol}://${descriptor.ipAddress}:${port}/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000`;

  const items = (payload.items || []).map((item) =>
    `<text>${xmlEscape(Number(item.quantity || 1) + 'x ' + item.name)} ${xmlEscape(payload.type === 'KITCHEN_TICKET' ? '' : 'UGX ' + (Number(item.price || 0) * Number(item.quantity || 1)).toLocaleString())}&#10;</text>`,
  ).join('');

  const body =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<s:Body><epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">' +
    `<text lang="en"/><text align="center" width="2" height="2">KROWN ERP&#10;</text>` +
    `<text align="center">${xmlEscape(String(payload.branchName || 'KROWN RESTAURANT'))}&#10;</text>` +
    '<text>----------------------------------------------&#10;</text>' +
    `<text>${xmlEscape('ORDER #' + String(payload.id || 'TEST').slice(-8))}&#10;</text>` +
    `<text>${xmlEscape('TABLE: ' + String(payload.table || 'T1'))}&#10;</text>` +
    items +
    (payload.type === 'KITCHEN_TICKET' ? '' : `<text>----------------------------------------------&#10;TOTAL: UGX ${xmlEscape(Number(payload.total || 0).toLocaleString())}&#10;</text>`) +
    '<text>&#10;Thank you!&#10;</text><cut type="feed"/></epos-print></s:Body></s:Envelope>';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': '""',
      'If-Modified-Since': 'Thu, 01 Jan 1970 00:00:00 GMT',
    },
    body,
    cache: 'no-store',
  });

  if (!response.ok) throw new Error(`Epson ePOS printer returned HTTP ${response.status}.`);
  const text = await response.text();
  if (/success="false"|code="(?!0)/i.test(text)) {
    throw new Error('Epson ePOS rejected the print job.');
  }

  return { transport: 'epson-epos', printer: descriptor.ipAddress };
}

export function getDirectPrintCapabilities() {
  const secure = typeof window !== 'undefined' && window.isSecureContext;
  return {
    secureContext: secure,
    webUsb: secure && Boolean(getUsb()),
    webSerial: secure && Boolean(getSerial()),
    browser: typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent,
    note: 'Generic LAN TCP/9100 and Windows USB printer queues require a local transport; they are not browser-direct transports.',
  };
}
