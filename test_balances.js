const { JsonRpcProvider } = require('ethers');

const rpcs = [
  "https://eth-mainnet.g.alchemy.com/v2/QiGPOtyhV0PYWaqrD8XiJ",
  "https://eth-sepolia.g.alchemy.com/v2/QiGPOtyhV0PYWaqrD8XiJ",
  "https://arb-sepolia.g.alchemy.com/v2/QiGPOtyhV0PYWaqrD8XiJ",
  "https://base-sepolia.g.alchemy.com/v2/QiGPOtyhV0PYWaqrD8XiJ",
  "https://rpc.fhenix.zone"
];

const addresses = [
  "0x58acA82FF3185786d7a93C61525a3548434c30e5",
  "0x583DD1d9B22CdFF937EAaD4D1Ceb87bdeE907F1E",
  "0x90c78f89978970526E3D38d4eE83c80f4Ab24676"
];

async function main() {
  for (const addr of addresses) {
    console.log(`Checking memory for ${addr}`);
    for (const rpc of rpcs) {
      try {
        const provider = new JsonRpcProvider(rpc);
        const bal = await provider.getBalance(addr);
        const txCount = await provider.getTransactionCount(addr);
        if (bal > 0n || txCount > 0) {
          console.log(`  RPC ${rpc.substring(8, 20)}... -> Bal: ${bal}, TXs: ${txCount}`);
        }
      } catch (e) {
        console.log(`  RPC error ${rpc}`);
      }
    }
  }
}

main();
