import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Stack,
  Divider,
  IconButton,
  Tooltip,
  Chip,
  CircularProgress,
  Alert,
  Collapse,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Step,
  StepLabel,
  Stepper,
  useTheme,
  alpha,
  LinearProgress,
} from '@mui/material';
import {
  ContentCopy,
  Refresh,
  CheckCircle,
  OpenInNew,
  Send,
  CallReceived,
  KeyboardArrowDown,
  KeyboardArrowUp,
  WaterDrop,
  LockOutlined,
  Fingerprint,
  FlashOn,
  ExpandMore,
} from '@mui/icons-material';
import { useToast } from '../components/ToastProvider.js';
import { useAccount } from '../hooks/useAccount.js';
import { useWallet } from '../hooks/useWallet.js';
import { IkaService, type DKGProgress, type DKGStep, type FundingStatus, MIN_SUI_FOR_GAS, MIN_IKA_FOR_DKG } from '../backend/IkaService.js';

const SUI_FAUCET_URL = 'https://faucet.testnet.sui.io/v2/gas';

function toFriendlyError(e: any): { title: string; hint: string } {
  const msg = String(e?.message ?? e ?? '');

  if (msg.includes('ERR_NO_IKA_TOKEN'))
    return { title: 'IKA token bulunamadı', hint: 'Hesabınıza IKA token yükleyin. "Nasıl alınır?" rehberinden yardım alabilirsiniz.' };
  if (msg.includes('ERR_INSUFFICIENT_SUI'))
    return { title: 'SUI bakiyeniz yetersiz', hint: '"Otomatik Al" butonuyla ücretsiz testnet SUI alabilirsiniz.' };
  if (msg.includes('ERR_CAP_NOT_FOUND'))
    return { title: 'Cüzdan doğrulaması başarısız', hint: 'dWallet oluşturuldu ancak onaylanamadı. Lütfen tekrar deneyin.' };
  if (msg.includes('ERR_SESSIONS_MANAGER_LOCKED')) {
    const isTimeout = msg.includes('ERR_ATTEMPT_TIMEOUT') || msg.includes('ERR_NETWORK_FETCH_TIMEOUT');
    return {
      title: isTimeout ? 'IKA ağı yanıt vermiyor' : 'IKA ağı şu an yoğun',
      hint: isTimeout
        ? 'IKA testnet gRPC bağlantısı zaman aşımına uğradı. Birkaç dakika bekleyip tekrar deneyin.'
        : 'IKA sessions manager kilitli (epoch geçişi). Birkaç dakika bekleyip tekrar deneyin.',
    };
  }
  if (msg.includes('ERR_DWALLET_NOT_ACTIVE'))
    return { title: 'Aktivasyon tamamlanamadı', hint: 'dWallet aktif hale gelmedi. Bir süre bekleyip tekrar deneyin.' };
  if (msg.includes('timeout') || msg.includes('Timeout') || msg.includes('timed out'))
    return { title: 'İşlem zaman aşımına uğradı', hint: 'IKA ağı geç yanıt verdi. Birkaç dakika sonra tekrar deneyin.' };
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('ECONNREFUSED'))
    return { title: 'Bağlantı sorunu', hint: 'İnternet bağlantınızı kontrol edin ve tekrar deneyin.' };
  if (msg.includes('Faucet') || msg.includes('faucet') || msg.includes('429'))
    return { title: 'Faucet şu an kullanılamıyor', hint: 'Çok sık istek gönderildi. Birkaç dakika bekleyin.' };

  return { title: 'Bir hata oluştu', hint: 'Lütfen tekrar deneyin. Sorun devam ederse sayfayı yenileyin.' };
}
const IKA_EXCHANGE_URL = 'https://faucet.ika.xyz';

