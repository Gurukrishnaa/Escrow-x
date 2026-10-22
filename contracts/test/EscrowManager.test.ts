import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { MockINR, EscrowManager } from "../typechain-types";

describe("EscrowManager", function () {
  // ─── Fixture ───
  async function deployFixture() {
    const [admin, buyer, seller, verifier, arbitrator, stranger] =
      await ethers.getSigners();

    // Deploy MockINR
    const MockINR = await ethers.getContractFactory("MockINR");
    const token = await MockINR.deploy(admin.address);
    await token.waitForDeployment();

    // Deploy EscrowManager
    const EscrowManager = await ethers.getContractFactory("EscrowManager");
    const escrow = await EscrowManager.deploy(
      await token.getAddress(),
      admin.address
    );
    await escrow.waitForDeployment();

    // Grant roles
    const VERIFIER_ROLE = await escrow.VERIFIER_ROLE();
    const ARBITRATOR_ROLE = await escrow.ARBITRATOR_ROLE();
    await escrow.grantRole(VERIFIER_ROLE, verifier.address);
    await escrow.grantRole(ARBITRATOR_ROLE, arbitrator.address);

    // KYC approve buyer and seller, mint tokens
    await token.approveKYC(buyer.address);
    await token.approveKYC(seller.address);
    await token.mint(buyer.address, ethers.parseEther("1000000"));

    // Buyer approves escrow contract to spend tokens
    const escrowAddr = await escrow.getAddress();
    await token.connect(buyer).approve(escrowAddr, ethers.MaxUint256);

    const AMOUNT = ethers.parseEther("50000"); // 50,000 mINR
    const DURATION = 7 * 24 * 60 * 60; // 7 days

    return {
      token,
      escrow,
      admin,
      buyer,
      seller,
      verifier,
      arbitrator,
      stranger,
      AMOUNT,
      DURATION,
    };
  }

  // Helper: create and fund an escrow
  async function createAndFund(fixture: Awaited<ReturnType<typeof deployFixture>>) {
    const { escrow, buyer, seller, verifier, AMOUNT } = fixture;
    await escrow
      .connect(buyer)
      .createEscrow(seller.address, verifier.address, AMOUNT, 0, "Used car purchase");
    await escrow.connect(buyer).fundEscrow(0);
    return 0; // escrowId
  }

  // ─────────────── Deployment ───────────────

  describe("Deployment", function () {
    it("should set the correct token address", async function () {
      const { token, escrow } = await loadFixture(deployFixture);
      expect(await escrow.token()).to.equal(await token.getAddress());
    });

    it("should grant BANK_ADMIN_ROLE to admin", async function () {
      const { escrow, admin } = await loadFixture(deployFixture);
      expect(await escrow.hasRole(await escrow.BANK_ADMIN_ROLE(), admin.address)).to.be.true;
    });

    it("should revert with zero address token", async function () {
      const [admin] = await ethers.getSigners();
      const EscrowManager = await ethers.getContractFactory("EscrowManager");
      await expect(
        EscrowManager.deploy(ethers.ZeroAddress, admin.address)
      ).to.be.revertedWithCustomError(EscrowManager, "ZeroAddress");
    });

    it("should start with 0 escrows", async function () {
      const { escrow } = await loadFixture(deployFixture);
      expect(await escrow.getEscrowCount()).to.equal(0);
    });
  });

  // ─────────────── Escrow Creation ───────────────

  describe("Escrow Creation", function () {
    it("should create an escrow with correct parameters", async function () {
      const { escrow, buyer, seller, verifier, AMOUNT } = await loadFixture(deployFixture);

      await expect(
        escrow
          .connect(buyer)
          .createEscrow(seller.address, verifier.address, AMOUNT, 0, "Used car purchase")
      )
        .to.emit(escrow, "EscrowCreated")
        .withArgs(0, buyer.address, seller.address, verifier.address, AMOUNT, 0, "Used car purchase");

      const e = await escrow.getEscrow(0);
      expect(e.buyer).to.equal(buyer.address);
      expect(e.seller).to.equal(seller.address);
      expect(e.verifier).to.equal(verifier.address);
      expect(e.amount).to.equal(AMOUNT);
      expect(e.state).to.equal(0); // Created
      expect(e.description).to.equal("Used car purchase");
    });

    it("should increment escrow IDs", async function () {
      const { escrow, buyer, seller, verifier, AMOUNT } = await loadFixture(deployFixture);
      await escrow.connect(buyer).createEscrow(seller.address, verifier.address, AMOUNT, 0, "Escrow 1");
      await escrow.connect(buyer).createEscrow(seller.address, verifier.address, AMOUNT, 0, "Escrow 2");
      expect(await escrow.getEscrowCount()).to.equal(2);
    });

    it("should revert if buyer == seller", async function () {
      const { escrow, buyer, verifier, AMOUNT } = await loadFixture(deployFixture);
      await expect(
        escrow.connect(buyer).createEscrow(buyer.address, verifier.address, AMOUNT, 0, "Self deal")
      ).to.be.revertedWithCustomError(escrow, "BuyerCannotBeSeller");
    });

    it("should revert if amount is below minimum", async function () {
      const { escrow, buyer, seller, verifier } = await loadFixture(deployFixture);
      const tooLow = ethers.parseEther("999");
      await expect(
        escrow.connect(buyer).createEscrow(seller.address, verifier.address, tooLow, 0, "Low amount")
      ).to.be.revertedWithCustomError(escrow, "AmountOutOfRange");
    });

    it("should revert if amount exceeds maximum", async function () {
      const { escrow, buyer, seller, verifier } = await loadFixture(deployFixture);
      const tooHigh = ethers.parseEther("10000001");
      await expect(
        escrow.connect(buyer).createEscrow(seller.address, verifier.address, tooHigh, 0, "High amount")
      ).to.be.revertedWithCustomError(escrow, "AmountOutOfRange");
    });

    it("should revert if duration is below minimum", async function () {
      const { escrow, buyer, seller, verifier, AMOUNT } = await loadFixture(deployFixture);
      await expect(
        escrow.connect(buyer).createEscrow(seller.address, verifier.address, AMOUNT, 3600, "Short")
      ).to.be.revertedWithCustomError(escrow, "DurationOutOfRange");
    });

    it("should revert if duration exceeds maximum", async function () {
      const { escrow, buyer, seller, verifier, AMOUNT } = await loadFixture(deployFixture);
      const tooLong = 91 * 24 * 60 * 60; // 91 days
      await expect(
        escrow.connect(buyer).createEscrow(seller.address, verifier.address, AMOUNT, tooLong, "Long")
      ).to.be.revertedWithCustomError(escrow, "DurationOutOfRange");
    });

    it("should revert if verifier does not have VERIFIER_ROLE", async function () {
      const { escrow, buyer, seller, stranger, AMOUNT } = await loadFixture(deployFixture);
      await expect(
        escrow.connect(buyer).createEscrow(seller.address, stranger.address, AMOUNT, 0, "Bad verifier")
      ).to.be.revertedWithCustomError(escrow, "NotAssignedVerifier");
    });

    it("should revert if seller is zero address", async function () {
      const { escrow, buyer, verifier, AMOUNT } = await loadFixture(deployFixture);
      await expect(
        escrow.connect(buyer).createEscrow(ethers.ZeroAddress, verifier.address, AMOUNT, 0, "Zero seller")
      ).to.be.revertedWithCustomError(escrow, "ZeroAddress");
    });
  });

  // ─────────────── Funding ───────────────

  describe("Funding", function () {
    it("should fund an escrow and transfer tokens", async function () {
      const { escrow, token, buyer, seller, verifier, AMOUNT } =
        await loadFixture(deployFixture);

      await escrow
        .connect(buyer)
        .createEscrow(seller.address, verifier.address, AMOUNT, 0, "Fund test");

      const balBefore = await token.balanceOf(buyer.address);
      await expect(escrow.connect(buyer).fundEscrow(0))
        .to.emit(escrow, "EscrowFunded")
        .withArgs(0, buyer.address, AMOUNT);

      const balAfter = await token.balanceOf(buyer.address);
      expect(balBefore - balAfter).to.equal(AMOUNT);

      const e = await escrow.getEscrow(0);
      expect(e.state).to.equal(1); // Funded
      expect(e.expiresAt).to.be.greaterThan(0);
    });

    it("should revert if non-buyer tries to fund", async function () {
      const { escrow, buyer, seller, verifier, stranger, AMOUNT } =
        await loadFixture(deployFixture);
      await escrow
        .connect(buyer)
        .createEscrow(seller.address, verifier.address, AMOUNT, 0, "Fund test");

      await expect(
        escrow.connect(stranger).fundEscrow(0)
      ).to.be.revertedWithCustomError(escrow, "NotBuyer");
    });

    it("should revert if escrow is already funded", async function () {
      const fixture = await loadFixture(deployFixture);
      await createAndFund(fixture);

      await expect(
        fixture.escrow.connect(fixture.buyer).fundEscrow(0)
      ).to.be.revertedWithCustomError(fixture.escrow, "InvalidState");
    });
  });

  // ─────────────── Delivery Verification ───────────────

  describe("Delivery Verification", function () {
    it("should allow assigned verifier to verify delivery", async function () {
      const fixture = await loadFixture(deployFixture);
      await createAndFund(fixture);

      await expect(fixture.escrow.connect(fixture.verifier).verifyDelivery(0))
        .to.emit(fixture.escrow, "DeliveryVerified")
        .withArgs(0, fixture.verifier.address);

      const e = await fixture.escrow.getEscrow(0);
      expect(e.state).to.equal(2); // DeliveryVerified
    });

    it("should revert if non-verifier tries to verify", async function () {
      const fixture = await loadFixture(deployFixture);
      await createAndFund(fixture);

      await expect(
        fixture.escrow.connect(fixture.stranger).verifyDelivery(0)
      ).to.be.revertedWithCustomError(fixture.escrow, "NotAssignedVerifier");
    });

    it("should revert if escrow is not in Funded state", async function () {
      const { escrow, buyer, seller, verifier, AMOUNT } = await loadFixture(deployFixture);
      await escrow
        .connect(buyer)
        .createEscrow(seller.address, verifier.address, AMOUNT, 0, "Test");

      // Escrow is in Created state, not Funded
      await expect(
        escrow.connect(verifier).verifyDelivery(0)
      ).to.be.revertedWithCustomError(escrow, "InvalidState");
    });
  });

  // ─────────────── Buyer Approval & Fund Release ───────────────

  describe("Buyer Approval & Fund Release", function () {
    it("should allow buyer to approve and release funds (happy path)", async function () {
      const fixture = await loadFixture(deployFixture);
      const { escrow, token, buyer, seller, verifier, AMOUNT } = fixture;
      await createAndFund(fixture);

      // Verify delivery
      await escrow.connect(verifier).verifyDelivery(0);

      // Buyer approves
      await expect(escrow.connect(buyer).approveDelivery(0))
        .to.emit(escrow, "BuyerApproved")
        .withArgs(0, buyer.address);

      // Release funds
      const sellerBalBefore = await token.balanceOf(seller.address);
      await expect(escrow.connect(buyer).releaseFunds(0))
        .to.emit(escrow, "FundsReleased")
        .withArgs(0, seller.address, AMOUNT);

      const sellerBalAfter = await token.balanceOf(seller.address);
      expect(sellerBalAfter - sellerBalBefore).to.equal(AMOUNT);

      const e = await escrow.getEscrow(0);
      expect(e.state).to.equal(4); // Released
    });

    it("should revert if non-buyer tries to approve", async function () {
      const fixture = await loadFixture(deployFixture);
      await createAndFund(fixture);
      await fixture.escrow.connect(fixture.verifier).verifyDelivery(0);

      await expect(
        fixture.escrow.connect(fixture.seller).approveDelivery(0)
      ).to.be.revertedWithCustomError(fixture.escrow, "NotBuyer");
    });

    it("should revert release if not in BuyerApproved state", async function () {
      const fixture = await loadFixture(deployFixture);
      await createAndFund(fixture);

      // Still in Funded state
      await expect(
        fixture.escrow.connect(fixture.buyer).releaseFunds(0)
      ).to.be.revertedWithCustomError(fixture.escrow, "InvalidState");
    });
  });

  // ─────────────── Dispute Handling ───────────────

  describe("Dispute Handling", function () {
    it("should allow buyer to raise dispute when Funded", async function () {
      const fixture = await loadFixture(deployFixture);
      await createAndFund(fixture);

      await expect(
        fixture.escrow.connect(fixture.buyer).raiseDispute(0, "Car has damage")
      )
        .to.emit(fixture.escrow, "DisputeRaised")
        .withArgs(0, fixture.buyer.address, "Car has damage");

      const e = await fixture.escrow.getEscrow(0);
      expect(e.state).to.equal(5); // Disputed
      expect(e.disputeReason).to.equal("Car has damage");
      expect(e.disputeInitiator).to.equal(fixture.buyer.address);
    });

    it("should allow seller to raise dispute when DeliveryVerified", async function () {
      const fixture = await loadFixture(deployFixture);
      await createAndFund(fixture);
      await fixture.escrow.connect(fixture.verifier).verifyDelivery(0);

      await expect(
        fixture.escrow.connect(fixture.seller).raiseDispute(0, "Buyer not paying")
      )
        .to.emit(fixture.escrow, "DisputeRaised")
        .withArgs(0, fixture.seller.address, "Buyer not paying");
    });

    it("should revert dispute from stranger", async function () {
      const fixture = await loadFixture(deployFixture);
      await createAndFund(fixture);

      await expect(
        fixture.escrow.connect(fixture.stranger).raiseDispute(0, "Random dispute")
      ).to.be.revertedWithCustomError(fixture.escrow, "NotBuyerOrSeller");
    });

    it("should revert dispute if escrow is in Created state", async function () {
      const { escrow, buyer, seller, verifier, AMOUNT } = await loadFixture(deployFixture);
      await escrow
        .connect(buyer)
        .createEscrow(seller.address, verifier.address, AMOUNT, 0, "Test");

      await expect(
        escrow.connect(buyer).raiseDispute(0, "Too early")
      ).to.be.revertedWithCustomError(escrow, "InvalidState");
    });

    it("should allow arbitrator to resolve dispute — release to seller", async function () {
      const fixture = await loadFixture(deployFixture);
      const { escrow, token, buyer, seller, arbitrator, AMOUNT } = fixture;
      await createAndFund(fixture);

      await escrow.connect(buyer).raiseDispute(0, "Issue");

      const sellerBalBefore = await token.balanceOf(seller.address);
      await expect(escrow.connect(arbitrator).resolveDispute(0, true))
        .to.emit(escrow, "DisputeResolved");

      const sellerBalAfter = await token.balanceOf(seller.address);
      expect(sellerBalAfter - sellerBalBefore).to.equal(AMOUNT);

      const e = await escrow.getEscrow(0);
      expect(e.state).to.equal(6); // Resolved
      expect(e.resolution).to.equal(1); // ReleasedToSeller
    });

    it("should allow arbitrator to resolve dispute — refund to buyer", async function () {
      const fixture = await loadFixture(deployFixture);
      const { escrow, token, buyer, arbitrator, AMOUNT } = fixture;
      await createAndFund(fixture);

      await escrow.connect(buyer).raiseDispute(0, "Fraud");

      const buyerBalBefore = await token.balanceOf(buyer.address);
      await escrow.connect(arbitrator).resolveDispute(0, false);

      const buyerBalAfter = await token.balanceOf(buyer.address);
      expect(buyerBalAfter - buyerBalBefore).to.equal(AMOUNT);

      const e = await escrow.getEscrow(0);
      expect(e.state).to.equal(6); // Resolved
      expect(e.resolution).to.equal(2); // RefundedToBuyer
    });

    it("should revert if non-arbitrator tries to resolve", async function () {
      const fixture = await loadFixture(deployFixture);
      await createAndFund(fixture);
      await fixture.escrow.connect(fixture.buyer).raiseDispute(0, "Issue");

      await expect(
        fixture.escrow.connect(fixture.buyer).resolveDispute(0, true)
      ).to.be.reverted;
    });

    it("should revert if escrow is not in Disputed state", async function () {
      const fixture = await loadFixture(deployFixture);
      await createAndFund(fixture);

      await expect(
        fixture.escrow.connect(fixture.arbitrator).resolveDispute(0, true)
      ).to.be.revertedWithCustomError(fixture.escrow, "InvalidState");
    });
  });

  // ─────────────── Expiry & Refund ───────────────

  describe("Expiry & Refund", function () {
    it("should allow marking expired after deadline", async function () {
      const fixture = await loadFixture(deployFixture);
      await createAndFund(fixture);

      // Fast-forward 7 days + 1 second
      await time.increase(7 * 24 * 60 * 60 + 1);

      await expect(fixture.escrow.markExpired(0))
        .to.emit(fixture.escrow, "EscrowExpired")
        .withArgs(0);

      const e = await fixture.escrow.getEscrow(0);
      expect(e.state).to.equal(7); // Expired
    });

    it("should revert markExpired before deadline", async function () {
      const fixture = await loadFixture(deployFixture);
      await createAndFund(fixture);

      await expect(
        fixture.escrow.markExpired(0)
      ).to.be.revertedWithCustomError(fixture.escrow, "EscrowNotExpired");
    });

    it("should allow buyer to refund after expiry", async function () {
      const fixture = await loadFixture(deployFixture);
      const { escrow, token, buyer, AMOUNT } = fixture;
      await createAndFund(fixture);

      await time.increase(7 * 24 * 60 * 60 + 1);
      await escrow.markExpired(0);

      const balBefore = await token.balanceOf(buyer.address);
      await expect(escrow.connect(buyer).refund(0))
        .to.emit(escrow, "FundsRefunded")
        .withArgs(0, buyer.address, AMOUNT);

      const balAfter = await token.balanceOf(buyer.address);
      expect(balAfter - balBefore).to.equal(AMOUNT);

      const e = await escrow.getEscrow(0);
      expect(e.state).to.equal(8); // Refunded
    });

    it("should revert refund if escrow is not expired", async function () {
      const fixture = await loadFixture(deployFixture);
      await createAndFund(fixture);

      await expect(
        fixture.escrow.connect(fixture.buyer).refund(0)
      ).to.be.revertedWithCustomError(fixture.escrow, "InvalidState");
    });

    it("should revert if non-buyer tries to refund", async function () {
      const fixture = await loadFixture(deployFixture);
      await createAndFund(fixture);

      await time.increase(7 * 24 * 60 * 60 + 1);
      await fixture.escrow.markExpired(0);

      await expect(
        fixture.escrow.connect(fixture.seller).refund(0)
      ).to.be.revertedWithCustomError(fixture.escrow, "NotBuyer");
    });

    it("should revert verifyDelivery after expiry", async function () {
      const fixture = await loadFixture(deployFixture);
      await createAndFund(fixture);

      await time.increase(7 * 24 * 60 * 60 + 1);

      await expect(
        fixture.escrow.connect(fixture.verifier).verifyDelivery(0)
      ).to.be.revertedWithCustomError(fixture.escrow, "EscrowNotExpired");
    });
  });

  // ─────────────── Terminal State Protection ───────────────

  describe("Terminal State Protection", function () {
    it("should revert funding a Released escrow", async function () {
      const fixture = await loadFixture(deployFixture);
      const { escrow, buyer, verifier } = fixture;
      await createAndFund(fixture);

      await escrow.connect(verifier).verifyDelivery(0);
      await escrow.connect(buyer).approveDelivery(0);
      await escrow.connect(buyer).releaseFunds(0);

      // Try to fund again — invalid
      await expect(
        escrow.connect(buyer).fundEscrow(0)
      ).to.be.revertedWithCustomError(escrow, "InvalidState");
    });

    it("should revert dispute on a Released escrow", async function () {
      const fixture = await loadFixture(deployFixture);
      const { escrow, buyer, verifier } = fixture;
      await createAndFund(fixture);

      await escrow.connect(verifier).verifyDelivery(0);
      await escrow.connect(buyer).approveDelivery(0);
      await escrow.connect(buyer).releaseFunds(0);

      await expect(
        escrow.connect(buyer).raiseDispute(0, "After release")
      ).to.be.revertedWithCustomError(escrow, "InvalidState");
    });

    it("should revert dispute on a Refunded escrow", async function () {
      const fixture = await loadFixture(deployFixture);
      const { escrow, buyer } = fixture;
      await createAndFund(fixture);

      await time.increase(7 * 24 * 60 * 60 + 1);
      await escrow.markExpired(0);
      await escrow.connect(buyer).refund(0);

      await expect(
        escrow.connect(buyer).raiseDispute(0, "After refund")
      ).to.be.revertedWithCustomError(escrow, "InvalidState");
    });

    it("should revert markExpired on a Disputed escrow", async function () {
      const fixture = await loadFixture(deployFixture);
      const { escrow, buyer } = fixture;
      await createAndFund(fixture);

      await escrow.connect(buyer).raiseDispute(0, "Issue");

      await time.increase(7 * 24 * 60 * 60 + 1);

      await expect(
        escrow.markExpired(0)
      ).to.be.revertedWithCustomError(escrow, "InvalidState");
    });
  });

  // ─────────────── View Functions ───────────────

  describe("View Functions", function () {
    it("isExpired should return false before deadline", async function () {
      const fixture = await loadFixture(deployFixture);
      await createAndFund(fixture);
      expect(await fixture.escrow.isExpired(0)).to.be.false;
    });

    it("isExpired should return true after deadline", async function () {
      const fixture = await loadFixture(deployFixture);
      await createAndFund(fixture);
      await time.increase(7 * 24 * 60 * 60 + 1);
      expect(await fixture.escrow.isExpired(0)).to.be.true;
    });

    it("getEscrowCount should reflect total created", async function () {
      const fixture = await loadFixture(deployFixture);
      const { escrow, buyer, seller, verifier, AMOUNT } = fixture;

      await escrow.connect(buyer).createEscrow(seller.address, verifier.address, AMOUNT, 0, "E1");
      await escrow.connect(buyer).createEscrow(seller.address, verifier.address, AMOUNT, 0, "E2");
      await escrow.connect(buyer).createEscrow(seller.address, verifier.address, AMOUNT, 0, "E3");

      expect(await escrow.getEscrowCount()).to.equal(3);
    });
  });
});
