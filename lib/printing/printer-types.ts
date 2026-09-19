export type PrinterConnection = 'usb' | 'lan';
export type PrinterDestination = 'receipt' | 'kitchen' | 'bar' | 'report' | 'packing' | 'custom';
export type PrinterStatus = 'online' | 'offline' | 'unknown' | 'disabled';

export interface PrinterConfig {
  id: string;
  organizationId: string;
  branchId: string;
  name: string;
  destination: PrinterDestination;
  connection: PrinterConnection;
  usbPrinterName?: string;
  ipAddress?: string;
  port?: number;
  protocol?: 'browser-direct-usb' | 'browser-direct-serial' | 'epson-epos' | 'raw-tcp-bridge';
  vendorId?: number;
  productId?: number;
  serialNumber?: string;
  deviceId?: string;
  paperWidth: '58mm' | '80mm';
  enabled: boolean;
  status: PrinterStatus;
  lastSeenAt?: string | null;
  lastTestAt?: string | null;
}

export interface DiscoveredPrinter {
  name: string;
  port?: string;
  driver?: string;
  network?: boolean;
  offline?: boolean;
  status?: number;
  likelyThermal?: boolean;
}