async function requestSuiFromFaucet(suiAddress: string): Promise<void> {
  const res = await fetch(SUI_FAUCET_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ FixedAmountRequest: { recipient: suiAddress } }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Faucet hatası (${res.status}): ${text.slice(0, 120)}`);
  }
}

type Phase = 'setup' | 'creating' | 'active';

const DKG_STEPS: { key: DKGStep; label: string }[] = [
  { key: 'funding-check', label: 'Fonlama kontrolü' },
  { key: 'preparing-dkg', label: 'Kriptografik hazırlık' },
  { key: 'submitting', label: 'IKA ağına gönderiliyor' },
  { key: 'waiting-activation', label: 'Aktivasyon bekleniyor' },
  { key: 'complete', label: 'Tamamlandı' },
];

const STEP_ORDER: DKGStep[] = ['funding-check', 'preparing-dkg', 'submitting', 'waiting-activation', 'complete'];

export default function IkaDashboard() {
  const { showToast } = useToast();
  const { account, activeIndex } = useAccount();
  const { accountManager } = useWallet();
  const theme = useTheme();

  const [phase, setPhase] = useState<Phase>('setup');
  const [funding, setFunding] = useState<FundingStatus | null>(null);
  const [fundingLoading, setFundingLoading] = useState(false);
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [solBalanceLoading, setSolBalanceLoading] = useState(false);
  const [currentProgress, setCurrentProgress] = useState<DKGProgress | null>(null);
  const [error, setError] = useState<{ title: string; hint: string; raw?: string } | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const suiAddress = account?.sui_address;
  const mnemonic = account?.mnemonic?.phrase;
  const dwalletAddress = account?.ika_solana_dwallet;
  const dwalletId = account?.ika_solana_mpc_id;
  const dwalletCapId = account?.ika_solana_dwallet_cap_id;
  const lastTxDigest = account?.ika_last_tx_digest;

  useEffect(() => {
    if (phase === 'creating') return;
    setPhase(dwalletAddress ? 'active' : 'setup');
  }, [dwalletAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadFunding = useCallback(async () => {
    if (!suiAddress) return;
    setFundingLoading(true);
    setError(null);
    try {
      const status = await IkaService.getInstance().getFundingStatus(suiAddress);
      setFunding(status);
    } catch (e: any) {
      setError({ ...toFriendlyError(e), raw: e?.message || String(e) });
    } finally {
      setFundingLoading(false);
    }
  }, [suiAddress]);

  const loadSolanaBalance = useCallback(async () => {
    if (!dwalletAddress) return;
    setSolBalanceLoading(true);
    try {
      const bal = await IkaService.getInstance().getSolanaBalance(dwalletAddress);
      setSolBalance(bal);
    } catch {
      setSolBalance(null);
    } finally {
      setSolBalanceLoading(false);
    }
  }, [dwalletAddress]);

  useEffect(() => {
    if (phase === 'setup' && suiAddress) loadFunding();
  }, [phase, suiAddress, loadFunding]);

  useEffect(() => {
    if (phase === 'active' && dwalletAddress) loadSolanaBalance();
  }, [phase, dwalletAddress, loadSolanaBalance]);

  const handleCreate = async () => {
    if (!account) return;
    const signer = account.GetSuiKeypair();
    if (!signer) {
      setError({ title: 'İmzalayıcı bulunamadı', hint: 'Bu hesap için Sui imzalayıcı bulunamadı. Mnemonic ile oluşturulmuş hesap gereklidir.' });
      setPhase('setup');
      return;
    }
    const seed = account.GetIkaRootSeed('solana');
    setPhase('creating');
    setCurrentProgress(null);
    setError(null);
    try {
      const ika = IkaService.getInstance();
      const result = await ika.createDWalletWithFunding({
        signer,
        seed,
        chain: 'solana',
        waitForActive: true,
        timeoutMs: 180_000,
        onProgress: (p) => setCurrentProgress(p),
      });
      await accountManager.setIkaSolanaDWallet(activeIndex, {
        dwalletId: result.address,
        mpcId: result.dWalletId,
        capId: result.dWalletCapId,
        userShareHex: Buffer.from(result.userShareEncryptionKeysBytes).toString('hex'),
        userSecretShare: Buffer.from(result.userSecretKeyShare).toString('hex'),
        userPublicOutput: Buffer.from(result.userPublicOutput).toString('hex'),
      });
      if (result.transactionDigest) {
        const acct = accountManager.accounts[activeIndex];
        if (acct) acct.ika_last_tx_digest = result.transactionDigest;
        await accountManager.SaveAccounts();
      }
      setPhase('active');
      showToast('Arfhe dWallet başarıyla oluşturuldu!', 'success');
    } catch (e: any) {
      console.error('[IkaDashboard] dWallet creation failed:', e);
      setError({ ...toFriendlyError(e), raw: e?.message || String(e) });
      setPhase('setup');
    }
  };

  const handleCopy = (text: string | undefined, label = 'Adres') => {
    if (!text) return showToast('Kopyalanacak veri yok', 'warning');
    navigator.clipboard.writeText(text)
      .then(() => showToast(`${label} kopyalandı`, 'success'))
      .catch(() => showToast('Kopyalama başarısız', 'error'));
  };

  const handleReset = async () => {
    try {
      const acct = accountManager.accounts[activeIndex];
      if (acct) {
        acct.ika_solana_dwallet = undefined;
        acct.ika_solana_mpc_id = undefined;
        acct.ika_solana_dwallet_cap_id = undefined;
        acct.ika_user_share_keys = undefined;
        acct.ika_user_secret_share = undefined;
        acct.ika_user_public_output = undefined;
        acct.ika_last_tx_digest = undefined;
        await accountManager.SaveAccounts();
      }
      setPhase('setup');
      setFunding(null);
      setSolBalance(null);
      showToast('dWallet verileri temizlendi', 'info');
    } catch {
      showToast('Temizleme başarısız', 'error');
    }
  };

  if (!account) return null;

  const isDark = theme.palette.mode === 'dark';

  return (
    <Box sx={{ pb: 3 }}>
      {/* Hero Banner */}
      <Box sx={{
        px: 2,
        pt: 2,
        pb: 0,
      }}>
        <Paper elevation={0} sx={{
          borderRadius: 4,
          overflow: 'hidden',
          background: isDark
            ? 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)'
            : 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 50%, #bfdbfe 100%)',
          border: `1px solid ${isDark ? 'rgba(96,165,250,0.15)' : 'rgba(37,99,235,0.12)'}`,
          position: 'relative',
        }}>
          {/* Top glow */}
          <Box sx={{
            position: 'absolute', top: 0, left: '20%', right: '20%', height: 1,
            background: isDark
              ? 'linear-gradient(90deg, transparent, rgba(96,165,250,0.4), transparent)'
              : 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
          }} />

          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ p: 2, pb: 1.5 }}>
            <Box sx={{
              width: 40, height: 40, borderRadius: 2.5,
              background: isDark
                ? 'linear-gradient(135deg, #1d4ed8, #3b82f6)'
                : 'linear-gradient(135deg, #2563eb, #60a5fa)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: isDark ? '0 4px 16px rgba(59,130,246,0.35)' : '0 4px 16px rgba(37,99,235,0.25)',
              flexShrink: 0,
            }}>
              <LockOutlined sx={{ color: '#fff', fontSize: 20 }} />
            </Box>
            <Box flex={1}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="subtitle1" fontWeight={800} sx={{
                  color: isDark ? '#eff6ff' : '#1e3a8a',
                  letterSpacing: '-0.02em',
                }}>
                  Arfhe dWallet
                </Typography>
                <Chip
                  label="IKA Testnet"
                  size="small"
                  sx={{
                    height: 18, fontSize: '0.6rem', fontWeight: 700,
                    bgcolor: isDark ? 'rgba(59,130,246,0.2)' : 'rgba(37,99,235,0.1)',
                    color: isDark ? '#60a5fa' : '#1d4ed8',
                    border: `1px solid ${isDark ? 'rgba(96,165,250,0.25)' : 'rgba(37,99,235,0.2)'}`,
                  }}
                />
                {phase === 'active' && (
                  <Chip
                    label="Aktif"
                    size="small"
                    sx={{
                      height: 18, fontSize: '0.6rem', fontWeight: 700,
                      bgcolor: 'rgba(16,185,129,0.15)',
                      color: '#10b981',
                      border: '1px solid rgba(16,185,129,0.25)',
                    }}
                  />
                )}
              </Stack>
              <Typography variant="caption" sx={{
                color: isDark ? 'rgba(148,163,184,0.8)' : 'rgba(71,85,105,0.7)',
                fontSize: '0.7rem',
              }}>
                MPC tabanlı Solana cüzdanı · Ed25519
              </Typography>
            </Box>
          </Stack>

          {/* Feature pills */}
          <Stack direction="row" spacing={1} sx={{ px: 2, pb: 1.5 }}>
            {[
              { icon: <Fingerprint sx={{ fontSize: 12 }} />, label: 'Sıfır güven' },
              { icon: <FlashOn sx={{ fontSize: 12 }} />, label: 'MPC imzalama' },
              { icon: <LockOutlined sx={{ fontSize: 12 }} />, label: 'Özel anahtar yok' },
            ].map((f) => (
              <Stack key={f.label} direction="row" alignItems="center" spacing={0.4} sx={{
                px: 1, py: 0.3, borderRadius: 10,
                bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(37,99,235,0.06)',
              }}>
                <Box sx={{ color: isDark ? '#60a5fa' : '#2563eb', display: 'flex' }}>{f.icon}</Box>
                <Typography variant="caption" sx={{ fontSize: '0.62rem', fontWeight: 600, color: isDark ? '#94a3b8' : '#475569' }}>
                  {f.label}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Paper>
      </Box>

      {/* Content */}
      <Box sx={{ px: 2, pt: 2 }}>
        {error && phase === 'setup' && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }} onClose={() => setError(null)}>
            <Typography variant="body2" fontWeight={700}>{error.title}</Typography>
            <Typography variant="caption" display="block" sx={{ mt: 0.5, opacity: 0.85 }}>{error.hint}</Typography>
          </Alert>
        )}

        {phase === 'setup' && (
          <SetupPhase
            suiAddress={suiAddress}
            mnemonic={mnemonic}
            funding={funding}
            fundingLoading={fundingLoading}
            onRefreshFunding={loadFunding}
            onCopy={handleCopy}
            onCreate={handleCreate}
          />
        )}

        {phase === 'creating' && (
          <CreatingPhase
            currentProgress={currentProgress}
            error={error}
            onRetry={() => { setError(null); setPhase('setup'); }}
          />
        )}

        {phase === 'active' && dwalletAddress && (
          <ActivePhase
            dwalletAddress={dwalletAddress}
            dwalletId={dwalletId}
            dwalletCapId={dwalletCapId}
            lastTxDigest={lastTxDigest}
            solBalance={solBalance}
            solBalanceLoading={solBalanceLoading}
            showDetails={showDetails}
            onToggleDetails={() => setShowDetails(v => !v)}
            onCopy={handleCopy}
            onRefreshBalance={loadSolanaBalance}
            onReset={handleReset}
          />
        )}
      </Box>
    </Box>
  );
}

// ─── Setup Phase ──────────────────────────────────────────────────────────────

function SetupPhase({
  suiAddress,
  mnemonic,
  funding,
  fundingLoading,
  onRefreshFunding,
  onCopy,
  onCreate,
}: {
  suiAddress?: string;
  mnemonic?: string;
  funding: FundingStatus | null;
  fundingLoading: boolean;
  onRefreshFunding: () => void;
  onCopy: (text?: string, label?: string) => void;
  onCreate: () => void;
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { showToast } = useToast();
  const [suiFaucetLoading, setSuiFaucetLoading] = useState(false);
  const [ikaGuideOpen, setIkaGuideOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const suiMist = funding?.suiBalanceMist ?? 0n;
  const ikaMist = funding?.ikaBalanceMist ?? 0n;
  const suiSui = Number(suiMist) / 1e9;
  const ikaIka = Number(ikaMist) / 1e9;
  const hasSui = suiMist >= MIN_SUI_FOR_GAS;
  const hasIka = ikaMist >= MIN_IKA_FOR_DKG;
  const canCreate = hasSui && hasIka;

  const handleSuiFaucet = async () => {
    if (!suiAddress) return;
    setSuiFaucetLoading(true);
    try {
      await requestSuiFromFaucet(suiAddress);
      showToast('SUI testnet tokeni talep edildi!', 'success');
      timerRef.current = setTimeout(onRefreshFunding, 4000);
    } catch (e: any) {
      const { title, hint } = toFriendlyError(e);
      showToast(`${title} — ${hint}`, 'error');
    } finally {
      setSuiFaucetLoading(false);
    }
  };

  return (
    <Stack spacing={2}>
      {/* Sui Address Card */}
      <Paper elevation={0} sx={{
        p: 2, borderRadius: 3,
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
        bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.015)',
      }}>
        <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ fontSize: '0.65rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Sui Testnet Adresiniz
        </Typography>
        <Stack direction="row" alignItems="center" spacing={1} mt={0.75}>
          <Typography
            variant="body2"
            fontFamily="monospace"
            sx={{ flex: 1, wordBreak: 'break-all', fontSize: '0.72rem', color: 'text.primary', lineHeight: 1.6 }}
          >
            {suiAddress ?? '—'}
          </Typography>
          <Tooltip title="Kopyala">
            <IconButton size="small" onClick={() => onCopy(suiAddress, 'Sui adresi')} sx={{ flexShrink: 0 }}>
              <ContentCopy sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Paper>

      {/* Funding Status Card */}
      <Paper elevation={0} sx={{
        borderRadius: 3,
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
        overflow: 'hidden',
      }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1.5 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ fontSize: '0.65rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Fonlama Durumu
          </Typography>
          <IconButton size="small" onClick={onRefreshFunding} disabled={fundingLoading}>
            {fundingLoading
              ? <CircularProgress size={13} />
              : <Refresh sx={{ fontSize: 16 }} />
            }
          </IconButton>
        </Stack>

        <Divider />

        {/* SUI row */}
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: 2, py: 1.5 }}>
          <Box sx={{
            width: 32, height: 32, borderRadius: 2, flexShrink: 0,
            bgcolor: hasSui ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 800, color: hasSui ? '#10b981' : '#f59e0b' }}>
              S
            </Typography>
          </Box>
          <Box flex={1}>
            <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.3 }}>SUI</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
              {funding ? `${suiSui.toFixed(4)} SUI` : '—'} · gas için
            </Typography>
          </Box>
          {fundingLoading
            ? <CircularProgress size={14} />
            : hasSui
              ? <CheckCircle sx={{ color: '#10b981', fontSize: 18 }} />
              : (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={suiFaucetLoading ? <CircularProgress size={11} /> : <WaterDrop sx={{ fontSize: 13 }} />}
                  onClick={handleSuiFaucet}
                  disabled={suiFaucetLoading || !suiAddress}
                  sx={{ fontSize: '0.68rem', whiteSpace: 'nowrap', borderRadius: 2, textTransform: 'none', py: 0.4, px: 1.2 }}
                >
                  {suiFaucetLoading ? 'Alınıyor...' : 'Otomatik Al'}
                </Button>
              )
          }
        </Stack>

        <Divider sx={{ mx: 2 }} />

        {/* IKA row */}
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: 2, py: 1.5 }}>
          <Box sx={{
            width: 32, height: 32, borderRadius: 2, flexShrink: 0,
            bgcolor: hasIka ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 800, color: hasIka ? '#10b981' : '#f59e0b' }}>
              I
            </Typography>
          </Box>
          <Box flex={1}>
            <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.3 }}>IKA</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
              {funding ? `${ikaIka.toFixed(4)} IKA` : '—'} · DKG ücreti
            </Typography>
          </Box>
          {fundingLoading
            ? <CircularProgress size={14} />
            : hasIka
              ? <CheckCircle sx={{ color: '#10b981', fontSize: 18 }} />
              : (
                <Button
                  size="small"
                  variant="outlined"
                  endIcon={<OpenInNew sx={{ fontSize: 11 }} />}
                  onClick={() => setIkaGuideOpen(true)}
                  sx={{ fontSize: '0.68rem', whiteSpace: 'nowrap', borderRadius: 2, textTransform: 'none', py: 0.4, px: 1.2 }}
                >
                  Nasıl alınır?
                </Button>
              )
          }
        </Stack>
      </Paper>

      {/* Create Button */}
      <Button
        variant="contained"
        size="large"
        fullWidth
        onClick={onCreate}
        disabled={!canCreate || fundingLoading}
        sx={{
          py: 1.5, fontWeight: 800, borderRadius: 3,
          fontSize: '0.95rem', textTransform: 'none',
          background: canCreate
            ? 'linear-gradient(135deg, #2563eb, #3b82f6)'
            : undefined,
          boxShadow: canCreate ? '0 4px 20px rgba(37,99,235,0.35)' : 'none',
          '&:hover': canCreate ? {
            background: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
            boxShadow: '0 6px 24px rgba(37,99,235,0.45)',
            transform: 'translateY(-1px)',
          } : {},
          transition: 'all 0.2s ease',
        }}
      >
        {canCreate ? 'dWallet Oluştur' : 'Önce hesabı fonlayın'}
      </Button>

      {!canCreate && funding !== null && (
        <Typography variant="caption" color="text.secondary" textAlign="center" sx={{ mt: -1 }}>
          SUI faucet'ten ücretsiz alabilirsiniz · IKA için rehbere bakın
        </Typography>
      )}

      <IkaTokenGuideDialog
        open={ikaGuideOpen}
        onClose={() => setIkaGuideOpen(false)}
        mnemonic={mnemonic}
        onCopy={onCopy}
        hasSui={hasSui}
        onGetSui={handleSuiFaucet}
        suiFaucetLoading={suiFaucetLoading}
      />
    </Stack>
  );
}

// ─── IKA Token Guide Dialog ────────────────────────────────────────────────────

function IkaTokenGuideDialog({
  open, onClose, mnemonic, onCopy, hasSui, onGetSui, suiFaucetLoading,
}: {
  open: boolean; onClose: () => void; mnemonic?: string;
  onCopy: (text?: string, label?: string) => void;
  hasSui: boolean; onGetSui: () => void; suiFaucetLoading: boolean;
}) {
  const [showMnemonic, setShowMnemonic] = useState(false);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography fontWeight={700}>IKA Token Alma Rehberi</Typography>
          <Chip label="Discord gerekmez" size="small" color="success" />
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <Stepper orientation="vertical" sx={{ mb: 0 }}>
          <Step active expanded completed={hasSui}>
            <StepLabel>
              <Typography variant="body2" fontWeight={600}>
                Testnet SUI al {hasSui && '✓'}
              </Typography>
            </StepLabel>
            <Box sx={{ ml: 3.5, mb: 2 }}>
              {hasSui ? (
                <Alert severity="success" sx={{ py: 0.5 }}>
                  <Typography variant="caption">SUI bakiyeniz yeterli.</Typography>
                </Alert>
              ) : (
                <Stack spacing={1}>
                  <Typography variant="caption" color="text.secondary">
                    Aşağıdaki butonla otomatik olarak Sui testnet faucet'inden SUI alabilirsiniz.
                  </Typography>
                  <Button
                    size="small" variant="outlined"
                    startIcon={suiFaucetLoading ? <CircularProgress size={12} /> : <WaterDrop />}
                    onClick={onGetSui} disabled={suiFaucetLoading}
                  >
                    {suiFaucetLoading ? 'Talep ediliyor...' : 'Otomatik SUI Al'}
                  </Button>
                </Stack>
              )}
            </Box>
          </Step>

          <Step active expanded>
            <StepLabel>
              <Typography variant="body2" fontWeight={600}>Sui Wallet eklentisine import et</Typography>
            </StepLabel>
            <Box sx={{ ml: 3.5, mb: 2 }}>
              <Stack spacing={1}>
                <Typography variant="caption" color="text.secondary">
                  Chrome Web Store'dan <strong>Sui Wallet</strong> eklentisini kurun. Ardından mnemonic ile import edin.
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small" variant="outlined"
                    endIcon={<OpenInNew sx={{ fontSize: 12 }} />}
                    onClick={() => window.open('https://chrome.google.com/webstore/detail/sui-wallet/opcgpfmipidbgpenhmajoajpbobppdil', '_blank')}
                    sx={{ fontSize: '0.7rem' }}
                  >
                    Sui Wallet Kur
                  </Button>
                  <Button
                    size="small"
                    variant={showMnemonic ? 'contained' : 'outlined'}
                    onClick={() => setShowMnemonic(v => !v)}
                    sx={{ fontSize: '0.7rem' }}
                  >
                    {showMnemonic ? 'Gizle' : 'Mnemonic Göster'}
                  </Button>
                </Stack>
                <Collapse in={showMnemonic}>
                  <Alert severity="warning" sx={{ mt: 0.5, mb: 0.5 }}>
                    <Typography variant="caption" fontWeight={600}>Bu kelimeleri kimseyle paylaşmayın!</Typography>
                  </Alert>
                  <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                    <Typography variant="caption" fontFamily="monospace" sx={{ wordBreak: 'break-word', display: 'block' }}>
                      {mnemonic ?? 'Mnemonic bulunamadı'}
                    </Typography>
                    {mnemonic && (
                      <Button size="small" startIcon={<ContentCopy sx={{ fontSize: 12 }} />}
                        onClick={() => onCopy(mnemonic, 'Mnemonic')} sx={{ mt: 0.5, fontSize: '0.68rem' }}>
                        Kopyala
                      </Button>
                    )}
                  </Paper>
                  <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                    Derivasyon yolu: <code>m/44'/784'/0'/0'/0'</code>
                  </Typography>
                </Collapse>
              </Stack>
            </Box>
          </Step>

          <Step active expanded>
            <StepLabel>
              <Typography variant="body2" fontWeight={600}>faucet.ika.xyz'de SUI → IKA swap et</Typography>
            </StepLabel>
            <Box sx={{ ml: 3.5, mb: 1 }}>
              <Stack spacing={1}>
                <Typography variant="caption" color="text.secondary">
                  Sui Wallet bağlantısıyla testnet SUI'nizi IKA'ya dönüştürün.
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Paper variant="outlined" sx={{ p: 1, flex: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                    <Typography variant="caption" fontFamily="monospace">{IKA_EXCHANGE_URL}</Typography>
                  </Paper>
                  <Button size="small" variant="contained"
                    endIcon={<OpenInNew sx={{ fontSize: 12 }} />}
                    onClick={() => window.open(IKA_EXCHANGE_URL, '_blank')}
                    sx={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}
                  >
                    Aç
                  </Button>
                </Stack>
              </Stack>
            </Box>
          </Step>
        </Stepper>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Kapat</Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Creating Phase ───────────────────────────────────────────────────────────

function CreatingPhase({
  currentProgress, error, onRetry,
}: {
  currentProgress: DKGProgress | null;
  error: { title: string; hint: string; raw?: string } | null;
  onRetry: () => void;
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [showRaw, setShowRaw] = useState(false);
  const currentStep = currentProgress?.step ?? 'funding-check';
  const currentIndex = STEP_ORDER.indexOf(currentStep);
  const progress = (currentIndex / (STEP_ORDER.length - 1)) * 100;

  if (error) {
    return (
      <Stack spacing={2}>
        <Paper elevation={0} sx={{
          p: 2.5, borderRadius: 3,
          border: '1px solid rgba(239,68,68,0.2)',
          bgcolor: isDark ? 'rgba(239,68,68,0.06)' : 'rgba(239,68,68,0.04)',
        }}>
          <Stack direction="row" alignItems="center" spacing={1} mb={1}>
            <Box sx={{
              width: 32, height: 32, borderRadius: 2, flexShrink: 0,
              bgcolor: 'rgba(239,68,68,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Typography sx={{ fontSize: '1rem' }}>!</Typography>
            </Box>
            <Typography variant="subtitle2" fontWeight={700} color="error.main">
              {error.title}
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6, mb: 1.5 }}>
            {error.hint}
          </Typography>
          {error.raw && (
            <Box>
              <Button
                size="small"
                variant="text"
                onClick={() => setShowRaw(v => !v)}
                sx={{ fontSize: '0.68rem', color: 'text.disabled', textTransform: 'none', p: 0, minWidth: 0 }}
              >
                {showRaw ? 'Teknik detayı gizle' : 'Teknik detay'}
              </Button>
              <Collapse in={showRaw}>
                <Paper variant="outlined" sx={{ p: 1, mt: 0.75, bgcolor: 'action.hover', borderRadius: 1 }}>
                  <Typography variant="caption" fontFamily="monospace" sx={{ wordBreak: 'break-all', display: 'block', fontSize: '0.65rem', color: 'text.disabled', lineHeight: 1.5 }}>
                    {error.raw}
                  </Typography>
                </Paper>
              </Collapse>
            </Box>
          )}
        </Paper>
        <Button variant="contained" onClick={onRetry} fullWidth sx={{ borderRadius: 3, textTransform: 'none', fontWeight: 700 }}>
          Geri Dön ve Tekrar Dene
        </Button>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      {/* Progress card */}
      <Paper elevation={0} sx={{
        p: 2.5, borderRadius: 3,
        border: `1px solid ${isDark ? 'rgba(96,165,250,0.15)' : 'rgba(37,99,235,0.1)'}`,
        background: isDark
          ? 'linear-gradient(135deg, rgba(15,23,42,0.8), rgba(30,58,95,0.4))'
          : 'linear-gradient(135deg, rgba(239,246,255,0.9), rgba(219,234,254,0.6))',
      }}>
        <Stack direction="row" alignItems="center" spacing={1.5} mb={2}>
          <CircularProgress size={20} thickness={5} />
          <Box>
            <Typography variant="subtitle2" fontWeight={700} sx={{ color: isDark ? '#eff6ff' : '#1e3a8a' }}>
              dWallet oluşturuluyor...
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {currentProgress?.message ?? 'Başlatılıyor...'}
            </Typography>
          </Box>
        </Stack>

        {/* Steps */}
        <Stack spacing={1.2} mb={2}>
          {DKG_STEPS.map((step, idx) => {
            const done = idx < currentIndex;
            const active = idx === currentIndex;
            return (
              <Stack key={step.key} direction="row" alignItems="center" spacing={1.5}>
                <Box sx={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  bgcolor: done
                    ? 'rgba(16,185,129,0.15)'
                    : active
                      ? (isDark ? 'rgba(96,165,250,0.2)' : 'rgba(37,99,235,0.12)')
                      : 'transparent',
                  border: `1.5px solid ${done ? '#10b981' : active ? (isDark ? '#60a5fa' : '#2563eb') : (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)')}`,
                  transition: 'all 0.3s ease',
                }}>
                  {done
                    ? <CheckCircle sx={{ color: '#10b981', fontSize: 14 }} />
                    : active
                      ? <CircularProgress size={10} thickness={6} sx={{ color: isDark ? '#60a5fa' : '#2563eb' }} />
                      : <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)' }} />
                  }
                </Box>
                <Typography
                  variant="body2"
                  sx={{
                    color: done ? 'text.primary' : active ? (isDark ? '#93c5fd' : '#1d4ed8') : 'text.disabled',
                    fontWeight: active ? 700 : done ? 500 : 400,
                    fontSize: '0.82rem',
                    transition: 'all 0.3s ease',
                  }}
                >
                  {step.label}
                </Typography>
              </Stack>
            );
          })}
        </Stack>

        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{
            height: 4, borderRadius: 4,
            bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
            '& .MuiLinearProgress-bar': {
              borderRadius: 4,
              background: 'linear-gradient(90deg, #2563eb, #60a5fa)',
            },
          }}
        />
      </Paper>

      <Typography variant="caption" color="text.secondary" textAlign="center">
        Bu işlem 2–3 dakika sürebilir · Sayfayı kapatmayın
      </Typography>
    </Stack>
  );
}

