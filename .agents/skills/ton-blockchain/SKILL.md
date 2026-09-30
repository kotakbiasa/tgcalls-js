---
name: ton-blockchain
version: 1.0.0
description: >
  Referensi TON Blockchain hasil studi langsung docs.ton.org/llms.txt (2026-09-02):
  arsitektur chain (workchain, pesan asinkron, cells/BoC/TL-B), GRAM & jetton, smart
  contract Tolk + toolchain Acton, SDK (WalletKit, TON Connect), API TON Center
  v2/v3/Streaming, payment processing untuk bot/bisnis, dan integrasi AI agent via
  @ton/mcp (agentic wallet split-key). Gunakan saat user menyebut TON, Gram, jetton,
  USDT di TON, wallet kripto, pembayaran crypto di bot Telegram, atau ingin
  bot/agent berinteraksi dengan blockchain TON.
metadata:
  {
    "openclaw":
      {
        "emoji": "🪙",
      },
  }
---

# TON Blockchain — digest studi docs.ton.org

> Sumber: `https://docs.ton.org/llms.txt` (index ~300 halaman khusus AI), dipelajari
> 2026-09-02. Peta path terverifikasi: `references/docs-map.md`.

## Pola docs-as-markdown (pakai ini SEBELUM scraping HTML)

- Index AI-readable: `https://docs.ton.org/llms.txt` (530 baris, ~300 halaman).
- Halaman apa pun jadi Markdown mentah: `https://docs.ton.org/llms/<path>/content.md`
  → cukup `curl`. Contoh: `curl -sL https://docs.ton.org/llms/api/overview/content.md`.
- Generalisasi: banyak situs docs kini menyediakan `<site>/llms.txt` — selalu cek
  dulu saat mempelajari docs baru; jauh lebih bersih daripada ekstrak HTML.

## Model inti

- Coin native: **GRAM** (gas & fees). Mainnet dan testnet terpisah penuh.
- **Workchain & sharding**: basechain (workchain 0) untuk user/app, masterchain (-1)
  untuk koordinasi & bookkeeping internal; shard dinamis saat beban naik → dasar
  klaim TPS tinggi. Catchain 2.0: masterchain produce block ± tiap 400 ms.
- **Eksekusi asinkron** — kontrak saling kirim PESAN, bukan synchronous seperti
  Ethereum. Transaksi gagal menghasilkan **bounce message** yang harus ditangani.
- Semua data = **cells** (maks 1023 bit + maks 4 ref), diserialisasi jadi **BoC**,
  skema ditulis **TL-B** (setara protobuf versi bit-level).
- **Finality cepat**: 1 konfirmasi blok masterchain ≈ <1 detik, irreversible —
  jauh beda dari ETH (12–15 blok, 2–3 menit) atau BTC (6 blok, ~60 menit).
  Saat memantau pembayaran: pastikan tx masuk blok MASTERCHAIN (bukan cuma shard).

## Ekosistem dev

- Bahasa smart contract: **Tolk** (resmi, pengganti FunC). Toolchain: **Acton**
  (pengganti Blueprint).
- SDK: `@ton/ton` + `@ton/core` (TypeScript), **WalletKit** (`@ton/walletkit`,
  repo `ton-connect/kit`) untuk wallet services, **TON Connect** (`@tonconnect/ui-react`,
  `@tonconnect/ui`, `@tonconnect/sdk`, `@tonconnect/protocol`) — protokol standar
  koneksi wallet↔dApp, yang dipakai Telegram Mini Apps.
- Token fungibel = **jetton** (TEP-74): satu master (minter) contract + wallet
  contract per holder. Transfer notification membawa info pengirim & jumlah.
- Stablecoin: **USDT ada di TON mainnet** (sebagai jetton).

## API (TON Center)

| API | Sifat | Pemakaian |
|---|---|---|
| **v2** `toncenter.com/api/v2` | proxy liteserver langsung | balance, kirim tx, get-method contract |
| **v3** `toncenter.com/api/v3` | indexer + archival | trace, jetton, NFT, query historis |
| **Streaming v2** `toncenter.com/api/streaming/v2/{sse,ws}` | SSE / WebSocket | update real-time per-subscription |

- Testnet: ganti host jadi `testnet.toncenter.com`. API key (naikkan rate limit,
  default tanpa key ±1 req/s): `https://docs.ton.org/llms/api/get-api-key/content.md`.
- Liteserver publik: bisa self-host, satu-satunya yang kasih **bukti kripto
  (proofs)**, tapi tanpa indexer. Config: `ton-blockchain.github.io/global.config.json`.

## Payment processing (untuk bot/bisnis)

