import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { MockINR } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("MockINR", function () {
  async function deployFixture() {
    const [admin, user1, user2, nonAdmin] = await ethers.getSigners();

    const MockINR = await ethers.getContractFactory("MockINR");
    const token = await MockINR.deploy(admin.address);
    await token.waitForDeployment();

    return { token, admin, user1, user2, nonAdmin };
  }

  describe("Deployment", function () {
    it("should set the correct name and symbol", async function () {
      const { token } = await loadFixture(deployFixture);
      expect(await token.name()).to.equal("Mock Indian Rupee");
      expect(await token.symbol()).to.equal("mINR");
    });

    it("should have 18 decimals", async function () {
      const { token } = await loadFixture(deployFixture);
      expect(await token.decimals()).to.equal(18);
    });

    it("should start with 0 total supply", async function () {
      const { token } = await loadFixture(deployFixture);
      expect(await token.totalSupply()).to.equal(0);
    });

    it("should grant admin the DEFAULT_ADMIN_ROLE and MINTER_ROLE", async function () {
      const { token, admin } = await loadFixture(deployFixture);
      const DEFAULT_ADMIN_ROLE = await token.DEFAULT_ADMIN_ROLE();
      const MINTER_ROLE = await token.MINTER_ROLE();
      expect(await token.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
      expect(await token.hasRole(MINTER_ROLE, admin.address)).to.be.true;
    });

    it("should revert if deployed with zero address admin", async function () {
      const MockINR = await ethers.getContractFactory("MockINR");
      await expect(MockINR.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        MockINR,
        "ZeroAddress"
      );
    });
  });

  describe("KYC Management", function () {
    it("should allow admin to approve KYC", async function () {
      const { token, admin, user1 } = await loadFixture(deployFixture);
      await expect(token.approveKYC(user1.address))
        .to.emit(token, "KYCApproved")
        .withArgs(user1.address);
      expect(await token.kycApproved(user1.address)).to.be.true;
    });

    it("should allow admin to revoke KYC", async function () {
      const { token, admin, user1 } = await loadFixture(deployFixture);
      await token.approveKYC(user1.address);
      await expect(token.revokeKYC(user1.address))
        .to.emit(token, "KYCRevoked")
        .withArgs(user1.address);
      expect(await token.kycApproved(user1.address)).to.be.false;
    });

    it("should revert if non-admin approves KYC", async function () {
      const { token, user1, nonAdmin } = await loadFixture(deployFixture);
      await expect(token.connect(nonAdmin).approveKYC(user1.address)).to.be.reverted;
    });

    it("should revert if approving KYC for zero address", async function () {
      const { token } = await loadFixture(deployFixture);
      await expect(token.approveKYC(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        token,
        "ZeroAddress"
      );
    });
  });

  describe("Minting", function () {
    it("should allow admin to mint to KYC-approved wallet", async function () {
      const { token, admin, user1 } = await loadFixture(deployFixture);
      await token.approveKYC(user1.address);
      const amount = ethers.parseEther("50000");
      await token.mint(user1.address, amount);
      expect(await token.balanceOf(user1.address)).to.equal(amount);
    });

    it("should revert minting to non-KYC wallet", async function () {
      const { token, user1 } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("50000");
      await expect(token.mint(user1.address, amount)).to.be.revertedWithCustomError(
        token,
        "NotKYCApproved"
      );
    });

    it("should revert if non-admin calls mint", async function () {
      const { token, user1 } = await loadFixture(deployFixture);
      await expect(
        token.connect(user1).mint(user1.address, ethers.parseEther("100"))
      ).to.be.reverted;
    });
  });

  describe("Faucet", function () {
    it("should mint 100,000 mINR to KYC-approved caller", async function () {
      const { token, admin, user1 } = await loadFixture(deployFixture);
      await token.approveKYC(user1.address);

      const faucetAmount = ethers.parseEther("100000");
      await expect(token.connect(user1).faucet())
        .to.emit(token, "FaucetMint")
        .withArgs(user1.address, faucetAmount);

      expect(await token.balanceOf(user1.address)).to.equal(faucetAmount);
    });

    it("should allow multiple faucet calls", async function () {
      const { token, admin, user1 } = await loadFixture(deployFixture);
      await token.approveKYC(user1.address);

      await token.connect(user1).faucet();
      await token.connect(user1).faucet();

      const expected = ethers.parseEther("200000");
      expect(await token.balanceOf(user1.address)).to.equal(expected);
    });

    it("should revert faucet for non-KYC user", async function () {
      const { token, user1 } = await loadFixture(deployFixture);
      await expect(token.connect(user1).faucet()).to.be.revertedWithCustomError(
        token,
        "NotKYCApproved"
      );
    });
  });
});
