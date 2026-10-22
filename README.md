# ESCROW-X

Bank-integrated, DLT-based smart escrow platform for automated conditional financial settlement.

## Quick Start

### Prerequisites

- Node.js >= 18
- npm >= 9
- MetaMask browser extension (for frontend)

### Setup

```bash
# Install all workspace dependencies
npm install

# Compile smart contracts
npm run contracts:compile

# Run contract tests
npm run contracts:test

# Start local Hardhat node
npm run contracts:node --workspace=contracts

# Deploy to local network (in another terminal)
npm run contracts:deploy:local
```

### Project Structure

```
escrow-x/
├── contracts/        # Solidity smart contracts (Hardhat)
│   ├── contracts/    # MockINR.sol, EscrowManager.sol
│   ├── test/         # Comprehensive test suite
│   └── scripts/      # Deploy & ABI export scripts
├── backend/          # NestJS REST API (Phase 2)
├── frontend/         # Next.js dashboard (Phase 3)
├── shared/           # Shared ABIs & TypeScript types
│   ├── abis/         # Exported contract ABIs
│   └── types.ts      # Shared enums & interfaces
└── instructions.md   # Full project specification
```

## Tech Stack

- **Contracts:** Solidity 0.8.24, Hardhat, OpenZeppelin
- **Backend:** NestJS, PostgreSQL, Prisma
- **Frontend:** Next.js, React, Tailwind CSS, shadcn/ui, Wagmi
- **Blockchain:** Polygon Amoy Testnet / Hardhat Local

## Demo Use Case

Used-car purchase escrow with full lifecycle: creation → funding → delivery verification → buyer approval → fund release, plus dispute handling and expiry/refund flows.

## License

MIT
