// ──────────────────────────────────────────────
// ESCROW-X — Shared TypeScript Types
// ──────────────────────────────────────────────

/**
 * Escrow states matching the EscrowManager.sol enum.
 */
export enum EscrowState {
  Created = 0,
  Funded = 1,
  DeliveryVerified = 2,
  BuyerApproved = 3,
  Released = 4,
  Disputed = 5,
  Resolved = 6,
  Expired = 7,
  Refunded = 8,
}

/**
 * Human-readable labels for escrow states.
 */
export const EscrowStateLabel: Record<EscrowState, string> = {
  [EscrowState.Created]: "Created",
  [EscrowState.Funded]: "Funded",
  [EscrowState.DeliveryVerified]: "Delivery Verified",
  [EscrowState.BuyerApproved]: "Buyer Approved",
  [EscrowState.Released]: "Released",
  [EscrowState.Disputed]: "Disputed",
  [EscrowState.Resolved]: "Resolved",
  [EscrowState.Expired]: "Expired",
  [EscrowState.Refunded]: "Refunded",
};

/**
 * Terminal states — no further transitions allowed.
 */
export const TERMINAL_STATES: EscrowState[] = [
  EscrowState.Released,
  EscrowState.Resolved,
  EscrowState.Refunded,
];

/**
 * Dispute resolution outcomes matching the EscrowManager.sol enum.
 */
export enum DisputeResolution {
  None = 0,
  ReleasedToSeller = 1,
  RefundedToBuyer = 2,
}

/**
 * User roles matching the on-chain RBAC model.
 */
export enum UserRole {
  Buyer = "buyer",
  Seller = "seller",
  Verifier = "verifier",
  Arbitrator = "arbitrator",
  BankAdmin = "bank_admin",
}

/**
 * Escrow data as returned from the contract / API.
 */
export interface EscrowData {
  id: number;
  buyer: string;
  seller: string;
  verifier: string;
  amount: string; // BigInt serialized as string
  expiresAt: number; // Unix timestamp
  state: EscrowState;
  description: string;
  resolution: DisputeResolution;
  disputeReason: string;
  disputeInitiator: string;
}

/**
 * User profile stored off-chain.
 */
export interface UserProfile {
  id: string;
  walletAddress: string;
  role: UserRole;
  kycApproved: boolean;
  displayName?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Contract addresses for the deployed instance.
 */
export interface ContractAddresses {
  mockINR: string;
  escrowManager: string;
  chainId: number;
}
