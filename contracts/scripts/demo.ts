import { ethers } from "hardhat";

/**
 * ESCROW-X — Full Lifecycle Demo Script
 * 
 * Walks through the complete escrow lifecycle on a local Hardhat node:
 *   1. Deploy contracts
 *   2. Setup roles (verifier, arbitrator)
 *   3. KYC approve buyer & seller
 *   4. Faucet mint tokens to buyer
 *   5. Create escrow (used-car purchase)
 *   6. Fund escrow
 *   7. Verify delivery
 *   8. Buyer approves
 *   9. Release funds to seller
 *  10. Also demos: dispute flow & expiry/refund flow
 *
 * Run: npx hardhat run scripts/demo.ts
 */

const DIVIDER = "═".repeat(60);
const SUB_DIVIDER = "─".repeat(40);

function header(title: string) {
  console.log(`\n${DIVIDER}`);
  console.log(`  ${title}`);
  console.log(DIVIDER);
}

function step(num: number, desc: string) {
  console.log(`\n  [Step ${num}] ${desc}`);
  console.log(`  ${SUB_DIVIDER}`);
}

function info(label: string, value: string) {
  console.log(`    ${label.padEnd(22)} ${value}`);
}

const STATES = [
  "Created", "Funded", "DeliveryVerified", "BuyerApproved",
  "Released", "Disputed", "Resolved", "Expired", "Refunded"
];

