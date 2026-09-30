# Peta docs TON — path `llms/*/content.md` terverifikasi

> Pola: `https://docs.ton.org/llms/<path>/content.md` → Markdown mentah (curl langsung).
> Index lengkap: `https://docs.ton.org/llms.txt` (~300 halaman, 530 baris).
> Diverifikasi fetch: 2026-09-02.

## Sudah dibaca & terverifikasi

| Path | Isi singkat |
|---|---|
| `llms/start-here/content.md` | orientasi: model chain, GRAM, workchain, pesan asinkron, cells/BoC/TL-B |
| `llms/applications/overview/content.md` | ekosistem app: SDK, WalletKit, TON Connect, payments |
| `llms/onboarding/ai/overview/content.md` | kenapa llms.txt ada, cara agent konsumsi docs |
| `llms/onboarding/ai/quickstart/content.md` | quickstart agent: setup agentic wallet via `@ton/mcp`, funding, prompt contoh (`What is my agent balance?`, `Send 1 Gram to UQB...`) |
| `llms/onboarding/ai/mcp/content.md` | `@ton/mcp` lengkap: install, 2 mode runtime, transport (stdio/HTTP/serverless), daftar semua tools, env vars, library usage (`createTonWalletMCP` + WalletKit) |
| `llms/onboarding/ai/wallets/content.md` | agentic wallet contract: split-key owner/operator, deployment flow, funding, dashboard, FAQ (belum diaudit) |
| `llms/applications/payments/overview/content.md` | on-chain vs off-chain, finality masterchain ~1 dtk, asset (GRAM/jetton/USDT), 3 pendekatan implementasi, flow monitoring |
| `llms/api/overview/content.md` | perbandingan liteserver vs TON Center v2 vs v3, Streaming API endpoint + auth, config liteserver |

## Endpoint siap pakai (dari halaman API)

- Mainnet v2: `https://toncenter.com/api/v2` — v3: `https://toncenter.com/api/v3`
- Testnet: `https://testnet.toncenter.com/api/{v2,v3}`
- Streaming: `https://toncenter.com/api/streaming/v2/sse` + `wss://toncenter.com/api/streaming/v2/ws` (testnet: host `testnet.toncenter.com`)
- Liteserver config mainnet: `https://ton-blockchain.github.io/global.config.json` (testnet: `testnet-global.config.json`)
- API key: `https://docs.ton.org/llms/api/get-api-key/content.md`

## Ter-referensi di halaman, BELUM dibaca (buka saat dibutuhkan)

- Payment detail: `llms/applications/payments/{gram,jettons,setup,bicycle}/content.md`
  (setup = contoh self-hosted processor Gram+USDT end-to-end)
- Jetton internals: `llms/contracts/standard/tokens/jettons/{overview,how-it-works}/content.md`
- Wallet versions: `llms/contracts/standard/wallets/comparison/content.md` (v5r1 vs v4r2)
- Smart contract: Tolk & Acton docs (lihat index); NFT/SBT comparison:
  `llms/contracts/standard/tokens/nft/comparison/content.md`
- Catchain 2.0 / subsecond finality: `llms/subsecond/content.md`
- SDK list: `llms/applications/sdks/content.md`; WalletKit:
  `llms/applications/walletkit/overview/content.md`; TON Connect:
  `llms/applications/ton-connect/overview/content.md`
- Nodes/liteserver self-host: `llms/nodes/overview/content.md`,
  `llms/nodes/cpp/setup-mytonctrl/content.md`
- Agentic wallet contract source: https://github.com/the-ton-tech/agentic-wallet-contract
- `@ton/mcp` source & changelog: https://github.com/ton-connect/kit/tree/main/packages/mcp
