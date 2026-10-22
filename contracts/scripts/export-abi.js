/**
 * Export contract ABIs from Hardhat artifacts to the shared package.
 * Run after compilation: `npm run export-abi`
 */
const fs = require("fs");
const path = require("path");

const CONTRACTS = ["MockINR", "EscrowManager"];
const ARTIFACTS_DIR = path.join(__dirname, "..", "artifacts", "contracts");
const OUTPUT_DIR = path.join(__dirname, "..", "..", "shared", "abis");

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

for (const name of CONTRACTS) {
  const artifactPath = path.join(ARTIFACTS_DIR, `${name}.sol`, `${name}.json`);

  if (!fs.existsSync(artifactPath)) {
    console.error(`Artifact not found: ${artifactPath}`);
    console.error("Run 'npx hardhat compile' first.");
    process.exit(1);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
  const output = {
    contractName: name,
    abi: artifact.abi,
  };

  const outputPath = path.join(OUTPUT_DIR, `${name}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`Exported: ${outputPath}`);
}

console.log("\nABI export complete.");
