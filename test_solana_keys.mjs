import { Keypair } from '@solana/web3.js';
import { derivePath } from 'ed25519-hd-key';
import { Mnemonic, HDNodeWallet } from 'ethers';
import bs58 from 'bs58';

const mnemonic = "test test test test test test test test test test test junk";
console.log("Mnemonic:", mnemonic);

const ethersWallet = HDNodeWallet.fromPhrase(mnemonic, "", "m/44'/60'/0'/0/0");
console.log("EVM Address:", ethersWallet.address);
console.log("EVM Private Key:", ethersWallet.privateKey);

const seedHex = Mnemonic.fromPhrase(mnemonic).computeSeed().slice(2);
const derivedSeed = derivePath("m/44'/501'/0'/0'", seedHex).key;
const solanaKeypair = Keypair.fromSeed(derivedSeed);

console.log("Solana Address (Base58):", solanaKeypair.publicKey.toBase58());
console.log("Solana Private Key (Base58):", bs58.encode(solanaKeypair.secretKey));
