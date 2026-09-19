# Magallanes Pharmacy — POS & Inventory

A browser-based point-of-sale system for a community pharmacy. Runs entirely
offline using IndexedDB. No backend, no build step.

## Live demo
https://grevhenq.github.io/MagallanesPharmacy/

## Features
- Point of Sale with barcode scanning and product search
- Senior Citizen / PWD discount with correct VAT-exempt math
  (VAT-inclusive ÷ 1.12, then × 0.80; never stacked)
- Prescription capture with doctor linking via PRC licence
- 57 mm thermal receipt, dynamic height, Libre Franklin font
- Inventory, batches, expiry tracking, movement log
- Sales analytics, receipts database, PDF printing
- Multi-user login with roles (Administrator, Cashier, Inventory, Manager)
- Local persistence via IndexedDB

## Demo accounts
| Username | Password | Role |
|----------|----------|------|
| `admin` | `admin123` | Administrator |
| `cashier` | `cashier123` | Cashier |
| `inventory` | `inventory123` | Inventory Staff |
| `manager` | `manager123` | Manager |

## Running locally
```bash
git clone https://github.com/grevhenq/MagallanesPharmacy.git
cd MagallanesPharmacy
python3 -m http.server 8000