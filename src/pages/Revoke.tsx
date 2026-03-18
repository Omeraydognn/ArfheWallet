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
  CheckCircleOutlineRounded,
  ShieldRounded,
  WarningAmberRounded,
  GppBadRounded,
  GppGoodRounded,
  SecurityRounded,
} from '@mui/icons-material';
import { WalletContext } from '../AppContext';
import { formatUnits, Interface, MaxUint256, JsonRpcProvider, Contract, Log } from 'ethers';
import type { WCSessionInfo, WCNamespace } from '../types/index';

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
  riskScore: number;       // 0-100
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  riskReasons: string[];   // List of reasons contributing to risk
}

// ─── Risk Score Calculation ─────────────────────────────────────
function calculateApprovalRisk(
  allowanceRaw: bigint,
  isUnlimited: boolean,
  spenderAddress: string,
  tokenDecimals: number,
): { score: number; level: 'critical' | 'high' | 'medium' | 'low'; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // 1. Unlimited approval (+50 points)
  if (isUnlimited) {
    score += 50;
    reasons.push('Unlimited approval — spender can drain all tokens');
  } else {
    // Large but finite approval
    const allowanceFloat = Number(allowanceRaw) / Math.pow(10, tokenDecimals);
    if (allowanceFloat > 1_000_000) {
      score += 35;
      reasons.push(`Very large allowance (${allowanceFloat.toLocaleString()} tokens)`);
    } else if (allowanceFloat > 10_000) {
      score += 20;
      reasons.push(`Significant allowance (${allowanceFloat.toLocaleString()} tokens)`);
    } else if (allowanceFloat > 100) {
      score += 10;
      reasons.push('Moderate allowance');
    } else {
      score += 5;
      reasons.push('Small allowance');
    }
  }

  // 2. Unknown spender (+30 points)
  const isKnownSpender = COMMON_SPENDERS.some(
    s => s.address.toLowerCase() === spenderAddress.toLowerCase()
  );
  if (!isKnownSpender) {
    score += 30;
    reasons.push('Unknown/unverified spender contract');
  } else {
    score += 5;
    reasons.push('Known protocol spender');
  }

  // 3. Base risk for any active approval (+10)
  score += 10;

  // Cap at 100
  score = Math.min(score, 100);

  // Determine level
  let level: 'critical' | 'high' | 'medium' | 'low';
  if (score >= 75) level = 'critical';
  else if (score >= 50) level = 'high';
  else if (score >= 30) level = 'medium';
  else level = 'low';

  return { score, level, reasons };
}

