// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title EscrowManager
 * @notice Manages the full lifecycle of escrow agreements for the ESCROW-X prototype.
 *
 *  State Machine:
 *    Created → Funded → DeliveryVerified → BuyerApproved → Released
 *                                        ↘ Disputed → Resolved
 *              Funded → Expired → Refunded
 *              Funded → Disputed → Resolved
 *
 *  Roles (on-chain):
 *    - BANK_ADMIN_ROLE:  Approves KYC, assigns verifiers/arbitrators
 *    - VERIFIER_ROLE:    Confirms delivery for assigned escrows
 *    - ARBITRATOR_ROLE:  Resolves disputes
 *    - Buyer/Seller:     Per-escrow, stored in the Escrow struct
 *
 *  ⚠ DEMO ONLY — Not for production use.
 */
contract EscrowManager is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ──────────────────────────── Roles ────────────────────────────

    bytes32 public constant BANK_ADMIN_ROLE = keccak256("BANK_ADMIN_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant ARBITRATOR_ROLE = keccak256("ARBITRATOR_ROLE");

    // ──────────────────────────── Enums ────────────────────────────

    enum EscrowState {
        Created,          // 0
        Funded,           // 1
        DeliveryVerified, // 2
        BuyerApproved,    // 3
        Released,         // 4 — terminal
        Disputed,         // 5
        Resolved,         // 6 — terminal
        Expired,          // 7
        Refunded          // 8 — terminal
    }

    enum DisputeResolution {
        None,
        ReleasedToSeller,
        RefundedToBuyer
    }

    // ──────────────────────────── Structs ────────────────────────────

    struct Escrow {
        uint256 id;
        address buyer;
        address seller;
        address verifier;
        uint256 amount;
        uint256 duration;
        uint256 expiresAt;
        EscrowState state;
        string description;
        DisputeResolution resolution;
        string disputeReason;
        address disputeInitiator;
    }

    // ──────────────────────────── State Variables ────────────────────────────

    IERC20 public immutable token;

    uint256 public nextEscrowId;

    uint256 public constant MIN_AMOUNT = 1_000 * 10 ** 18;         // 1,000 mINR
    uint256 public constant MAX_AMOUNT = 10_000_000 * 10 ** 18;    // 10,000,000 mINR
    uint256 public constant MIN_DURATION = 1 days;
    uint256 public constant MAX_DURATION = 90 days;
    uint256 public constant DEFAULT_DURATION = 7 days;

    /// @notice escrowId → Escrow
    mapping(uint256 => Escrow) public escrows;

    // ──────────────────────────── Events ────────────────────────────

    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed buyer,
        address indexed seller,
        address verifier,
        uint256 amount,
        uint256 expiresAt,
        string description
    );

    event EscrowFunded(uint256 indexed escrowId, address indexed buyer, uint256 amount);
    event DeliveryVerified(uint256 indexed escrowId, address indexed verifier);
    event BuyerApproved(uint256 indexed escrowId, address indexed buyer);
    event FundsReleased(uint256 indexed escrowId, address indexed seller, uint256 amount);
    event DisputeRaised(uint256 indexed escrowId, address indexed initiator, string reason);
    event DisputeResolved(uint256 indexed escrowId, address indexed arbitrator, DisputeResolution resolution);
    event EscrowExpired(uint256 indexed escrowId);
    event FundsRefunded(uint256 indexed escrowId, address indexed buyer, uint256 amount);

    // ──────────────────────────── Errors ────────────────────────────

    error InvalidState(uint256 escrowId, EscrowState current, EscrowState expected);
    error NotBuyer(uint256 escrowId);
    error NotSeller(uint256 escrowId);
    error NotBuyerOrSeller(uint256 escrowId);
    error NotAssignedVerifier(uint256 escrowId);
    error AmountOutOfRange(uint256 amount);
    error DurationOutOfRange(uint256 duration);
    error EscrowNotExpired(uint256 escrowId);
    error ZeroAddress();
    error BuyerCannotBeSeller();

    // ──────────────────────────── Modifiers ────────────────────────────

    modifier inState(uint256 escrowId, EscrowState expected) {
        if (escrows[escrowId].state != expected) {
            revert InvalidState(escrowId, escrows[escrowId].state, expected);
        }
        _;
    }

    modifier onlyBuyer(uint256 escrowId) {
        if (msg.sender != escrows[escrowId].buyer) revert NotBuyer(escrowId);
        _;
    }

    modifier onlyBuyerOrSeller(uint256 escrowId) {
        Escrow storage e = escrows[escrowId];
        if (msg.sender != e.buyer && msg.sender != e.seller) {
            revert NotBuyerOrSeller(escrowId);
        }
        _;
    }

    modifier onlyAssignedVerifier(uint256 escrowId) {
        if (msg.sender != escrows[escrowId].verifier) {
            revert NotAssignedVerifier(escrowId);
        }
        _;
    }

    // ──────────────────────────── Constructor ────────────────────────────

    constructor(address _token, address _admin) {
        if (_token == address(0) || _admin == address(0)) revert ZeroAddress();

        token = IERC20(_token);

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(BANK_ADMIN_ROLE, _admin);
    }

    // ──────────────────────────── Core Lifecycle ────────────────────────────

    /**
     * @notice Create a new escrow agreement.
     * @param seller     Seller wallet address.
     * @param verifier   Assigned verifier wallet address.
     * @param amount     Escrow amount in mINR (wei).
     * @param duration   Escrow duration in seconds. Pass 0 for default (7 days).
     * @param description Human-readable description (e.g., "2020 Honda City purchase").
     * @return escrowId  The ID of the newly created escrow.
     */
    function createEscrow(
        address seller,
        address verifier,
        uint256 amount,
        uint256 duration,
        string calldata description
    ) external returns (uint256 escrowId) {
        if (seller == address(0) || verifier == address(0)) revert ZeroAddress();
        if (msg.sender == seller) revert BuyerCannotBeSeller();
        if (amount < MIN_AMOUNT || amount > MAX_AMOUNT) revert AmountOutOfRange(amount);

        // Use default duration if 0
        if (duration == 0) duration = DEFAULT_DURATION;
        if (duration < MIN_DURATION || duration > MAX_DURATION) revert DurationOutOfRange(duration);

        // Verifier must have VERIFIER_ROLE
        if (!hasRole(VERIFIER_ROLE, verifier)) revert NotAssignedVerifier(0);

        escrowId = nextEscrowId++;

        escrows[escrowId] = Escrow({
            id: escrowId,
            buyer: msg.sender,
            seller: seller,
            verifier: verifier,
            amount: amount,
            duration: duration,
            expiresAt: 0, // Set on funding
            state: EscrowState.Created,
            description: description,
            resolution: DisputeResolution.None,
            disputeReason: "",
            disputeInitiator: address(0)
        });

        emit EscrowCreated(escrowId, msg.sender, seller, verifier, amount, 0, description);
    }

    /**
     * @notice Fund an escrow by transferring the required mINR tokens.
     *         Sets the expiry timestamp. Only the buyer can fund.
     * @param escrowId The escrow to fund.
     */
    function fundEscrow(uint256 escrowId)
        external
        nonReentrant
        onlyBuyer(escrowId)
        inState(escrowId, EscrowState.Created)
    {
        Escrow storage e = escrows[escrowId];

        e.expiresAt = block.timestamp + e.duration;
        e.state = EscrowState.Funded;

        token.safeTransferFrom(msg.sender, address(this), e.amount);

        emit EscrowFunded(escrowId, msg.sender, e.amount);
    }

    /**
     * @notice Verifier confirms that the asset has been delivered.
     * @param escrowId The escrow to verify.
     */
    function verifyDelivery(uint256 escrowId)
        external
        onlyAssignedVerifier(escrowId)
        inState(escrowId, EscrowState.Funded)
    {
        _checkNotExpired(escrowId);
        escrows[escrowId].state = EscrowState.DeliveryVerified;
        emit DeliveryVerified(escrowId, msg.sender);
    }

    /**
     * @notice Buyer approves the delivery after verifier confirmation.
     * @param escrowId The escrow to approve.
     */
    function approveDelivery(uint256 escrowId)
        external
        onlyBuyer(escrowId)
        inState(escrowId, EscrowState.DeliveryVerified)
    {
        _checkNotExpired(escrowId);
        escrows[escrowId].state = EscrowState.BuyerApproved;
        emit BuyerApproved(escrowId, msg.sender);
    }

    /**
     * @notice Release funds to the seller. Can be called by buyer after approval.
     * @param escrowId The escrow to release.
     */
    function releaseFunds(uint256 escrowId)
        external
        nonReentrant
        onlyBuyer(escrowId)
        inState(escrowId, EscrowState.BuyerApproved)
    {
        Escrow storage e = escrows[escrowId];
        e.state = EscrowState.Released;

        token.safeTransfer(e.seller, e.amount);

        emit FundsReleased(escrowId, e.seller, e.amount);
    }

    // ──────────────────────────── Dispute Handling ────────────────────────────

    /**
     * @notice Raise a dispute. Can be called by buyer or seller when escrow is
     *         Funded or DeliveryVerified.
     * @param escrowId The escrow to dispute.
     * @param reason   Human-readable reason for the dispute.
     */
    function raiseDispute(uint256 escrowId, string calldata reason)
        external
        onlyBuyerOrSeller(escrowId)
    {
        Escrow storage e = escrows[escrowId];

        // Disputes allowed from Funded or DeliveryVerified states
        if (e.state != EscrowState.Funded && e.state != EscrowState.DeliveryVerified) {
            revert InvalidState(escrowId, e.state, EscrowState.Funded);
        }

        _checkNotExpired(escrowId);

        e.state = EscrowState.Disputed;
        e.disputeReason = reason;
        e.disputeInitiator = msg.sender;

        emit DisputeRaised(escrowId, msg.sender, reason);
    }

    /**
     * @notice Arbitrator resolves a dispute.
     * @param escrowId   The disputed escrow.
     * @param releaseToSeller  If true, release funds to seller. If false, refund buyer.
     */
    function resolveDispute(uint256 escrowId, bool releaseToSeller)
        external
        nonReentrant
        onlyRole(ARBITRATOR_ROLE)
        inState(escrowId, EscrowState.Disputed)
    {
        Escrow storage e = escrows[escrowId];
        e.state = EscrowState.Resolved;

        if (releaseToSeller) {
            e.resolution = DisputeResolution.ReleasedToSeller;
            token.safeTransfer(e.seller, e.amount);
        } else {
            e.resolution = DisputeResolution.RefundedToBuyer;
            token.safeTransfer(e.buyer, e.amount);
        }

        emit DisputeResolved(escrowId, msg.sender, e.resolution);
    }

    // ──────────────────────────── Expiry & Refund ────────────────────────────

    /**
     * @notice Mark an escrow as expired. Anyone can call this once the deadline passes.
     *         Only works for Funded or DeliveryVerified escrows (not Disputed).
     * @param escrowId The escrow to expire.
     */
    function markExpired(uint256 escrowId) external {
        Escrow storage e = escrows[escrowId];

        if (e.state != EscrowState.Funded && e.state != EscrowState.DeliveryVerified) {
            revert InvalidState(escrowId, e.state, EscrowState.Funded);
        }
        if (block.timestamp < e.expiresAt) revert EscrowNotExpired(escrowId);

        e.state = EscrowState.Expired;
        emit EscrowExpired(escrowId);
    }

    /**
     * @notice Refund the buyer for an expired escrow.
     * @param escrowId The escrow to refund.
     */
    function refund(uint256 escrowId)
        external
        nonReentrant
        onlyBuyer(escrowId)
        inState(escrowId, EscrowState.Expired)
    {
        Escrow storage e = escrows[escrowId];
        e.state = EscrowState.Refunded;

        token.safeTransfer(e.buyer, e.amount);

        emit FundsRefunded(escrowId, e.buyer, e.amount);
    }

    // ──────────────────────────── View Functions ────────────────────────────

    /**
     * @notice Get full escrow details.
     */
    function getEscrow(uint256 escrowId) external view returns (Escrow memory) {
        return escrows[escrowId];
    }

    /**
     * @notice Check if an escrow is expired (past its deadline).
     */
    function isExpired(uint256 escrowId) external view returns (bool) {
        Escrow storage e = escrows[escrowId];
        return e.expiresAt > 0 && block.timestamp >= e.expiresAt;
    }

    /**
     * @notice Get the total number of escrows created.
     */
    function getEscrowCount() external view returns (uint256) {
        return nextEscrowId;
    }

    // ──────────────────────────── Internal ────────────────────────────

    function _checkNotExpired(uint256 escrowId) internal view {
        Escrow storage e = escrows[escrowId];
        if (e.expiresAt > 0 && block.timestamp >= e.expiresAt) {
            revert EscrowNotExpired(escrowId);
        }
    }
}
