import { useState, useEffect, useContext } from 'react';
import {
  Container,
  Paper,
  Typography,
  Box,
  Button,
  CircularProgress,
  Chip,
  Alert,
  Snackbar,
  LinearProgress
} from '@mui/material';
import {
  VerifiedUserRounded,
  RefreshRounded,
  SearchRounded
} from '@mui/icons-material';
import { WalletContext } from '../AppContext';
import { formatUnits, Interface, MaxUint256, JsonRpcProvider, Contract } from 'ethers';

// ERC20 ABI
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)"
];

// Common spenders (DEXs, protocols, etc.)
const COMMON_SPENDERS = [
  { address: '0x7a250d5630b4cF539739dF2C5dAcb4c659F2488D', name: 'Uniswap V2 Router' },
  { address: '0xE592427A0AEce92De3Edee1F18E0157C05861564', name: 'Uniswap V3 Router' },
  { address: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', name: 'Uniswap Universal Router' },
  { address: '0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008', name: 'Uniswap Sepolia Router' },
  { address: '0x1111111254EEB25477B68fb85Ed929f73A960582', name: '1inch V5 Router' },
  { address: '0xDef1C0ded9bec7F1a1670819833240f027b25EfF', name: '0x Exchange Proxy' },
  { address: '0x000000000022D473030F116dDEE9F6B43aC78BA3', name: 'Permit2' },
];

interface TokenApproval {
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimals: number;
  spenderAddress: string;
  spenderName: string;
  allowance: string;
  allowanceRaw: bigint;
  isUnlimited: boolean;
  riskScore: number;
}

// ============================================
// 🔧 PURE ETHERS.JS APPROVAL SCANNER SERVICE
// ============================================
class RevokeService {
  private provider: JsonRpcProvider;
  private approvalTopic = '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925'; // keccak256("Approval(address,address,uint256)")

  constructor(rpcUrl: string) {
    this.provider = new JsonRpcProvider(rpcUrl);
  }

  /**
   *  Ana fonksiyon: Kullanıcının tüm token approval'larını tara
   * @param ownerAddress - Cüzdan adresi (0x...)
   * @param scanDepth - Kaç blok geriye taranacak (varsayılan: 10,000 blok)
   * @param onProgress - Progress callback (0-100)
   */
  async scanApprovals(
    ownerAddress: string, 
    scanDepth: number = 10000,
    onProgress?: (progress: number, message: string) => void
  ): Promise<TokenApproval[]> {
    
    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║   ETHERS.JS APPROVAL SCANNER (AGÜ Project)     ║');
    console.log('╚════════════════════════════════════════════════════╝');
    console.log(' Owner:', ownerAddress);
    
    // Blok numaralarını hesapla
    const latestBlock = await this.provider.getBlockNumber();
    const startBlock = Math.max(0, latestBlock - scanDepth);
    const endBlock = latestBlock;

    console.log(` Scanning blocks: ${startBlock} → ${endBlock} (${endBlock - startBlock} blocks)`);
    
    // Owner topic (indexed parameter)
    const ownerTopic = '0x' + ownerAddress.slice(2).toLowerCase().padStart(64, '0');

    // STEP 1: Tüm Approval eventlerini tara (CHUNKED - Alchemy Free tier için)
    console.log('\n STEP 1: Fetching all Approval events (chunked scanning)...');
    
    const CHUNK_SIZE = 10; // Alchemy Free tier max 10 blok
    const allLogs: any[] = [];
    const totalChunks = Math.ceil((endBlock - startBlock) / CHUNK_SIZE);
    
    console.log(`    Will scan ${totalChunks} chunks of ${CHUNK_SIZE} blocks each`);
    
    // Progress tracking
    let processedChunks = 0;
    
    for (let currentBlock = startBlock; currentBlock <= endBlock; currentBlock += CHUNK_SIZE) {
      const chunkEnd = Math.min(currentBlock + CHUNK_SIZE - 1, endBlock);
      
      try {
        const chunkLogs = await this.provider.getLogs({
          topics: [this.approvalTopic, ownerTopic],
          fromBlock: currentBlock,
          toBlock: chunkEnd
        });
        
        allLogs.push(...chunkLogs);
        processedChunks++;
        
        // 🔥 Gerçek zamanlı progress güncelle!
        const progressPercent = Math.round((processedChunks / totalChunks) * 70); // 0-70% (STEP 1)
        const progressMessage = `🔎 Scanning blocks... ${processedChunks}/${totalChunks} chunks`;
        
        if (onProgress) {
          onProgress(30 + progressPercent, progressMessage); // 30-100% aralığı
        }
        
        // Her 10 chunk'ta bir konsola yazdır
        if (processedChunks % 10 === 0 || processedChunks === totalChunks) {
          console.log(`    Progress: ${processedChunks}/${totalChunks} chunks (${progressPercent}%)`);
        }
        
      } catch (err: any) {
        console.warn(`    Failed to scan blocks ${currentBlock}-${chunkEnd}: ${err.message}`);
        // Continue with next chunk
      }
    }

    console.log(`✅ Found ${allLogs.length} total approval events across ${processedChunks} chunks`);

    if (allLogs.length === 0) {
      console.log('ℹ No approval events found in this block range');
      return [];
    }

    // STEP 2: Token adreslerini grupla
    const tokenAddresses = new Set<string>();
    allLogs.forEach(log => {
      if (log.address) {
        tokenAddresses.add(log.address.toLowerCase());
      }
    });

    console.log(`\n STEP 2: Found ${tokenAddresses.size} unique tokens`);
    console.log(`   Tokens: ${Array.from(tokenAddresses).map(t => t.slice(0, 8) + '...').join(', ')}`);

    // STEP 3: Her token için en güncel approval'ları bul
    const approvals: TokenApproval[] = [];
    let processedCount = 0;

    for (const tokenAddress of tokenAddresses) {
      processedCount++;
      console.log(`\n[${processedCount}/${tokenAddresses.size}]  Analyzing ${tokenAddress.slice(0, 8)}...`);

      try {
        // Token metadata çek (symbol, decimals, name)
        const tokenContract = new Contract(tokenAddress, ERC20_ABI, this.provider);
        
        const [symbol, decimals, name] = await Promise.all([
          tokenContract.symbol().catch(() => 'UNKNOWN'),
          tokenContract.decimals().catch(() => 18),
          tokenContract.name().catch(() => 'Unknown Token')
        ]);

        console.log(`    ${symbol} (${name}) - ${decimals} decimals`);

        // Bu token için tüm approval loglarını filtrele
        const tokenLogs = allLogs.filter((log: any) => log.address.toLowerCase() === tokenAddress);
        
        // Spender'ları grupla ve en son logu al
        const latestApprovals = this.getLatestApprovalsPerSpender(tokenLogs);

        // Her spender için güncel allowance kontrolü
        for (const [spenderAddress, log] of latestApprovals.entries()) {
          try {
            // allowance(owner, spender) çağrısı
            const currentAllowance = await tokenContract.allowance(ownerAddress, spenderAddress);

            // Sıfırsa (iptal edilmiş), atla
            if (currentAllowance === 0n) {
              console.log(`      ○ ${spenderAddress.slice(0, 8)}...: Revoked (0)`);
              continue;
            }

            // Unlimited mı kontrol et
            const isUnlimited = currentAllowance >= MaxUint256 / 2n;
            const allowanceFormatted = isUnlimited 
              ? '∞ UNLIMITED'
              : formatUnits(currentAllowance, decimals);

            // Spender ismini bul (varsa)
            const spenderInfo = COMMON_SPENDERS.find(
              s => s.address.toLowerCase() === spenderAddress.toLowerCase()
            );
            const spenderName = spenderInfo?.name || `Contract ${spenderAddress.slice(0, 6)}...`;

            console.log(`       ${spenderName}: ${allowanceFormatted} ${symbol}`);

            approvals.push({
              tokenAddress,
              tokenName: name,
              tokenSymbol: symbol,
              tokenDecimals: decimals,
              spenderAddress,
              spenderName,
              allowance: `${allowanceFormatted} ${symbol}`,
              allowanceRaw: currentAllowance,
              isUnlimited,
              riskScore: isUnlimited ? 90 : 40
            });

          } catch (err: any) {
            console.warn(`       Failed to check allowance for ${spenderAddress.slice(0, 8)}: ${err.message}`);
          }
        }

      } catch (err: any) {
        console.error(`    Failed to process token ${tokenAddress}: ${err.message}`);
      }
    }

    // SUMMARY
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║   SCAN COMPLETE                                 ║');
    console.log('╚════════════════════════════════════════════════════╝');
    console.log(` Active Approvals: ${approvals.length}`);
    console.log(` Unlimited Approvals: ${approvals.filter(a => a.isUnlimited).length}`);

    return approvals;
  }

  /**
   * 🎯 Her spender için en son (en güncel) approval'ı döndür
   * Aynı spender için birden fazla log varsa, sadece en son blok numaralısını al
   */
  private getLatestApprovalsPerSpender(logs: any[]): Map<string, any> {
    const spenderMap = new Map<string, any>();

    logs.forEach(log => {
      if (!log.topics || log.topics.length < 3) return;

      // Spender adresi topic[2]'de (indexed parameter)
      const spenderAddress = ('0x' + log.topics[2].slice(-40)).toLowerCase();

      // Eğer bu spender için daha eski bir log varsa, yeniyle değiştir
      const existing = spenderMap.get(spenderAddress);
      if (!existing || log.blockNumber > existing.blockNumber) {
        spenderMap.set(spenderAddress, log);
      }
    });

    return spenderMap;
  }
}

const RevokeAlchemyPage = () => {
  const context = useContext(WalletContext);
  const activeAccount = context?.accountManager?.GetActive();
  const network = context?.networkProvider?.getActiveNetwork();
  const wcService = context?.walletConnectService;
  
  const [approvals, setApprovals] = useState<TokenApproval[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanProgress, setScanProgress] = useState(0); // 0-100 progress bar
  const [scanMessage, setScanMessage] = useState(''); // Loading mesajı
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch WalletConnect sessions
  const fetchSessions = async () => {
    if (!wcService || !wcService.client) {
      setSessions([]);
      return;
    }

    try {
      const activeSessions = wcService.client.session.getAll();
      setSessions(activeSessions || []);
    } catch (err) {
      console.error('[Revoke] Failed to fetch WC sessions:', err);
      setSessions([]);
    }
  };

  // Disconnect WalletConnect session
  const handleDisconnectSession = async (topic: string) => {
    if (!wcService || !wcService.client) return;
    
    try {
      await wcService.client.disconnect({
        topic,
        reason: {
          code: 6000,
          message: 'User disconnected'
        }
      });
      setSuccess('dApp disconnected!');
      fetchSessions();
    } catch (err: any) {
      console.error('[Revoke] Disconnect error:', err);
      setError('Failed to disconnect: ' + err.message);
    }
  };

  // ============================================
  //  PURE ETHERS.JS APPROVAL SCANNER
  // ============================================
  const fetchApprovals = async () => {
    if (!activeAccount || !network || !network.rpc_url) {
      setError('Wallet not connected or RPC not available');
      return;
    }

    setLoading(true);
    setError(null);
    setScanProgress(0);
    setScanMessage('� Initializing scanner...');

    try {
      const ownerAddress = activeAccount.GetAddress();
      
      if (!ownerAddress) {
        throw new Error('No wallet address found');
      }
      
      // RevokeService instance oluştur
      setScanMessage('📡 Connecting to blockchain...');
      setScanProgress(10);
      const scanner = new RevokeService(network.rpc_url);

      // ⚠️ Alchemy Free tier: max 10 blok per request
      // 10,000 blok = 1,000 request → TOO SLOW!
      // Bunun yerine 500 blok tarayalım (50 request = ~10 saniye)
      setScanMessage('🔎 Scanning last 500 blocks for approvals...');
      setScanProgress(30);
      
      // 🔥 Progress callback ile gerçek zamanlı güncelleme!
      const results = await scanner.scanApprovals(ownerAddress, 500, (progress, message) => {
        setScanProgress(progress);
        setScanMessage(message);
      });

      setScanProgress(100);
      setScanMessage(' Scan complete!');
      setApprovals(results);

      // Success mesajı
      if (results.length === 0) {
        setSuccess(' No active approvals found in last 500 blocks (~2 hours)');
      } else {
        const unlimitedCount = results.filter(a => a.isUnlimited).length;
        setSuccess(`Found ${results.length} approval(s)${unlimitedCount > 0 ? ` (${unlimitedCount} unlimited!)` : ''}`);
      }

    } catch (err: any) {
      console.error(' Scan Error:', err);
      setError(err.message || 'Failed to scan approvals');
      setScanMessage('');
    } finally {
      setLoading(false);
      setTimeout(() => setScanMessage(''), 2000);
    }
  };

  // Revoke approval
  const handleRevoke = async (approval: TokenApproval) => {
    if (!activeAccount || !network) return;

    try {
      const iface = new Interface(ERC20_ABI);
      const data = iface.encodeFunctionData('approve', [approval.spenderAddress, 0]);

      const txHash = await network.sendTransaction(activeAccount, {
        to: approval.tokenAddress,
        value: '0',
        data,
        gasLimit: 100000n
      });

      setSuccess(`Revoked! Tx: ${txHash.slice(0, 10)}...`);
      setTimeout(fetchApprovals, 3000);

    } catch (e: any) {
      setError(e.message || 'Revoke failed');
    }
  };

  useEffect(() => {
    if (activeAccount && network) {
      fetchApprovals();
      fetchSessions();
    }
  }, [activeAccount, network]);

  return (
    <Box sx={{ pb: 12, minHeight: '100vh' }}>
      <Container maxWidth="md" sx={{ py: 4 }}>
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Typography variant="h4" fontWeight={800} gutterBottom
            sx={{ background: 'linear-gradient(90deg, #fff, #6366f1, #fff', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
             Revoke
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Review and revoke your ERC20 token permissions granted to dApps and smart contracts.
          </Typography>
          
          <Button 
            startIcon={loading ? <CircularProgress size={16} /> : <RefreshRounded />} 
            onClick={() => { fetchApprovals(); fetchSessions(); }} 
            disabled={loading} 
            sx={{ mt: 2 }}
            variant="contained"
          >
            {loading ? 'Scanning...' : 'Refresh Approvals'}
          </Button>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

        {/* 🎨 ŞIKALI LOADING SCREEN - Abdullah Gül Üniversitesi Projesi */}
        {loading && (
          <Paper sx={{ p: 4, mb: 3, textAlign: 'center', background: 'linear-gradient(135deg, rgba(102,126,234,0.1) 0%, rgba(118,75,162,0.1) 100%)' }}>
            <SearchRounded sx={{ fontSize: 60, color: 'primary.main', mb: 2 }} />
            <Typography variant="h6" fontWeight={600} gutterBottom>
              {scanMessage || 'Geçmiş izinler taranıyor...'}
            </Typography>
            <LinearProgress 
              variant="determinate" 
              value={scanProgress} 
              sx={{ 
                mt: 2, 
                height: 8, 
                borderRadius: 4,
                transition: 'all 0.3s ease-in-out', // 🔥 Smooth animation
                '& .MuiLinearProgress-bar': {
                  background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
                  transition: 'transform 0.3s ease-in-out' // 🔥 Smooth bar fill
                }
              }} 
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              {scanProgress}% tamamlandı
            </Typography>
          </Paper>
        )}

        {/* WalletConnect Sessions */}
        {sessions.length > 0 && (
          <Box sx={{ mb: 4 }}>
            <Typography variant="h6" gutterBottom> Connected dApps ({sessions.length})</Typography>
            {sessions.map(s => (
              <Paper key={s.topic} sx={{ p: 2, mb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography fontWeight={600}>{s.peer.metadata.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{s.peer.metadata.url}</Typography>
                </Box>
                <Button size="small" color="error" onClick={() => handleDisconnectSession(s.topic)}>Disconnect</Button>
              </Paper>
            ))}
          </Box>
        )}

        {/* Approvals */}
        {approvals.length > 0 && (
          <Box>
            <Typography variant="h6" gutterBottom> Token Permissions ({approvals.length})</Typography>
            {approvals.map((a, i) => (
              <Paper key={i} sx={{ p: 2, mb: 2, borderLeft: a.isUnlimited ? '4px solid red' : '4px solid #667eea' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography fontWeight={600}>{a.tokenSymbol} - {a.tokenName}</Typography>
                  <Chip label={a.isUnlimited ? ' UNLIMITED' : '✓ Limited'} color={a.isUnlimited ? 'error' : 'warning'} size="small" />
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                  <strong>Spender:</strong> {a.spenderName}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block', fontFamily: 'monospace' }}>
                  {a.spenderAddress}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  <strong>Allowance:</strong> {a.allowance}
                </Typography>
                <Button fullWidth variant="contained" color="error" onClick={() => handleRevoke(a)} sx={{ mt: 1 }}>
                   Revoke Permission
                </Button>
              </Paper>
            ))}
          </Box>
        )}

        {!loading && approvals.length === 0 && sessions.length === 0 && (
          <Paper sx={{ p: 4, textAlign: 'center', bgcolor: 'rgba(34, 197, 94, 0.1)' }}>
            <VerifiedUserRounded sx={{ fontSize: 64, color: '#22c55e', mb: 2 }} />
            <Typography variant="h6">All Clear!</Typography>
            <Typography variant="body2" color="text.secondary">No active approvals or connections.</Typography>
          </Paper>
        )}

        <Snackbar open={!!success} autoHideDuration={6000} onClose={() => setSuccess(null)} message={success} />
      </Container>
    </Box>
  );
};

export default RevokeAlchemyPage;

