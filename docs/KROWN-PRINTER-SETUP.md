# KROWN Printer Setup Protocol

## Goal

KROWN printing must be silent, automatic and recoverable after the cashier has completed a sale.

The browser must never open a print dialog for thermal receipts.

The hosted KROWN server must never attempt to access a customer's USB printer directly.

The architecture is:

```text
KROWN Web App
     |
     | localhost HTTP
     v
KROWN Print Bridge v2
     |
     +---- Windows Print Spooler ---- USB Receipt Printer
     |
     +---- TCP 9100 ---------------- LAN Receipt/Kitchen Printer
```

## Printer Settings

Every POS station should have a Printer Settings page with these sections:

### Receipt Printer

Fields:

- Enabled
- Connection: USB / LAN
- USB printer: auto-detected Windows printer queue
- LAN IP address
- LAN port (default 9100)
- Paper width: 58mm / 80mm
- Test Print
- Connection status

### Kitchen Printer

Fields:

- Enabled
- Connection: LAN
- IP address
- Port (default 9100)
- Paper width: 58mm / 80mm
- Test Print
- Connection status

## USB behavior

When the cashier PC has a supported thermal printer connected through USB and Windows has installed it as a printer queue:

1. KROWN detects the local print bridge.
2. KROWN asks the bridge for available Windows printers.
3. The bridge identifies likely thermal/receipt printers.
4. The selected printer is saved locally on that POS station.
5. After payment, KROWN sends the receipt to localhost.
6. The bridge sends ESC/POS RAW bytes through the Windows Print Spooler.
7. KROWN marks the Neon print job PRINTED only after the bridge confirms success.

No browser dialog should appear.

## LAN behavior

For an Ethernet thermal printer:

1. Enter the printer IP address once.
2. Default port is 9100.
3. KROWN sends ESC/POS directly through the local bridge.
4. The bridge reports success/failure.
5. KROWN updates the corresponding Neon print job.

The POS station and printer must be reachable on the same LAN/VLAN.

## Automatic startup

Install the bridge once using:

`tools/setup-autostart-windows.bat`

The Windows startup task launches:

`tools/start-print-bridge.bat`

The startup script must contain NO database credentials, Supabase keys or Neon credentials.

## Failure behavior

If the bridge is offline:

- Sale/payment must still complete.
- The receipt job remains QUEUED/PENDING.
- The UI must clearly show printer offline.
- No duplicate order or payment may be created.
- When the bridge returns, queued print jobs can be retried.

If the printer is offline:

- Do not mark the job PRINTED.
- Store the error.
- Allow retry from Printer Settings / Receipts.

## Neon rules

`print_jobs` remains the authoritative cloud record.

A successful local print must reconcile the job to:

`PRINTED`

A failed local print must reconcile to:

`FAILED`

An unavailable local bridge should leave the job retryable:

`QUEUED`

Do not use Supabase as a second print queue.

## Security

The local bridge must not contain:

- Neon DATABASE_URL
- Neon passwords
- Supabase service-role keys
- JWT signing secrets
- customer credentials

The bridge only communicates with localhost and the local printer network.

## Production safety

Printer configuration is station-local unless a future server-side printer registry is explicitly introduced.

Do not delete existing print jobs.

Do not delete orders.

Do not alter payment records to repair printing.

Printing failures must never be repaired by modifying financial records.
