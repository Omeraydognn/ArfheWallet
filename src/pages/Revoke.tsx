import { useState, useEffect, useContext, useCallback } from 'react';
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
  LinearProgress,
  Avatar,
  Stack,
  Divider,
  Tooltip,
  useTheme,
  alpha
} from '@mui/material';
import {
  VerifiedUserRounded,
  RefreshRounded,
  SearchRounded,
  LinkOffRounded,
  LanguageRounded,
  AccessTimeRounded,
  CheckCircleOutlineRounded
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

const CHAIN_LABELS: Record<string, { name: string; color: string }> = {
  "eip155:1": { name: "Ethereum", color: "#627EEA" },
  "eip155:11155111": { name: "Sepolia", color: "#9B59B6" },
  "eip155:137": { name: "Polygon", color: "#8247E5" },
  "eip155:42161": { name: "Arbitrum", color: "#28A0F0" },
  "eip155:10": { name: "Optimism", color: "#FF0420" },
  "eip155:8453": { name: "Base", color: "#0052FF" },
};

const RevokeAlchemyPage = () => {
  const context = useContext(WalletContext);
  const activeAccount = context?.accountManager?.GetActive();
  const network = context?.networkProvider?.getActiveNetwork();
  const wcService = context?.walletConnectService;
  const theme = useTheme();

  const [approvals, setApprovals] = useState<TokenApproval[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [disconnectingAll, setDisconnectingAll] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanMessage, setScanMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch WalletConnect sessions via service helper
  const fetchSessions = useCallback(() => {
    if (!wcService) {
      setSessions([]);
      return;
    }
    try {
      const activeSessions = wcService.getActiveSessions();
      setSessions(activeSessions || []);
    } catch (err) {
      console.error('[Revoke] Failed to fetch WC sessions:', err);
      setSessions([]);
    }
  }, [wcService]);

  // Auto-refresh when sessions change
  useEffect(() => {
    if (!wcService) return;
    wcService.setOnSessionUpdate(() => fetchSessions());
    return () => wcService.setOnSessionUpdate(() => { });
  }, [wcService, fetchSessions]);

  // Disconnect single WalletConnect session
  const handleDisconnectSession = async (topic: string) => {
    if (!wcService) return;
    try {
      await wcService.disconnect(topic);
      setSuccess('dApp disconnected successfully');
      fetchSessions();
    } catch (err: any) {
      console.error('[Revoke] Disconnect error:', err);
      setError('Failed to disconnect: ' + err.message);
    }
  };

  // Disconnect ALL sessions silently
  const handleDisconnectAll = async () => {
    if (!wcService) return;
    setDisconnectingAll(true);
    try {
      const count = await wcService.disconnectAll();
      setSuccess(`All ${count} connection(s) disconnected`);
      fetchSessions();
    } catch (err: any) {
      setError('Failed to disconnect all: ' + err.message);
    } finally {
      setDisconnectingAll(false);
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

        {/* 🎨 ŞIKALI LOADING SCREEN */}
        {loading && (
          <Paper sx={{
            p: 6,
            mb: 4,
            textAlign: 'center',
            borderRadius: 4,
            background: 'linear-gradient(135deg, rgba(102,126,234,0.05) 0%, rgba(118,75,162,0.05) 100%)',
            border: '1px solid',
            borderColor: 'divider',
            backdropFilter: 'blur(10px)'
          }}>
            <SearchRounded sx={{ fontSize: 60, color: 'primary.main', mb: 2, opacity: 0.8 }} />
            <Typography variant="h6" fontWeight={700} gutterBottom>
              {scanMessage || 'Scanning past permissions...'}
            </Typography>
            <Box sx={{ width: '80%', maxWidth: 400, mx: 'auto', mt: 3 }}>
              <LinearProgress
                variant="determinate"
                value={scanProgress}
                sx={{
                  height: 6,
                  borderRadius: 3,
                  bgcolor: 'action.hover',
                  '& .MuiLinearProgress-bar': {
                    background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
                  }
                }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block', fontWeight: 600 }}>
                {scanProgress}% complete
              </Typography>
            </Box>
          </Paper>
        )}

        {/* WalletConnect Sessions */}
        {sessions.length > 0 && (
          <Box sx={{ mb: 4 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="h6" fontWeight={700}>
                Connected dApps ({sessions.length})
              </Typography>
              {sessions.length > 1 && (
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  startIcon={disconnectingAll ? <CircularProgress size={14} /> : <LinkOffRounded />}
                  onClick={handleDisconnectAll}
                  disabled={disconnectingAll}
                  sx={{ borderRadius: 2, fontWeight: 600, textTransform: 'none' }}
                >
                  Disconnect All
                </Button>
              )}
            </Stack>
            {sessions.map((s: any) => {
              const peerMeta = s.peer?.metadata || {};
              const chains = Object.values(s.namespaces || {}).flatMap((ns: any) => ns.chains || ns.accounts?.map((a: string) => a.split(':').slice(0, 2).join(':')) || []);
              const uniqueChains = [...new Set(chains)];
              const expiryDate = s.expiry ? new Date(s.expiry * 1000) : null;
              const isExpired = expiryDate ? expiryDate < new Date() : false;

              return (
                <Paper
                  key={s.topic}
                  elevation={0}
                  sx={{
                    p: 2.5,
                    mb: 1.5,
                    borderRadius: 4,
                    border: '1px solid',
                    borderColor: isExpired ? 'error.light' : 'rgba(0,0,0,0.05)',
                    bgcolor: isExpired ? 'rgba(239,68,68,0.04)' : alpha(theme.palette.background.paper, 0.85),
                    backdropFilter: 'blur(20px)',
                    boxShadow: '0 8px 32px -8px rgba(0,0,0,0.08)',
                    transition: 'all 0.2s',
                    '&:hover': { borderColor: 'primary.main', boxShadow: '0 8px 32px 0px rgba(99,102,241,0.15)', transform: 'translateY(-2px)' },
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={2}>
                    <Avatar
                      src={peerMeta.icons?.[0]}
                      sx={{ width: 44, height: 44, bgcolor: 'primary.main', border: '2px solid', borderColor: 'divider' }}
                    >
                      {peerMeta.name?.[0]?.toUpperCase() || '?'}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography fontWeight={700} sx={{ fontSize: '0.95rem' }}>
                        {peerMeta.name || 'Unknown dApp'}
                      </Typography>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <LanguageRounded sx={{ fontSize: 12, color: 'text.secondary' }} />
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {peerMeta.url || 'No URL'}
                        </Typography>
                      </Stack>
                      <Stack direction="row" gap={0.5} sx={{ mt: 0.75 }} flexWrap="wrap">
                        {uniqueChains.map((chain: string) => {
                          const label = CHAIN_LABELS[chain];
                          return (
                            <Chip
                              key={chain}
                              size="small"
                              label={label?.name || chain}
                              sx={{
                                fontSize: '0.65rem',
                                height: 20,
                                fontWeight: 600,
                                bgcolor: label ? `${label.color}15` : '#88888815',
                                color: label?.color || '#888',
                                border: '1px solid',
                                borderColor: label ? `${label.color}30` : '#88888830',
                              }}
                            />
                          );
                        })}
                        {expiryDate && (
                          <Tooltip title={`Expires: ${expiryDate.toLocaleString()}`} arrow>
                            <Chip
                              size="small"
                              icon={<AccessTimeRounded sx={{ fontSize: 12 }} />}
                              label={isExpired ? 'Expired' : expiryDate.toLocaleDateString()}
                              sx={{
                                fontSize: '0.65rem',
                                height: 20,
                                fontWeight: 600,
                                color: isExpired ? '#ef4444' : 'text.secondary',
                                '& .MuiChip-icon': { color: 'inherit' },
                              }}
                              variant="outlined"
                            />
                          </Tooltip>
                        )}
                      </Stack>
                    </Box>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      onClick={() => handleDisconnectSession(s.topic)}
                      startIcon={<LinkOffRounded sx={{ fontSize: 16 }} />}
                      sx={{ borderRadius: 2, fontWeight: 600, textTransform: 'none', minWidth: 110 }}
                    >
                      Disconnect
                    </Button>
                  </Stack>
                </Paper>
              );
            })}
          </Box>
        )}

        {/* Approvals */}
        {approvals.length > 0 && (
          <Box>
            <Typography variant="h6" gutterBottom> Token Permissions ({approvals.length})</Typography>
            {approvals.map((a, i) => (
              <Paper key={i} sx={{
                p: 2.5,
                mb: 2,
                borderRadius: 4,
                bgcolor: alpha(theme.palette.background.paper, 0.85),
                backdropFilter: 'blur(20px)',
                boxShadow: '0 8px 32px -8px rgba(0,0,0,0.08)',
                border: '1px solid',
                borderColor: 'divider',
                borderLeft: a.isUnlimited ? '4px solid #ef4444' : '4px solid #6366f1'
              }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, alignItems: 'center' }}>
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
          <Paper sx={{
            p: 8,
            textAlign: 'center',
            bgcolor: alpha(theme.palette.success.main, 0.05),
            backdropFilter: 'blur(20px)',
            border: '1px solid',
            borderColor: alpha(theme.palette.success.main, 0.2),
            borderRadius: 4,
            boxShadow: '0 10px 40px -10px rgba(34,197,94,0.1)'
          }}>
            <VerifiedUserRounded sx={{ fontSize: 72, color: theme.palette.success.main, mb: 3 }} />
            <Typography variant="h5" fontWeight={800} gutterBottom>All Clear!</Typography>
            <Typography variant="body1" color="text.secondary" fontWeight={500}>Your wallet is secure. No active approvals or connections.</Typography>
          </Paper>
        )}

        <Snackbar open={!!success} autoHideDuration={6000} onClose={() => setSuccess(null)} message={success} />
      </Container>
    </Box>
  );
};

export default RevokeAlchemyPage;

