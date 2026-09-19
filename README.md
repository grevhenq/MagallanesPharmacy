# Magallanes Pharmacy — POS & Inventory

Browser-based point-of-sale for a community pharmacy. Runs entirely offline using IndexedDB. No backend, no build step.

## Live app
https://grevhenq.github.io/MagallanesPharmacy/

## How it works
- **No login page.** The POS opens straight away.
- **Every privileged action asks for a password.** The staff member selects their name and types their password, and that action is recorded against them.
- **Voiding a transaction** requires an Administrator password.
- **Destructive data actions** (wipe everything, change staff passwords) require Administrator.

## Demo staff
| Name | Username | Password | Role |
|------|----------|----------|------|
| Ana Magallanes | `admin` | `admin123` | Administrator |
| Rina Bautista | `cashier` | `cashier123` | Cashier |
| Marco Aguilar | `inventory` | `inventory123` | Inventory Staff |
| Elena Reyes | `manager` | `manager123` | Manager |

## Features
- Point of Sale with barcode scanning
- Senior Citizen / PWD discount using correct VAT-exempt math
  (VAT-inclusive ÷ 1.12, then × 0.80, per eligible item, never stacked)
- Prescription capture with doctor linking via PRC licence
- 57 mm thermal receipt, dynamic height, Libre Franklin font
- Inventory overview and movement log
- Sales analytics
- Receipt database
- Audit log of every action

## Running locally
```bash
git clone https://github.com/grevhenq/MagallanesPharmacy.git
cd MagallanesPharmacy
python3 -m http.server 8000