- **On-chain** (semua logika di contract) cocok untuk kasus sederhana; sistem nyata
  (saldo user, riwayat, refund) → **off-chain processing**: pantau tx, verifikasi,
  update DB sendiri, picu logika bisnis.
- **3 pendekatan**:
  1. Self-built — service sendiri polling blok + DB (kontrol penuh, effort besar)
  2. Self-hosted processor — open source **Bicycle** atau **Spice harvester**,
     deploy sendiri, konsumsi API-nya (keseimbangan bagus)
  3. Third-party — webhook jadi, tercepat, ada fee & dependency
- Flow monitoring: ambil blok workchain terbaru → filter tx alamat deposit → parse
  jumlah/metadata → cek finality masterchain → update catatan pembayaran. Polling
  beberapa detik sekali; sistem matang kombinasikan webhook + rekonsiliasi berkala.
- Jetton payment: pantau **jetton wallet contract** milik alamat deposit, bukan
  alamat wallet-nya. Setup contoh end-to-end (Gram+USDT deposit/withdraw):
  `llms/applications/payments/setup/content.md`.

## Integrasi AI agent — `@ton/mcp`

Server MCP resmi TON (alpha, aman untuk mainnet tapi **pin versi** untuk produksi):

```bash
npx -y @ton/mcp@alpha            # jalankan langsung (stdio, default)
npx skills add ton-connect/kit/packages/mcp   # install sbg agent skills (rekomendasi)
```

- **Transport**: stdio (default), HTTP multi-session (`--http 8080`, endpoint `/mcp`),
  serverless (`@ton/mcp/serverless` — AWS Lambda / **Vercel** / Cloudflare; kredensial
  via header request, single-wallet saja, wajib HTTPS).
- **2 mode runtime**:
  - *Agentic wallets* (default): self-custody multi-wallet dari registry
    `~/.config/ton/config.json` (override `TON_CONFIG_PATH`).
  - *Single-wallet*: satu wallet in-memory dari env `MNEMONIC` (24 kata) atau
    `PRIVATE_KEY` (hex, prioritas). `WALLET_VERSION` default `v5r1` (bisa `v4r2`).
- **Tools utama**: `get_balance`, `get_jettons`, `get_transactions`,
  `get_transaction_status`, `send_ton`/`send_jetton`/`send_nft` (amount human-readable,
  return `normalizedHash`), `send_raw_transaction` (nanogram, multi-message),
  `get_swap_quote` (DEX aggregator; `"GRAM"` atau alamat minter), `get_nfts`,
  `resolve_dns`/`back_resolve_dns` (domain `.ton`), + tool agentic
  (`agentic_import_wallet`, `agentic_rotate_operator_key`, onboarding dll).
- **Agentic wallet = split-key**: kontrak wallet v5 deployed sebagai SBT dalam satu
  NFT collection. User pegang **owner key** (kendali penuh: withdraw, rotate, revoke
  dengan set operator key = 0), agent pegang **operator key** — cuma bisa belanja dari
  saldo wallet agent itu sendiri; wallet utama user tak tersentuh. Dashboard:
  `https://agents.ton.org` (monitor, fund, revoke). Contract BELUM diaudit —
  pakai testnet dulu. Risiko dibatasi saldo yang didepositkan — jangan deposit
  lebih dari yang siap hilang.
- Env penting: `NETWORK` (`mainnet`/`testnet`), `TONCENTER_API_KEY`,
  `AGENTIC_CALLBACK_*` (onboarding callback stdio mode).
- ⚠️ **MNEMONIC/PRIVATE_KEY = kendali penuh wallet.** Jangan pernah commit ke Git,
  jangan pass inline di shell — simpan di env/secrets manager. Semua tool transfer
  memindahkan dana NYATA: wajib konfirmasi user dulu, lalu poll
  `get_transaction_status` sampai selesai.

## Pola integrasi yang tersedia

1. **Hermes/agent**: jalankan `@ton/mcp` (stdio) atau deploy serverless ke Vercel →
   agent bisa cek saldo/kirim/swap atas nama wallet agentic.
2. **Bot Telegram terima pembayaran**: deposit address per user + polling/indexing
   (Bicycle/Spice harvester) + konfirmasi finality masterchain + notifikasi ke user.
3. **Mini Apps**: TON Connect (`@tonconnect/ui-react`) untuk connect wallet user
   tanpa pegang kredensial mereka.

## References

- `references/docs-map.md` — peta path `llms/*/content.md` terverifikasi + yang
  belum dibaca (payment gram/jetton detail, Tolk, Acton, wallets comparison).
- Dashboard agentic wallet: https://agents.ton.org — Portal MCP resmi: https://mcp.ton.org