// ─── Active Phase ─────────────────────────────────────────────────────────────

function ActivePhase({
  dwalletAddress, dwalletId, dwalletCapId, lastTxDigest,
  solBalance, solBalanceLoading, showDetails,
  onToggleDetails, onCopy, onRefreshBalance, onReset,
}: {
  dwalletAddress: string; dwalletId?: string; dwalletCapId?: string; lastTxDigest?: string;
  solBalance: number | null; solBalanceLoading: boolean; showDetails: boolean;
  onToggleDetails: () => void;
  onCopy: (text?: string, label?: string) => void;
  onRefreshBalance: () => void;
  onReset: () => void;
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Stack spacing={2}>
      {/* Main wallet card */}
      <Paper elevation={0} sx={{
        borderRadius: 4, overflow: 'hidden',
        border: `1px solid ${isDark ? 'rgba(96,165,250,0.2)' : 'rgba(37,99,235,0.15)'}`,
        background: isDark
          ? 'linear-gradient(145deg, #0f172a 0%, #1e3a5f 60%, #0f172a 100%)'
          : 'linear-gradient(145deg, #eff6ff 0%, #dbeafe 60%, #eff6ff 100%)',
        position: 'relative',
      }}>
        {/* Top accent */}
        <Box sx={{
          position: 'absolute', top: 0, left: '15%', right: '15%', height: 1,
          background: isDark
            ? 'linear-gradient(90deg, transparent, rgba(96,165,250,0.5), transparent)'
            : 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)',
        }} />

        <Box sx={{ p: 2.5 }}>
          {/* Status */}
          <Stack direction="row" alignItems="center" spacing={0.75} mb={2}>
            <Box sx={{
              width: 7, height: 7, borderRadius: '50%', bgcolor: '#10b981',
              boxShadow: '0 0 8px rgba(16,185,129,0.5)',
              animation: 'pulse 2s ease-in-out infinite',
              '@keyframes pulse': {
                '0%,100%': { opacity: 0.7 }, '50%': { opacity: 1, transform: 'scale(1.2)' }
              },
            }} />
            <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Aktif · IKA Testnet
            </Typography>
          </Stack>

          {/* Address */}
          <Typography variant="caption" sx={{
            color: isDark ? 'rgba(148,163,184,0.7)' : 'rgba(71,85,105,0.7)',
            fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
            display: 'block', mb: 0.5,
          }}>
            Solana Adresi (dWallet)
          </Typography>
          <Stack direction="row" alignItems="flex-start" spacing={1}>
            <Typography
              variant="body2"
              fontFamily="monospace"
              sx={{ flex: 1, wordBreak: 'break-all', fontSize: '0.82rem', fontWeight: 600, lineHeight: 1.5, color: isDark ? '#eff6ff' : '#1e3a8a' }}
            >
              {dwalletAddress}
            </Typography>
            <Tooltip title="Kopyala">
              <IconButton size="small" onClick={() => onCopy(dwalletAddress, 'Solana adresi')}
                sx={{ flexShrink: 0, color: isDark ? '#60a5fa' : '#2563eb', mt: 0.2 }}>
                <ContentCopy sx={{ fontSize: 15 }} />
              </IconButton>
            </Tooltip>
          </Stack>

          <Divider sx={{ my: 2, borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }} />

          {/* Balance */}
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Box>
              <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ fontSize: '0.65rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Bakiye
              </Typography>
              <Typography variant="h5" fontWeight={800} sx={{ color: isDark ? '#eff6ff' : '#1e3a8a', letterSpacing: '-0.03em', lineHeight: 1.2 }}>
                {solBalanceLoading
                  ? <CircularProgress size={18} sx={{ ml: 1 }} />
                  : solBalance !== null
                    ? `${solBalance.toFixed(6)} SOL`
                    : '— SOL'
                }
              </Typography>
            </Box>
            <IconButton
              size="small"
              onClick={onRefreshBalance}
              disabled={solBalanceLoading}
              sx={{
                bgcolor: isDark ? 'rgba(96,165,250,0.1)' : 'rgba(37,99,235,0.08)',
                color: isDark ? '#60a5fa' : '#2563eb',
                '&:hover': { bgcolor: isDark ? 'rgba(96,165,250,0.2)' : 'rgba(37,99,235,0.15)' },
              }}
            >
              <Refresh sx={{ fontSize: 17 }} />
            </IconButton>
          </Stack>
        </Box>
      </Paper>

      {/* Action Buttons */}
      <Stack direction="row" spacing={1.5}>
        <Button
          variant="contained"
          startIcon={<Send sx={{ fontSize: 16 }} />}
          sx={{
            flex: 1, fontWeight: 700, borderRadius: 3, textTransform: 'none',
            background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
            boxShadow: '0 4px 16px rgba(37,99,235,0.3)',
          }}
          disabled
        >
          Gönder
        </Button>
        <Button
          variant="outlined"
          startIcon={<CallReceived sx={{ fontSize: 16 }} />}
          sx={{ flex: 1, fontWeight: 700, borderRadius: 3, textTransform: 'none' }}
          onClick={() => onCopy(dwalletAddress, 'Solana adresi')}
        >
          Al
        </Button>
      </Stack>

      <Typography variant="caption" color="text.disabled" textAlign="center" sx={{ fontSize: '0.68rem' }}>
        Gönderme — IKA MPC imzalama entegrasyonu tamamlanıyor
      </Typography>

      {/* Technical Details */}
      <Paper elevation={0} sx={{
        borderRadius: 3, overflow: 'hidden',
        border: `1px solid ${theme.palette.divider}`,
      }}>
        <Stack
          direction="row" alignItems="center" justifyContent="space-between"
          sx={{ px: 2, py: 1.5, cursor: 'pointer', userSelect: 'none' }}
          onClick={onToggleDetails}
        >
          <Typography variant="body2" fontWeight={700} sx={{ fontSize: '0.82rem' }}>Teknik Detaylar</Typography>
          {showDetails ? <KeyboardArrowUp sx={{ fontSize: 18 }} /> : <ExpandMore sx={{ fontSize: 18 }} />}
        </Stack>

        <Collapse in={showDetails}>
          <Divider />
          <Stack spacing={1.5} sx={{ p: 2 }}>
            <DetailRow label="dWallet ID" value={dwalletId} onCopy={() => onCopy(dwalletId, 'dWallet ID')} />
            <DetailRow label="Cap ID" value={dwalletCapId} onCopy={() => onCopy(dwalletCapId, 'Cap ID')} />
            <DetailRow label="Son TX" value={lastTxDigest} onCopy={() => onCopy(lastTxDigest, 'TX digest')} />
          </Stack>
          <Divider />
          <Box sx={{ p: 1.5, display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="text" color="error" size="small" onClick={onReset}
              sx={{ fontSize: '0.72rem', textTransform: 'none' }}>
              dWallet verilerini temizle
            </Button>
          </Box>
        </Collapse>
      </Paper>
    </Stack>
  );
}

function DetailRow({ label, value, onCopy }: { label: string; value?: string; onCopy: () => void }) {
  if (!value) return null;
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ fontSize: '0.65rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {label}
      </Typography>
      <Stack direction="row" alignItems="center" spacing={0.5}>
        <Typography variant="caption" fontFamily="monospace"
          sx={{ flex: 1, wordBreak: 'break-all', fontSize: '0.68rem', lineHeight: 1.5 }}>
          {value}
        </Typography>
        <IconButton size="small" onClick={onCopy}>
          <ContentCopy sx={{ fontSize: 13 }} />
        </IconButton>
      </Stack>
    </Box>
  );
}