// Risk level → visual config
const RISK_CONFIG = {
  critical: { color: '#dc2626', bg: '#dc262615', label: 'Critical', icon: GppBadRounded },
  high: { color: '#ef4444', bg: '#ef444412', label: 'High Risk', icon: WarningAmberRounded },
  medium: { color: '#f59e0b', bg: '#f59e0b10', label: 'Medium', icon: ShieldRounded },
  low: { color: '#22c55e', bg: '#22c55e10', label: 'Low Risk', icon: GppGoodRounded },
};

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

    // Blok numaralarını hesapla
    const latestBlock = await this.provider.getBlockNumber();
    const startBlock = Math.max(0, latestBlock - scanDepth);
    const endBlock = latestBlock;

    // Owner topic (indexed parameter)
    const ownerTopic = '0x' + ownerAddress.slice(2).toLowerCase().padStart(64, '0');

    // STEP 1: Tüm Approval eventlerini tara (CHUNKED - Alchemy Free tier için)
    const CHUNK_SIZE = 10; // Alchemy Free tier max 10 blok
    const allLogs: Log[] = [];
    const totalChunks = Math.ceil((endBlock - startBlock) / CHUNK_SIZE);

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
        const progressMessage = `Scanning blocks... ${processedChunks}/${totalChunks} chunks`;

        if (onProgress) {
          onProgress(30 + progressPercent, progressMessage); // 30-100% aralığı
        }

      } catch (err) {
        // Continue with next chunk
      }
    }

    if (allLogs.length === 0) {
      return [];
    }

    // STEP 2: Token adreslerini grupla
    const tokenAddresses = new Set<string>();
    allLogs.forEach(log => {
      if (log.address) {
        tokenAddresses.add(log.address.toLowerCase());
      }
    });

    // STEP 3: Her token için en güncel approval'ları bul
    const approvals: TokenApproval[] = [];
    let processedCount = 0;

    for (const tokenAddress of tokenAddresses) {
      processedCount++;

      try {
        // Token metadata çek (symbol, decimals, name)
        const tokenContract = new Contract(tokenAddress, ERC20_ABI, this.provider);

        const [symbol, decimals, name] = await Promise.all([
          tokenContract.symbol().catch(() => 'UNKNOWN'),
          tokenContract.decimals().catch(() => 18),
          tokenContract.name().catch(() => 'Unknown Token')
        ]);

        // Bu token için tüm approval loglarını filtrele
        const tokenLogs = allLogs.filter((log) => log.address.toLowerCase() === tokenAddress);

        // Spender'ları grupla ve en son logu al
        const latestApprovals = this.getLatestApprovalsPerSpender(tokenLogs);

        // Her spender için güncel allowance kontrolü
        for (const [spenderAddress, log] of latestApprovals.entries()) {
          try {
            // allowance(owner, spender) çağrısı
            const currentAllowance = await tokenContract.allowance(ownerAddress, spenderAddress);

            // Sıfırsa (iptal edilmiş), atla
            if (currentAllowance === 0n) {
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

            const risk = calculateApprovalRisk(currentAllowance, isUnlimited, spenderAddress, decimals);

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
              riskScore: risk.score,
              riskLevel: risk.level,
              riskReasons: risk.reasons,
            });

          } catch (err) {
          }
        }

      } catch (err) {
      }
    }

    return approvals;
  }

  /**
   * 🎯 Her spender için en son (en güncel) approval'ı döndür
   * Aynı spender için birden fazla log varsa, sadece en son blok numaralısını al
   */
  private getLatestApprovalsPerSpender(logs: Log[]): Map<string, Log> {
    const spenderMap = new Map<string, Log>();

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
  "eip155:421614": { name: "Arb Sepolia", color: "#28A0F0" },
  "eip155:10": { name: "Optimism", color: "#FF0420" },
  "eip155:11155420": { name: "OP Sepolia", color: "#FF0420" },
  "eip155:8453": { name: "Base", color: "#0052FF" },
  "eip155:84532": { name: "Base Sepolia", color: "#0052FF" },
  "eip155:56": { name: "BNB Chain", color: "#F0B90B" },
  "eip155:43114": { name: "Avalanche", color: "#E84142" },
  "eip155:250": { name: "Fantom", color: "#1969FF" },
  "eip155:100": { name: "Gnosis", color: "#04795B" },
  "eip155:42220": { name: "Celo", color: "#35D07F" },
  "eip155:130": { name: "Unichain", color: "#FF007A" },
  "eip155:480": { name: "World Chain", color: "#1A1A1A" },
};

