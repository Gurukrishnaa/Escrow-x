import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // Deploy MockINR
  const MockINR = await ethers.getContractFactory("MockINR");
  const token = await MockINR.deploy(deployer.address);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("MockINR deployed to:", tokenAddress);

  // Deploy EscrowManager
  const EscrowManager = await ethers.getContractFactory("EscrowManager");
  const escrow = await EscrowManager.deploy(tokenAddress, deployer.address);
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log("EscrowManager deployed to:", escrowAddress);

  console.log("\n--- Deployment Summary ---");
  console.log(`MockINR:       ${tokenAddress}`);
  console.log(`EscrowManager: ${escrowAddress}`);
  console.log(`Admin:         ${deployer.address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
