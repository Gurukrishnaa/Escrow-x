// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title MockINR
 * @notice Mock Indian Rupee (mINR) — an ERC-20 test token for the ESCROW-X prototype.
 * @dev Mint-on-demand token. The MINTER_ROLE (Bank Admin) can mint tokens to
 *      any KYC-approved wallet via the faucet function.
 *
 *      Token Parameters:
 *        - Name:    Mock Indian Rupee
 *        - Symbol:  mINR
 *        - Decimals: 18
 *        - Initial Supply: 0 (mint-on-demand)
 *        - Faucet Amount: 100,000 mINR per request
 *
 *      ⚠ DEMO ONLY — Not for production use.
 */
contract MockINR is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @notice Amount minted per faucet request: 100,000 mINR
    uint256 public constant FAUCET_AMOUNT = 100_000 * 10 ** 18;

    /// @notice Tracks whether a wallet has been KYC-approved (simulated).
    mapping(address => bool) public kycApproved;

    // ──────────────────────────── Events ────────────────────────────

    event KYCApproved(address indexed account);
    event KYCRevoked(address indexed account);
    event FaucetMint(address indexed to, uint256 amount);

    // ──────────────────────────── Errors ────────────────────────────

    error NotKYCApproved(address account);
    error ZeroAddress();

    // ──────────────────────────── Constructor ────────────────────────────

    constructor(address admin) ERC20("Mock Indian Rupee", "mINR") {
        if (admin == address(0)) revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
    }

    // ──────────────────────────── KYC Management ────────────────────────────

    /**
     * @notice Approve KYC for an account (simulated).
     * @param account The wallet address to approve.
     */
    function approveKYC(address account) external onlyRole(MINTER_ROLE) {
        if (account == address(0)) revert ZeroAddress();
        kycApproved[account] = true;
        emit KYCApproved(account);
    }

    /**
     * @notice Revoke KYC for an account.
     * @param account The wallet address to revoke.
     */
    function revokeKYC(address account) external onlyRole(MINTER_ROLE) {
        if (account == address(0)) revert ZeroAddress();
        kycApproved[account] = false;
        emit KYCRevoked(account);
    }

    // ──────────────────────────── Minting ────────────────────────────

    /**
     * @notice Mint arbitrary amount to a KYC-approved wallet. Restricted to MINTER_ROLE.
     * @param to   Recipient address.
     * @param amount Amount in wei to mint.
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        if (!kycApproved[to]) revert NotKYCApproved(to);
        _mint(to, amount);
    }

    /**
     * @notice Faucet — mints the standard 100,000 mINR to the caller.
     *         Caller must be KYC-approved.
     */
    function faucet() external {
        if (!kycApproved[msg.sender]) revert NotKYCApproved(msg.sender);
        _mint(msg.sender, FAUCET_AMOUNT);
        emit FaucetMint(msg.sender, FAUCET_AMOUNT);
    }
}