const RevokeAlchemyPage = () => {
  const context = useContext(WalletContext);
  const activeAccount = context?.accountManager?.GetActive();
  const network = context?.networkProvider?.getActiveNetwork();
  const wcService = context?.walletConnectService;
  const theme = useTheme();

  const [approvals, setApprovals] = useState<TokenApproval[]>([]);
  const [sessions, setSessions] = useState<WCSessionInfo[]>([]);
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
    } catch (err) {
      setError('Failed to disconnect: ' + (err instanceof Error ? err.message : String(err)));
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
    } catch (err) {
      setError('Failed to disconnect all: ' + (err instanceof Error ? err.message : String(err)));
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
    setScanMessage('Initializing scanner...');

    try {
      const ownerAddress = activeAccount.GetAddress();

      if (!ownerAddress) {
        throw new Error('No wallet address found');
      }

      setScanMessage('Connecting to blockchain...');
      setScanProgress(10);
      const scanner = new RevokeService(network.rpc_url);

      setScanMessage('Scanning recent blocks for approvals...');
      setScanProgress(30);

      const results = await scanner.scanApprovals(ownerAddress, 500, (progress, message) => {
        setScanProgress(progress);
        // Strip emojis from the scanner callback
        setScanMessage(message.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim());
      });

      setScanProgress(100);
      setScanMessage('Scan complete');
      setApprovals(results);

      if (results.length === 0) {
        setSuccess('No active approvals found in last 500 blocks');
      } else {
        const unlimitedCount = results.filter(a => a.isUnlimited).length;
        setSuccess(`Found ${results.length} approval(s)${unlimitedCount > 0 ? ` — ${unlimitedCount} unlimited` : ''}`);
      }

    } catch (err) {
      setError((err instanceof Error ? err.message : String(err)) || 'Failed to scan approvals');
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

      setSuccess(`Revoked — tx: ${txHash.slice(0, 10)}...`);
      setTimeout(fetchApprovals, 3000);

    } catch (e) {
      setError((e instanceof Error ? e.message : String(e)) || 'Revoke failed');
    }
  };

  useEffect(() => {
    if (activeAccount && network) {
      fetchApprovals();
      fetchSessions();
    }
  }, [activeAccount, network]);

  // ─── Derived values ───
  const isDark = theme.palette.mode === 'dark';
  const cardBg = isDark ? 'rgba(30, 41, 59, 0.65)' : 'rgba(255, 255, 255, 0.75)';
  const cardBorder = isDark ? 'rgba(96, 165, 250, 0.08)' : 'rgba(0, 0, 0, 0.06)';

  return (
    <Box sx={{ pb: 12, minHeight: '100%' }}>
      <Container maxWidth="md" sx={{ px: { xs: 2, sm: 3 }, py: 3 }}>

        {/* ─── Header ─── */}
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2.5 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <SecurityRounded sx={{ fontSize: 22, color: 'primary.main' }} />
            <Typography variant="subtitle1" fontWeight={800} letterSpacing="-0.01em">
              Permissions & Sessions
            </Typography>
          </Stack>
          <Button
            size="small"
            startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <RefreshRounded sx={{ fontSize: 16 }} />}
            onClick={() => { fetchApprovals(); fetchSessions(); }}
            disabled={loading}
            variant="outlined"
            sx={{
              borderRadius: 2.5,
              fontWeight: 600,
              fontSize: '0.75rem',
              textTransform: 'none',
              px: 2,
              borderColor: cardBorder,
            }}
          >
            {loading ? 'Scanning...' : 'Scan'}
          </Button>
        </Stack>

        {/* ─── Error ─── */}
        {error && (
          <Paper elevation={0} sx={{
            mb: 2, p: 1.5, borderRadius: 2.5,
            bgcolor: 'rgba(220, 38, 38, 0.08)',
            border: '1px solid rgba(220, 38, 38, 0.2)',
          }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <GppBadRounded sx={{ fontSize: 18, color: '#dc2626' }} />
              <Typography variant="caption" fontWeight={600} color="error.main" sx={{ flex: 1 }}>{error}</Typography>
              <Button size="small" onClick={() => setError(null)} sx={{ minWidth: 'auto', fontSize: '0.65rem', fontWeight: 700 }}>
                Dismiss
              </Button>
            </Stack>
          </Paper>
        )}

        {/* ─── Compact Loading Scanner ─── */}
        {loading && (
          <Paper elevation={0} sx={{
            mb: 2.5, p: 2, borderRadius: 3,
            bgcolor: cardBg,
            backdropFilter: 'blur(16px)',
            border: '1px solid',
            borderColor: cardBorder,
          }}>
            <Stack direction="row" alignItems="center" spacing={2}>
              <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                <CircularProgress
                  variant="determinate"
                  value={scanProgress}
                  size={44}
                  thickness={4}
                  sx={{
                    color: 'primary.main',
                    '& .MuiCircularProgress-circle': {
                      strokeLinecap: 'round',
                    },
                  }}
                />
                <Box
                  sx={{
                    top: 0, left: 0, bottom: 0, right: 0,
                    position: 'absolute',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Typography variant="caption" fontWeight={800} color="primary.main" sx={{ fontSize: '0.6rem' }}>
                    {scanProgress}%
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5 }}>
                  Scanning Permissions
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {scanMessage || 'Analyzing blockchain data...'}
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={scanProgress}
                  sx={{
                    mt: 1,
                    height: 3,
                    borderRadius: 2,
                    bgcolor: isDark ? 'rgba(96, 165, 250, 0.08)' : 'rgba(37, 99, 235, 0.06)',
                    '& .MuiLinearProgress-bar': {
                      borderRadius: 2,
                      background: 'linear-gradient(90deg, #2563eb 0%, #3b82f6 100%)',
                    }
                  }}
                />
              </Box>
            </Stack>
          </Paper>
        )}

        {/* ─── Connected dApps ─── */}
        {sessions.length > 0 && (
          <Box sx={{ mb: 2.5 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
              <Typography variant="body2" fontWeight={700} color="text.secondary" letterSpacing="0.03em" sx={{ textTransform: 'uppercase', fontSize: '0.7rem' }}>
                Connected dApps ({sessions.length})
              </Typography>
              {sessions.length > 1 && (
                <Button
                  size="small"
                  color="error"
                  startIcon={disconnectingAll ? <CircularProgress size={12} /> : <LinkOffRounded sx={{ fontSize: 14 }} />}
                  onClick={handleDisconnectAll}
                  disabled={disconnectingAll}
                  sx={{ borderRadius: 2, fontWeight: 700, textTransform: 'none', fontSize: '0.7rem' }}
                >
                  Disconnect All
                </Button>
              )}
            </Stack>

            {sessions.map((s: WCSessionInfo) => {
              const peerMeta = s.peer?.metadata || {};
              const chains = Object.values(s.namespaces || {}).flatMap((ns: WCNamespace) => ns.chains || ns.accounts?.map((a: string) => a.split(':').slice(0, 2).join(':')) || []);
              const uniqueChains = [...new Set(chains)];
              const expiryDate = s.expiry ? new Date(s.expiry * 1000) : null;
              const isExpired = expiryDate ? expiryDate < new Date() : false;

              return (
                <Paper
                  key={s.topic}
                  elevation={0}
                  sx={{
                    p: 2,
                    mb: 1,
                    borderRadius: 3,
                    border: '1px solid',
                    borderColor: isExpired ? 'rgba(239, 68, 68, 0.3)' : cardBorder,
                    bgcolor: cardBg,
                    backdropFilter: 'blur(16px)',
                    transition: 'all 0.15s ease',
                    '&:hover': { borderColor: 'primary.main' },
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1.5}>
                    <Avatar
                      src={peerMeta.icons?.[0]}
                      sx={{
                        width: 36, height: 36,
                        bgcolor: isDark ? 'rgba(37, 99, 235, 0.15)' : 'rgba(37, 99, 235, 0.08)',
                        color: 'primary.main',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        border: '1px solid',
                        borderColor: cardBorder,
                      }}
                    >
                      {peerMeta.name?.[0]?.toUpperCase() || '?'}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={700} noWrap>
                        {peerMeta.name || 'Unknown dApp'}
                      </Typography>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <LanguageRounded sx={{ fontSize: 11, color: 'text.secondary' }} />
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: '0.65rem' }}>
                          {peerMeta.url || 'No URL'}
                        </Typography>
                      </Stack>
                      <Stack direction="row" gap={0.5} sx={{ mt: 0.5 }} flexWrap="wrap">
                        {uniqueChains.map((chain: string) => {
                          const label = CHAIN_LABELS[chain];
                          return (
                            <Chip
                              key={chain}
                              size="small"
                              label={label?.name || chain}
                              sx={{
                                fontSize: '0.6rem', height: 18, fontWeight: 700,
                                bgcolor: label ? `${label.color}12` : 'action.hover',
                                color: label?.color || 'text.secondary',
                                border: 'none',
                              }}
                            />
                          );
                        })}
                        {expiryDate && (
                          <Tooltip title={`Expires: ${expiryDate.toLocaleString()}`} arrow>
                            <Chip
                              size="small"
                              icon={<AccessTimeRounded sx={{ fontSize: 10 }} />}
                              label={isExpired ? 'Expired' : expiryDate.toLocaleDateString()}
                              sx={{
                                fontSize: '0.6rem', height: 18, fontWeight: 600,
                                color: isExpired ? '#ef4444' : 'text.secondary',
                                '& .MuiChip-icon': { color: 'inherit' },
                                border: 'none',
                              }}
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
                      sx={{
                        borderRadius: 2, fontWeight: 700, textTransform: 'none',
                        fontSize: '0.7rem', minWidth: 88, py: 0.5,
                        borderColor: 'rgba(239, 68, 68, 0.3)',
                        '&:hover': { borderColor: 'error.main', bgcolor: 'rgba(239, 68, 68, 0.06)' },
                      }}
                    >
                      Disconnect
                    </Button>
                  </Stack>
                </Paper>
              );
            })}
          </Box>
        )}

        {/* ─── Risk Overview (compact) ─── */}
        {!loading && approvals.length > 0 && (() => {
          const avgScore = Math.round(approvals.reduce((s, a) => s + a.riskScore, 0) / approvals.length);
          const overallLevel = avgScore >= 75 ? 'critical' : avgScore >= 50 ? 'high' : avgScore >= 30 ? 'medium' : 'low';
          const cfg = RISK_CONFIG[overallLevel];
          const OverallIcon = cfg.icon;
          const unlimitedCount = approvals.filter(a => a.isUnlimited).length;
          const highRiskCount = approvals.filter(a => a.riskLevel === 'critical' || a.riskLevel === 'high').length;

          return (
            <Paper elevation={0} sx={{
              p: 2, mb: 2.5, borderRadius: 3,
              bgcolor: cardBg,
              backdropFilter: 'blur(16px)',
              border: '1px solid',
              borderColor: `${cfg.color}20`,
            }}>
              <Stack direction="row" alignItems="center" spacing={2}>
                {/* Score circle */}
                <Box sx={{
                  width: 52, height: 52, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
                  bgcolor: `${cfg.color}10`,
                  border: '2px solid',
                  borderColor: `${cfg.color}30`,
                  flexShrink: 0,
                }}>
                  <Typography variant="subtitle2" fontWeight={900} sx={{ color: cfg.color, lineHeight: 1 }}>{avgScore}</Typography>
                  <Typography sx={{ fontSize: '0.5rem', color: cfg.color, fontWeight: 700, lineHeight: 1 }}>RISK</Typography>
                </Box>

                {/* Stats row */}
                <Stack direction="row" spacing={2} sx={{ flex: 1 }} divider={<Divider orientation="vertical" flexItem />}>
                  <Box sx={{ textAlign: 'center', flex: 1 }}>
                    <Typography variant="subtitle2" fontWeight={800}>{approvals.length}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>Approvals</Typography>
                  </Box>
                  {unlimitedCount > 0 && (
                    <Box sx={{ textAlign: 'center', flex: 1 }}>
                      <Typography variant="subtitle2" fontWeight={800} color="error.main">{unlimitedCount}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>Unlimited</Typography>
                    </Box>
                  )}
                  {highRiskCount > 0 && (
                    <Box sx={{ textAlign: 'center', flex: 1 }}>
                      <Typography variant="subtitle2" fontWeight={800} sx={{ color: '#ef4444' }}>{highRiskCount}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>High Risk</Typography>
                    </Box>
                  )}
                </Stack>
              </Stack>
            </Paper>
          );
        })()}

        {/* ─── Approval Cards ─── */}
        {approvals.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" fontWeight={700} color="text.secondary" letterSpacing="0.03em" sx={{ textTransform: 'uppercase', fontSize: '0.7rem', mb: 1.5 }}>
              Token Permissions ({approvals.length})
            </Typography>

            {[...approvals].sort((a, b) => b.riskScore - a.riskScore).map((a, i) => {
              const riskCfg = RISK_CONFIG[a.riskLevel];
              const RiskIcon = riskCfg.icon;

              return (
                <Paper key={i} elevation={0} sx={{
                  mb: 1.5,
                  borderRadius: 3,
                  bgcolor: cardBg,
                  backdropFilter: 'blur(16px)',
                  border: '1px solid',
                  borderColor: `${riskCfg.color}18`,
                  overflow: 'hidden',
                  transition: 'all 0.15s ease',
                  '&:hover': { borderColor: `${riskCfg.color}40` },
                }}>
                  {/* Subtle risk bar */}
                  <LinearProgress
                    variant="determinate"
                    value={a.riskScore}
                    sx={{
                      height: 2,
                      bgcolor: 'transparent',
                      '& .MuiLinearProgress-bar': { bgcolor: riskCfg.color, borderRadius: 0 },
                    }}
                  />

                  <Box sx={{ p: 2 }}>
                    {/* Top row: token + risk badge */}
                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Typography variant="body2" fontWeight={800}>{a.tokenSymbol}</Typography>
                        <Typography variant="caption" color="text.secondary">{a.tokenName}</Typography>
                        <Chip
                          icon={<RiskIcon sx={{ fontSize: 12 }} />}
                          label={riskCfg.label}
                          size="small"
                          sx={{
                            height: 20, fontSize: '0.6rem', fontWeight: 800,
                            bgcolor: `${riskCfg.color}10`,
                            color: riskCfg.color,
                            border: 'none',
                            '& .MuiChip-icon': { color: riskCfg.color },
                          }}
                        />
                        {a.isUnlimited && (
                          <Chip
                            label="UNLIMITED"
                            size="small"
                            sx={{
                              height: 18, fontSize: '0.55rem', fontWeight: 800,
                              bgcolor: 'rgba(220, 38, 38, 0.10)',
                              color: '#dc2626',
                              border: 'none',
                            }}
                          />
                        )}
                      </Stack>
                    </Stack>

                    {/* Details grid */}
                    <Box sx={{
                      display: 'grid',
                      gridTemplateColumns: 'auto 1fr',
                      gap: '2px 12px',
                      mb: 1.5,
                    }}>
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>Spender</Typography>
                      <Typography variant="caption" fontWeight={700}>{a.spenderName}</Typography>

                      <Typography variant="caption" color="text.secondary" fontWeight={600}>Address</Typography>
                      <Typography variant="caption" sx={{
                        fontFamily: 'monospace', fontSize: '0.65rem',
                        color: 'primary.main',
                        overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {a.spenderAddress.slice(0, 6)}...{a.spenderAddress.slice(-4)}
                      </Typography>

                      <Typography variant="caption" color="text.secondary" fontWeight={600}>Allowance</Typography>
                      <Typography variant="caption" fontWeight={700} color={a.isUnlimited ? 'error.main' : 'text.primary'}>
                        {a.isUnlimited ? '∞ Unlimited' : a.allowance}
                      </Typography>
                    </Box>

                    {/* Risk reasons as inline tags */}
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                      {a.riskReasons.map((reason, ri) => (
                        <Typography
                          key={ri}
                          variant="caption"
                          sx={{
                            fontSize: '0.6rem', fontWeight: 600,
                            color: 'text.secondary',
                            bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                            px: 1, py: 0.25, borderRadius: 1,
                          }}
                        >
                          {reason}
                        </Typography>
                      ))}
                    </Stack>

                    {/* Revoke button */}
                    <Button
                      fullWidth
                      size="small"
                      variant="contained"
                      color={a.riskLevel === 'critical' || a.riskLevel === 'high' ? "error" : "primary"}
                      onClick={() => handleRevoke(a)}
                      startIcon={<LinkOffRounded sx={{ fontSize: 16 }} />}
                      sx={{
                        borderRadius: 2.5,
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        py: 0.75,
                        textTransform: 'none',
                        boxShadow: a.riskLevel === 'critical'
                          ? '0 2px 10px rgba(220, 38, 38, 0.25)'
                          : '0 2px 10px rgba(37, 99, 235, 0.2)',
                      }}
                    >
                      Revoke Permission
                    </Button>
                  </Box>
                </Paper>
              );
            })}
          </Box>
        )}

        {/* ─── Secure State ─── */}
        {!loading && approvals.length === 0 && sessions.length === 0 && (
          <Paper elevation={0} sx={{
            p: 4,
            textAlign: 'center',
            bgcolor: cardBg,
            backdropFilter: 'blur(16px)',
            border: '1px solid',
            borderColor: isDark ? 'rgba(34, 197, 94, 0.12)' : 'rgba(34, 197, 94, 0.15)',
            borderRadius: 3,
          }}>
            <Box sx={{
              width: 56, height: 56, borderRadius: '50%', mx: 'auto', mb: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: isDark ? 'rgba(34, 197, 94, 0.1)' : 'rgba(34, 197, 94, 0.08)',
              border: '2px solid',
              borderColor: isDark ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.15)',
            }}>
              <CheckCircleOutlineRounded sx={{ fontSize: 28, color: '#22c55e' }} />
            </Box>
            <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 0.5 }}>
              Wallet Secure
            </Typography>
            <Typography variant="caption" color="text.secondary" fontWeight={500}>
              No active token approvals or dApp connections found.
            </Typography>
          </Paper>
        )}

        <Snackbar
          open={!!success}
          autoHideDuration={4000}
          onClose={() => setSuccess(null)}
          message={success}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          sx={{
            mb: 8,
            '& .MuiSnackbarContent-root': {
              borderRadius: 3,
              fontWeight: 600,
              fontSize: '0.8rem',
              bgcolor: isDark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(15, 23, 42, 0.9)',
              backdropFilter: 'blur(12px)',
            }
          }}
        />
      </Container>
    </Box>
  );
};

export default RevokeAlchemyPage;

