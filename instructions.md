# ESCROW-X — AI Agent Instructions

## Project Overview

ESCROW-X is a bank-integrated, DLT-based smart escrow platform that automates conditional financial settlement. Banks retain responsibility for KYC/AML, fiat transactions, compliance, and dispute arbitration. Smart contracts handle fund locking, conditional release, refunds, and immutable audit events.

**Demo use case:** Used-car purchase escrow.

## Tech Stack

- **Frontend:** Next.js, React, TypeScript, Tailwind CSS, shadcn/ui
- **Web3:** Solidity, Hardhat, OpenZeppelin, Wagmi, Viem
- **Blockchain:** Polygon Amoy testnet; Hardhat local network for development
- **Backend:** NestJS, TypeScript, REST API
- **Database:** PostgreSQL, Prisma
- **Authentication:** JWT and wallet signature verification
- **Token:** MockINR (ERC-20 test token)
- **Testing:** Hardhat tests, Vitest, Supertest

## Core Features

1. Wallet authentication and simulated KYC approval.
2. Create escrow agreements and lock MockINR tokens.
3. Trusted verifier confirms delivery.
4. Release funds when required conditions are satisfied.
5. Allow buyers or sellers to raise disputes.
6. Allow authorized bank arbitrators to resolve disputes.
7. Refund funds after expiry when eligible.
8. Provide role-based dashboards for buyers, sellers, verifiers, arbitrators, and bank admins.
9. Maintain transaction history, contract events, and audit logs.

## Escrow State Machine

Every escrow follows a strict state machine. Only the transitions listed below are valid; all others must revert.

```
Created → Funded → DeliveryVerified → BuyerApproved → Released
                                    ↘ Disputed → Resolved (release or refund)
         Funded → Expired → Refunded
         Funded → Disputed → Resolved (release or refund)
```

| State | Description |
| **Created** | Agreement registered on-chain. Awaiting buyer funding. |
| **Funded** | Buyer has locked MockINR tokens into the contract. |
| **DeliveryVerified** | Trusted verifier has confirmed the asset (car) was delivered. |
| **BuyerApproved** | Buyer has approved the delivery and authorized release. |
| **Released** | Funds have been transferred to the seller. Terminal state. |
| **Disputed** | Either party has raised a dispute. Blocks automatic release. |
| **Resolved** | Arbitrator has resolved the dispute (funds sent to winner). Terminal state. |
| **Expired** | Escrow deadline has passed without completion. |
| **Refunded** | Funds returned to the buyer after expiry. Terminal state. |

Terminal states (Released, Resolved, Refunded) cannot transition further.

## Role Definitions & Permissions (RBAC)

| Role | Wallet Required | Permissions |
| **Buyer** | Yes | Create escrow, fund escrow, approve delivery, raise dispute, request refund after expiry, view own escrows |
| **Seller** | Yes | Accept escrow, raise dispute, view own escrows |
| **Verifier** | Yes | Confirm delivery for assigned escrows |
| **Arbitrator** | Yes | Resolve disputes (release to seller or refund to buyer), view disputed escrows |
| **Bank Admin** | No (JWT only) | Approve/reject KYC, assign verifiers and arbitrators, view all escrows, view audit logs, manage platform users |

- A single wallet address maps to exactly one role.
- Role assignment is performed by the Bank Admin through the backend.
- Smart contracts enforce role checks on-chain using modifier guards.

## MockINR Token Specification

| Parameter | Value |
| **Token Name** | Mock Indian Rupee |
| **Symbol** | mINR |
| **Decimals** | 18 |
| **Initial Supply** | 0 (mint-on-demand) |
| **Minting** | Bank Admin can mint tokens to any KYC-approved wallet via a faucet function |
| **Faucet Amount** | 100,000 mINR per request (demo convenience) |
| **Burning** | Not required for prototype |
| **Transfers** | Standard ERC-20; no transfer restrictions beyond normal allowance checks |

Demo flow: User connects wallet → completes simulated KYC → Bank Admin approves → user requests tokens from faucet → tokens are minted to their wallet.

## Escrow Parameters

| Parameter | Value |
| **Minimum Escrow Amount** | 1,000 mINR |
| **Maximum Escrow Amount** | 10,000,000 mINR |
| **Expiry Mechanism** | Block timestamp-based (`block.timestamp`) |
| **Default Expiry Duration** | 7 days from funding (configurable at creation) |
| **Minimum Expiry Duration** | 1 day |
| **Maximum Expiry Duration** | 90 days |
| **Platform Fee** | 0% (no fees for prototype; fee structure can be added later) |
| **Refund Eligibility** | Only after expiry AND escrow is not in Disputed/Released/Resolved state |

