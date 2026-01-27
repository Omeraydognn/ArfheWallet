# ✅ FHE WRAPPER KONTRATI HAZIR!

## Başarılar
- ✅ WrappedUSDC.sol compiled
- ✅ WrappedETH.sol compiled  
- ✅ @fhenixprotocol/contracts@0.3.1 yüklendi
- ✅ FHERC20 base contract kullanımda

## Deployment Adımları

### 1. Environment Hazırlığı
```bash
cd /Users/omeraydogan/Projeler/ArfheWallet-Contracts
cp .env.example .env  # Varsa
# Yoksa:
echo "PRIVATE_KEY=your_private_key_without_0x" > .env
echo "SEPOLIA_RPC=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY" >> .env
```

### 2. Deploy (Sepolia)
```bash
npx hardhat run scripts/deploy-wrappers.ts --network sepolia
```

### 3. Verify (Opsiyonel)
```bash
npx hardhat verify --network sepolia CONTRACT_ADDRESS "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"
```

## Kontrat Adresleri (Deploy sonrası buraya eklenecek)

### Sepolia Testnet
```
cUSDC (WrappedUSDC): [DEPLOY EDİLECEK]
cWETH (WrappedETH):  [DEPLOY EDİLECEK]
```

### Underlying Tokens
```
USDC: 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
WETH: 0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9
```

## Kontrat Kullanımı

### Wrap (USDC → cUSDC)
```typescript
// 1. Approve wrapper
await usdc.approve(wrappedUSDC.address, amount);

// 2. Wrap
await wrappedUSDC.wrap(userAddress, amount);
```

### Unwrap (cUSDC → USDC)
```typescript
await wrappedUSDC.unwrap(userAddress, amount);
```

## Sonraki Adımlar

1. **Deploy et**:
   - .env dosyasını doldur
   - `npx hardhat run scripts/deploy-wrappers.ts --network sepolia`
   
2. **Contract adreslerini kopyala** (console output'tan)

3. **ArfheWallet'a entegre et**:
   - `/Users/omeraydogan/Projeler/ArfheWallet/.env` dosyasına ekle:
     ```
     REACT_APP_CUSDC_ADDRESS=0x...
     REACT_APP_CWETH_ADDRESS=0x...
     ```

4. **FheService.ts'i güncelle**:
   - eETH/eUSDC adreslerini yeni contract adresleri ile değiştir

## Test Senaryosu

### 1. USDC Faucet
```
https://faucet.circle.com/ (Sepolia USDC)
```

### 2. Wrap Test
```typescript
const usdc = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const amount = ethers.parseUnits("10", 6); // 10 USDC

// Approve
await (await ethers.getContractAt("IERC20", usdc)).approve(wrappedUSDC, amount);

// Wrap
await wrappedUSDC.wrap(myAddress, amount);

// Check encrypted balance
const encBalance = await wrappedUSDC.balanceOf(myAddress);
console.log("Encrypted balance:", encBalance);
```

### 3. Transfer Test
```typescript
// Confidential transfer
const recipient = "0x...";
await wrappedUSDC.transfer(recipient, amount);
```

### 4. Unwrap Test
```typescript
await wrappedUSDC.unwrap(myAddress, amount);

// Check USDC balance
const usdcBalance = await usdc.balanceOf(myAddress);
console.log("USDC Balance:", usdcBalance);
```

## NOT: CoFHE vs Fhenix L2

**UYARI**: Bu kontratlar **CoFHE v1 (experimental)** kullanıyor, henüz production-ready değil!

- ✅ Sepolia, Arbitrum Sepolia, Base Sepolia destekli
- ❌ Fhenix L2 (8008135) deprecated
- ⚠️  Experimental FHERC20 implementation

Production için:
- Fhenix'in resmi FHERC20Wrapper paketin bekle
- Veya kendi production-grade wrapper'ını yaz
- Security audit gerekli

## Dosyalar

- `/Users/omeraydogan/Projeler/ArfheWallet-Contracts/contracts/WrappedUSDC.sol` ✅
- `/Users/omeraydogan/Projeler/ArfheWallet-Contracts/contracts/WrappedETH.sol` ✅
- `/Users/omeraydogan/Projeler/ArfheWallet-Contracts/scripts/deploy-wrappers.ts` ✅
