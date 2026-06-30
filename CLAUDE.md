# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server (Express + Vite middleware, port 3000)
npm run build    # Build frontend (vite) + bundle server (esbuild -> dist/server.cjs)
npm run start    # Run production build from dist/
npm run lint     # TypeScript type-check (tsc --noEmit) — must always pass clean
npm run clean    # Remove dist/ and server.js
```

The dev server runs `tsx server.ts` which starts Express with Vite embedded as middleware. There is no separate frontend dev server — everything runs on port 3000.

## Architecture Overview

### The Two-Perspective Model

This is a simulation platform for preventive fire-protection maintenance (BMA, EMA, ELA, SLA, Lichtruf). The React app (`src/App.tsx`) renders two synchronized views side by side:

1. **Android Emulator Shell** — simulates a field technician's tablet/smartphone. Manages local protocol cache, QR-code login simulation, and offline fill-in of detector check tables.
2. **Central Office WebUI** (`src/components/CentralWebUI.tsx`) — the dispatch center's browser interface. Manages contracts, imports TAIFUN XML, views technician status, and downloads PDF reports.

State is shared through `App.tsx` as a single React global state, allowing both views to update each other in real time (simulating a synchronized network).

### Server (`server.ts`)

Single Express file that handles everything:
- **Dev mode**: wraps Vite's dev server as middleware; serves `index.html` through `vite.transformIndexHtml()`
- **Production**: serves static `dist/` assets
- **Database**: uses Node's native `node:sqlite` (`DatabaseSync` from `node:sqlite`) — not the `sqlite3` npm package. The DB lives at `server_stack/protocol_db/protocols.db`
- **Settings**: persisted as JSON at `server_stack/protocol_db/settings.json`; controls which system types (BMA/EMA/ELA/etc.) are active and their detector/value configurations
- **Samba shares**: `samba_shares/Protokolle/` for active PDFs, `samba_shares/Archiv/<ContractNumber>/<Year>/<H1|H2>/` for archived PDFs. Created automatically on first run.
- **Bootstrap**: schema applied via `server_stack/protocol_db/schema.sql`; dynamic column migration for `anlage_*` fields runs via silent `ALTER TABLE` attempts on startup

**Fixed constraints:** Server must listen on `0.0.0.0:3000`. Do not change port or Vite middleware integration without strong reason.

### Database Schema

Four core tables (see `server_stack/protocol_db/schema.sql`):

| Table | Purpose |
|---|---|
| `protocols` | One row per maintenance contract; stores columns/values/detector_types as JSON arrays |
| `protocol_groups` | Detector groups (rows in a checklist); linked to an `anlage_id` for multi-subsystem support |
| `group_cells` | Individual detector slots (slotKey × detectorType × value); foreign key to protocol_groups |
| `technicians` | Login accounts; passwords stored as SHA-256 hashes |

Plus two tables bootstrapped at startup: `pdf_templates` and `pdf_instances`.

The `protocol_groups` table has `anlage_id / anlage_name / anlage_type / anlage_address` columns that were added via migration — they may not exist in older DBs and are silently added on startup.

### Data Model Hierarchy

```
ProtocolItem (contract)
  └── subSystems[] (Anlage — a physical installation)
        └── rows[] (protocol group / detector group)
              └── cells[] (slotKey + detectorType + value)
```

The frontend uses `subSystems` for rendering; the DB stores groups flat with `anlage_id` to reconstruct subsystems on read. `rows` (flat, legacy) is also kept for backward compatibility.

### API Routes

| Route | Purpose |
|---|---|
| `GET /api/protocols` | List all contracts (filtered by active system types) |
| `GET /api/protocols/:id` | Full protocol detail with groups, cells, and archive list |
| `POST /api/protocols/save` | Upsert protocol with all groups/cells (transactional) |
| `POST /api/protocols/delete/:id` | Delete protocol and cascading children |
| `POST /api/protocols/reset/:id` | Archive current PDF and clear cell values for new cycle |
| `POST /api/import-taifun` | Import TAIFUN XML — supports both `<WtVt>` (new) and `<Vertrag>` (legacy) formats |
| `POST /api/import` | Import ESSER `.etb`, CSV/XLSX, Notifier, or Hekatron files |
| `GET /api/settings` / `POST /api/settings` | Read/write active system types and detector configs |
| `GET /api/technicians` | List technicians |
| `GET /download_pdf/:contractNum` | Download active PDF from samba_shares/Protokolle/ |
| `GET /download_archive/:contractNumber/:year/:halfYear/:filename` | Download archived PDF |
| `GET /webui` | Serve legacy Alpine.js WebUI from server_stack/webui/templates/index.html |

### TypeScript

All shared types live in `src/types.ts`. When adding new data models, define interfaces there first.

**Never use `const enum`** — use standard `enum` declarations.

### Frontend Stack

- React 19 + Vite 6 + Tailwind CSS v4 (via `@tailwindcss/vite` plugin)
- `motion` (Framer Motion) for animations
- `lucide-react` for icons
- `@vitejs/plugin-react` (SWC-based)
- Path alias `@` resolves to the project root

### Production Deployment (Docker)

`docker-compose.yml` at root defines a 5-service stack:

| Service | Role |
|---|---|
| `webui` | Internal management WebUI (port 8080, internal LAN only) |
| `netlink` | Android-facing encrypted API (port 3360→3000, WAN) |
| `protocol_db` | Alpine container holding the shared SQLite volume |
| `protocol_core` | Background worker for evaluation/backup |
| `samba` | Network file share for PDFs (optional if external NAS is used) |

`db_data` and `samba_data` are shared Docker volumes. To use a physical NAS instead of the samba service, switch volume driver to `cifs` or use a bind mount (see comments in `docker-compose.yml`).

### Android App (`android-project/`)

A separate Kotlin/Jetpack Compose project. **Not built by npm** — must be opened in Android Studio (Koala+) with Java 17 JDK. Uses:
- Room (offline SQLite) + Dagger Hilt
- Retrofit + `CryptoInterceptor.kt` for transparent AES-256-GCM over HTTP
- `MainViewModel.kt` with a `sync_queue` for offline-first upload

### Crypto Protocol (`protocol-specification.md`)

The Android ↔ server protocol uses:
- **Key derivation**: PBKDF2-HMAC-SHA256, 100,000 iterations, fixed salt `ENO_AUSLOESELISTE_v1`, 32-byte output
- **Encryption**: AES-256-GCM, 12-byte random IV per message, 16-byte auth tag
- **Wire format**: `base64( iv[12] || ciphertext[N] || tag[16] )`
- **Auth header**: `X-Auth` carries AES-GCM-encrypted `{"user":"...","pass":"..."}` JSON
- Cross-platform verification: use `crypto_reference.py` in the project root to validate bit-identical test vectors

### Legacy Backend (`server_stack/`)

Python-based services (webui Flask app, netlink handler, protocol_core worker). These are the original Docker services and serve as reference implementations. The `server_stack/webui/templates/index.html` is the Alpine.js-based legacy UI still accessible at `/webui`.