## Smart Contract Requirements

Implement `MockINR.sol` and `EscrowManager.sol`.

Support escrow creation, funding, delivery verification, buyer approval, fund release, refunds, dispute initiation, and dispute resolution.

Enforce:

- Only authorized users can perform their assigned actions.
- KYC approval is required where applicable.
- Invalid state transitions and unauthorized fund transfers must revert.
- Disputed escrows cannot be automatically released.
- Released or refunded escrows cannot be reused.
- Expired escrows cannot be funded.
- Use safe ERC-20 transfers, reentrancy protection, and events for state changes.
- Emit granular events for every state change (EscrowCreated, EscrowFunded, DeliveryVerified, FundsReleased, DisputeRaised, DisputeResolved, FundsRefunded).

Write tests for successful flows, unauthorized access, invalid transitions, disputes, refunds, and expiry.

## Architecture Rules

- Frontend communicates with the backend and smart contracts through clearly defined interfaces.
- Backend validates authentication, roles, KYC status, inputs, and business rules.
- Smart contracts enforce settlement rules independently of frontend or backend validation.
- Blockchain state is the source of truth for on-chain settlement.
- Store user profiles, KYC documents, and dispute evidence off-chain.
- Never store sensitive personal data on-chain. Store only necessary references or hashes.
- Keep contract ABIs and shared TypeScript types consistent across applications.

## UI Requirements

Build a clean, modern banking dashboard with responsive layouts, clear escrow statuses, transaction timelines, and useful error messages. Hide unnecessary blockchain complexity from normal users while providing an advanced ledger audit view.

## Development Phases

Build incrementally across five phases:

### Phase 1 — Contracts & Monorepo Setup
- Initialize the monorepo with packages: `contracts/`, `backend/`, `frontend/`, `shared/`.
- Configure Hardhat with Solidity compiler, local network, and Polygon Amoy testnet.
- Implement `MockINR.sol` (ERC-20 with faucet mint).
- Implement `EscrowManager.sol` (full state machine, RBAC, events).
- Write comprehensive Hardhat tests covering all flows and edge cases.
- Export ABIs and shared TypeScript types to `shared/`.

### Phase 2 — Backend (NestJS)
- Set up NestJS project with PostgreSQL + Prisma.
- Implement wallet-based authentication (sign message → verify → issue JWT).
- Build user management: registration, role assignment, KYC simulation.
- Build escrow CRUD APIs that sync with on-chain state.
- Build dispute management APIs with evidence upload.
- Build audit log endpoints that read contract events.
- Implement role-based authorization guards on all endpoints.

### Phase 3 — Frontend (Next.js)
- Set up Next.js with Tailwind CSS + shadcn/ui.
- Implement wallet connection (MetaMask via Wagmi).
- Build role-based dashboard layouts:
  - **Buyer:** Create escrow, fund, track status, approve, dispute.
  - **Seller:** View incoming escrows, track status, dispute.
  - **Verifier:** View assigned escrows, confirm delivery.
  - **Arbitrator:** View disputed escrows, resolve with evidence.
  - **Bank Admin:** KYC management, user roles, audit logs, platform overview.
- Build escrow detail view with transaction timeline and state visualization.
- Build token faucet UI for demo convenience.

### Phase 4 — Integration & End-to-End Testing
- Connect frontend → backend → smart contracts for all escrow lifecycle flows.
- Test complete scenarios: happy path, disputes, expiry/refund, unauthorized access.
- Handle error states, loading states, and transaction confirmations gracefully.
- Validate event-driven UI updates (polling or websocket for on-chain events).

### Phase 5 — Deployment, Polish & Documentation
- Deploy contracts to Polygon Amoy testnet.
- Deploy backend and frontend.
- Write setup documentation (README, environment variables, local development guide).
- Record a demo walkthrough of the complete escrow lifecycle.
- Final UI polish and edge-case hardening.

## Non-Negotiable Rules

- Inspect the existing repository before making changes.
- Reuse existing code and dependencies where appropriate.
- Do not overwrite working features or rewrite the project unnecessarily.
- Implement real functionality; avoid fake buttons, placeholder APIs, and hardcoded success responses.
- Never expose private keys, secrets, or environment variables.
- Never claim a feature or test works unless it has been verified.
- Clearly label simulated KYC, AML, banking, and fiat operations as demo functionality.
- Do not claim the prototype is production-ready or legally compliant.
- Run relevant tests and fix regressions after each major change.
- Keep code modular, typed, maintainable, and documented.

**Primary objective:** Deliver a fully working, secure, demo-ready ESCROW-X prototype with a complete escrow lifecycle, dispute handling, role-based access control, and auditable blockchain transactions.