async function main() {
  const [admin, buyer, seller, verifier, arbitrator] = await ethers.getSigners();

  header("ESCROW-X — Full Lifecycle Demo");
  info("Network", "Hardhat (local)");
  info("Admin", admin.address);
  info("Buyer", buyer.address);
  info("Seller", seller.address);
  info("Verifier", verifier.address);
  info("Arbitrator", arbitrator.address);

  // ─── Step 1: Deploy ───
  step(1, "Deploying Contracts");

  const MockINR = await ethers.getContractFactory("MockINR");
  const token = await MockINR.deploy(admin.address);
  await token.waitForDeployment();
  info("MockINR deployed at", await token.getAddress());

  const EscrowManager = await ethers.getContractFactory("EscrowManager");
  const escrow = await EscrowManager.deploy(await token.getAddress(), admin.address);
  await escrow.waitForDeployment();
  info("EscrowManager at", await escrow.getAddress());

  // ─── Step 2: Assign Roles ───
  step(2, "Assigning Roles (Verifier & Arbitrator)");

  const VERIFIER_ROLE = await escrow.VERIFIER_ROLE();
  const ARBITRATOR_ROLE = await escrow.ARBITRATOR_ROLE();
  await escrow.grantRole(VERIFIER_ROLE, verifier.address);
  await escrow.grantRole(ARBITRATOR_ROLE, arbitrator.address);
  info("Verifier role granted", "✅");
  info("Arbitrator role granted", "✅");

  // ─── Step 3: KYC Approval ───
  step(3, "KYC Approval (Simulated)");

  await token.approveKYC(buyer.address);
  await token.approveKYC(seller.address);
  info("Buyer KYC", `${await token.kycApproved(buyer.address) ? "✅ Approved" : "❌ Pending"}`);
  info("Seller KYC", `${await token.kycApproved(seller.address) ? "✅ Approved" : "❌ Pending"}`);

  // ─── Step 4: Faucet Mint ───
  step(4, "Minting Tokens (Buyer uses Faucet)");

  await token.connect(buyer).faucet();
  const buyerBal = await token.balanceOf(buyer.address);
  info("Buyer balance", `${ethers.formatEther(buyerBal)} mINR`);

  // Approve escrow contract to spend
  await token.connect(buyer).approve(await escrow.getAddress(), ethers.MaxUint256);
  info("Escrow allowance", "✅ Unlimited");

  // ══════════════════════════════════════════
  // FLOW 1: Happy Path (Create → Fund → Verify → Approve → Release)
  // ══════════════════════════════════════════

  header("FLOW 1: Happy Path — Used Car Purchase");

  step(5, "Creating Escrow");

  const amount = ethers.parseEther("50000"); // 50,000 mINR
  const tx1 = await escrow.connect(buyer).createEscrow(
    seller.address,
    verifier.address,
    amount,
    0, // default 7-day duration
    "2020 Honda City — Silver, 45,000 km"
  );
  const receipt1 = await tx1.wait();
  info("Escrow ID", "0");
  info("Amount", "50,000 mINR");
  info("Description", "2020 Honda City — Silver, 45,000 km");
  info("Duration", "7 days (default)");

  let e = await escrow.getEscrow(0);
  info("State", `${STATES[Number(e.state)]}`);

  step(6, "Funding Escrow (Buyer locks tokens)");

  const balBefore = await token.balanceOf(buyer.address);
  await escrow.connect(buyer).fundEscrow(0);
  const balAfter = await token.balanceOf(buyer.address);
  info("Tokens locked", `${ethers.formatEther(balBefore - balAfter)} mINR`);
  info("Buyer balance now", `${ethers.formatEther(balAfter)} mINR`);

  e = await escrow.getEscrow(0);
  info("State", `${STATES[Number(e.state)]}`);
  info("Expires at", new Date(Number(e.expiresAt) * 1000).toISOString());

  step(7, "Verifier Confirms Delivery");

  await escrow.connect(verifier).verifyDelivery(0);
  e = await escrow.getEscrow(0);
  info("Verified by", verifier.address.slice(0, 10) + "...");
  info("State", `${STATES[Number(e.state)]}`);

  step(8, "Buyer Approves Delivery");

  await escrow.connect(buyer).approveDelivery(0);
  e = await escrow.getEscrow(0);
  info("State", `${STATES[Number(e.state)]}`);

  step(9, "Releasing Funds to Seller");

  const sellerBalBefore = await token.balanceOf(seller.address);
  await escrow.connect(buyer).releaseFunds(0);
  const sellerBalAfter = await token.balanceOf(seller.address);
  e = await escrow.getEscrow(0);
  info("Seller received", `${ethers.formatEther(sellerBalAfter - sellerBalBefore)} mINR`);
  info("State", `${STATES[Number(e.state)]} ✅ (Terminal)`);

  // ══════════════════════════════════════════
  // FLOW 2: Dispute Path
  // ══════════════════════════════════════════

  header("FLOW 2: Dispute Path — Buyer raises dispute");

  // Buyer needs more tokens
  await token.connect(buyer).faucet();
  const amount2 = ethers.parseEther("25000");

  step(10, "Creating & Funding Escrow #1");

  await escrow.connect(buyer).createEscrow(
    seller.address,
    verifier.address,
    amount2,
    0,
    "2019 Maruti Swift — Dispute demo"
  );
  await escrow.connect(buyer).fundEscrow(1);
  info("Escrow ID", "1");
  info("Amount", "25,000 mINR");

  step(11, "Buyer Raises Dispute");

  await escrow.connect(buyer).raiseDispute(1, "Odometer reading does not match listing");
  e = await escrow.getEscrow(1);
  info("Dispute reason", e.disputeReason);
  info("Initiated by", e.disputeInitiator.slice(0, 10) + "... (Buyer)");
  info("State", `${STATES[Number(e.state)]}`);

  step(12, "Arbitrator Resolves — Refunds Buyer");

  const buyerBalPre = await token.balanceOf(buyer.address);
  await escrow.connect(arbitrator).resolveDispute(1, false); // refund buyer
  const buyerBalPost = await token.balanceOf(buyer.address);
  e = await escrow.getEscrow(1);
  info("Resolution", "Refunded to Buyer");
  info("Buyer received back", `${ethers.formatEther(buyerBalPost - buyerBalPre)} mINR`);
  info("State", `${STATES[Number(e.state)]} ✅ (Terminal)`);

  // ══════════════════════════════════════════
  // FLOW 3: Expiry & Refund
  // ══════════════════════════════════════════

  header("FLOW 3: Expiry & Refund");

  const amount3 = ethers.parseEther("10000");
  step(13, "Creating & Funding Escrow #2 (will expire)");

  await escrow.connect(buyer).createEscrow(
    seller.address,
    verifier.address,
    amount3,
    86400, // 1 day (minimum)
    "2021 Hyundai i20 — Expiry demo"
  );
  await escrow.connect(buyer).fundEscrow(2);
  info("Escrow ID", "2");
  info("Duration", "1 day");

  step(14, "Fast-forwarding time (1 day + 1 second)");

  // Hardhat time manipulation
  await ethers.provider.send("evm_increaseTime", [86401]);
  await ethers.provider.send("evm_mine", []);
  info("Time advanced", "86,401 seconds");
  info("Is expired?", `${await escrow.isExpired(2) ? "✅ Yes" : "❌ No"}`);

  step(15, "Marking Expired & Refunding");

  await escrow.markExpired(2);
  e = await escrow.getEscrow(2);
  info("State after mark", STATES[Number(e.state)]);

  const buyerRefundBefore = await token.balanceOf(buyer.address);
  await escrow.connect(buyer).refund(2);
  const buyerRefundAfter = await token.balanceOf(buyer.address);
  e = await escrow.getEscrow(2);
  info("Refunded", `${ethers.formatEther(buyerRefundAfter - buyerRefundBefore)} mINR`);
  info("State", `${STATES[Number(e.state)]} ✅ (Terminal)`);

  // ─── Summary ───
  header("DEMO COMPLETE — Summary");

  const totalEscrows = await escrow.getEscrowCount();
  info("Total escrows created", totalEscrows.toString());

  for (let i = 0; i < Number(totalEscrows); i++) {
    const esc = await escrow.getEscrow(i);
    info(
      `Escrow #${i}`,
      `${STATES[Number(esc.state)].padEnd(18)} | ${ethers.formatEther(esc.amount)} mINR`
    );
  }

  console.log(`\n${DIVIDER}`);
  console.log("  All 3 flows completed successfully! 🎉");
  console.log(DIVIDER);
  console.log();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
