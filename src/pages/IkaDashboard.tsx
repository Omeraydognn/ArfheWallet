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
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Step,
  StepLabel,
  Stepper,
} from '@mui/material';
import {
  ContentCopy,
  Refresh,
  CheckCircle,
  RadioButtonUnchecked,
  OpenInNew,
  AccountBalanceWallet,
  Send,
  CallReceived,
  KeyboardArrowDown,
  KeyboardArrowUp,
  Warning,
  WaterDrop,
} from '@mui/icons-material';
import { useToast } from '../components/ToastProvider.js';
import { useAccount } from '../hooks/useAccount.js';
import { useWallet } from '../hooks/useWallet.js';
import { IkaService, type DKGProgress, type DKGStep, type FundingStatus, MIN_SUI_FOR_GAS, MIN_IKA_FOR_DKG } from '../backend/IkaService.js';

const SUI_FAUCET_URL = 'https://faucet.testnet.sui.io/v2/gas';
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

// ─── Types ───────────────────────────────────────────────────────────────────

type Phase = 'setup' | 'creating' | 'active';

const DKG_STEPS: { key: DKGStep; label: string }[] = [
  { key: 'funding-check', label: 'Fonlama kontrolü' },
  { key: 'preparing-dkg', label: 'DKG hazırlanıyor' },
  { key: 'submitting', label: 'Ika ağına gönderiliyor' },
  { key: 'waiting-activation', label: 'Aktivasyon bekleniyor' },
  { key: 'complete', label: 'Tamamlandı' },
];

const STEP_ORDER: DKGStep[] = ['funding-check', 'preparing-dkg', 'submitting', 'waiting-activation', 'complete'];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function IkaDashboard() {
  const { showToast } = useToast();
  const { account, activeIndex } = useAccount();
  const { accountManager } = useWallet();

  const [phase, setPhase] = useState<Phase>('setup');
  const [funding, setFunding] = useState<FundingStatus | null>(null);
  const [fundingLoading, setFundingLoading] = useState(false);
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [solBalanceLoading, setSolBalanceLoading] = useState(false);
  const [currentProgress, setCurrentProgress] = useState<DKGProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const suiAddress = account?.sui_address;
  const mnemonic = account?.mnemonic?.phrase;
  const dwalletAddress = account?.ika_solana_dwallet;
  const dwalletId = account?.ika_solana_mpc_id;
  const dwalletCapId = account?.ika_solana_dwallet_cap_id;
  const lastTxDigest = account?.ika_last_tx_digest;

  // Sync phase from persisted account data (don't override 'creating')
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
      setError(`Bakiye yüklenirken hata: ${e?.message || String(e)}`);
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
      setError('Bu hesap için Sui imzalayıcı bulunamadı. Mnemonic ile oluşturulmuş hesap gereklidir.');
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
      setError(e?.message || String(e));
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

  return (
    <Box sx={{ p: 2, maxWidth: 480, mx: 'auto' }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1} mb={2}>
        <AccountBalanceWallet sx={{ color: 'primary.main' }} />
        <Typography variant="h6" fontWeight={700}>Arfhe dWallet</Typography>
        <Chip
          label="Solana"
          size="small"
          color="primary"
          variant="outlined"
          sx={{ ml: 'auto' }}
        />
      </Stack>

      {error && phase === 'setup' && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
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
      showToast('SUI testnet tokeni talep edildi! Bakiye yenileniyor...', 'success');
      timerRef.current = setTimeout(onRefreshFunding, 4000);
    } catch (e: any) {
      showToast(`Faucet hatası: ${e?.message || String(e)}`, 'error');
    } finally {
      setSuiFaucetLoading(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Alert severity="info" icon={false}>
        <Typography variant="body2" fontWeight={600} gutterBottom>
          dWallet nedir?
        </Typography>
        <Typography variant="caption" color="text.secondary">
          IKA ağının MPC sistemi, özel anahtarı hiçbir zaman tek bir yerde tutmadan Solana işlemleri imzalar. Kurulum için Sui testnet SUI + IKA token gereklidir.
        </Typography>
      </Alert>

      {/* Sui Address */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={1}>
          SUI TESTNET ADRESİNİZ
        </Typography>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography
            variant="body2"
            fontFamily="monospace"
            sx={{ flex: 1, wordBreak: 'break-all', fontSize: '0.73rem' }}
          >
            {suiAddress ?? '—'}
          </Typography>
          <Tooltip title="Kopyala">
            <IconButton size="small" onClick={() => onCopy(suiAddress, 'Sui adresi')}>
              <ContentCopy fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Paper>

      {/* Funding status */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1.5}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            FONLAMA DURUMU
          </Typography>
          <IconButton size="small" onClick={onRefreshFunding} disabled={fundingLoading}>
            {fundingLoading ? <CircularProgress size={14} /> : <Refresh fontSize="small" />}
          </IconButton>
        </Stack>

        <Stack spacing={1.5}>
          {/* SUI row */}
          <Stack direction="row" alignItems="center" spacing={1}>
            {fundingLoading
              ? <CircularProgress size={16} />
              : hasSui
                ? <CheckCircle sx={{ color: 'success.main', fontSize: 18 }} />
                : <Warning sx={{ color: 'warning.main', fontSize: 18 }} />
            }
            <Box flex={1}>
              <Typography variant="body2">SUI (gas)</Typography>
              <Typography variant="caption" color="text.secondary">
                {funding ? `${suiSui.toFixed(4)} SUI` : '—'}
              </Typography>
            </Box>
            {!hasSui && (
              <Button
                size="small"
                variant="outlined"
                startIcon={suiFaucetLoading ? <CircularProgress size={12} /> : <WaterDrop sx={{ fontSize: 14 }} />}
                onClick={handleSuiFaucet}
                disabled={suiFaucetLoading || !suiAddress}
                sx={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}
              >
                {suiFaucetLoading ? 'Talep ediliyor...' : 'Otomatik Al'}
              </Button>
            )}
          </Stack>

          <Divider />

          {/* IKA row */}
          <Stack direction="row" alignItems="center" spacing={1}>
            {fundingLoading
              ? <CircularProgress size={16} />
              : hasIka
                ? <CheckCircle sx={{ color: 'success.main', fontSize: 18 }} />
                : <Warning sx={{ color: 'warning.main', fontSize: 18 }} />
            }
            <Box flex={1}>
              <Typography variant="body2">IKA (DKG ücreti)</Typography>
              <Typography variant="caption" color="text.secondary">
                {funding ? `${ikaIka.toFixed(4)} IKA` : '—'}
              </Typography>
            </Box>
            {!hasIka && (
              <Button
                size="small"
                variant="outlined"
                endIcon={<OpenInNew sx={{ fontSize: 12 }} />}
                onClick={() => setIkaGuideOpen(true)}
                sx={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}
              >
                Nasıl alınır?
              </Button>
            )}
          </Stack>
        </Stack>
      </Paper>

      <Button
        variant="contained"
        size="large"
        fullWidth
        onClick={onCreate}
        disabled={!canCreate || fundingLoading}
        sx={{ py: 1.5, fontWeight: 700 }}
      >
        {canCreate ? 'dWallet Oluştur' : 'Önce hesabı fonlayın'}
      </Button>

      {!canCreate && funding !== null && (
        <Typography variant="caption" color="text.secondary" textAlign="center">
          Hem SUI hem IKA token gereklidir. SUI'yi yukarıdaki butonla otomatik alabilirsiniz.
        </Typography>
      )}

      {/* IKA Guide Dialog */}
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
  open,
  onClose,
  mnemonic,
  onCopy,
  hasSui,
  onGetSui,
  suiFaucetLoading,
}: {
  open: boolean;
  onClose: () => void;
  mnemonic?: string;
  onCopy: (text?: string, label?: string) => void;
  hasSui: boolean;
  onGetSui: () => void;
  suiFaucetLoading: boolean;
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
          {/* Step 1: Get SUI */}
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
                    size="small"
                    variant="outlined"
                    startIcon={suiFaucetLoading ? <CircularProgress size={12} /> : <WaterDrop />}
                    onClick={onGetSui}
                    disabled={suiFaucetLoading}
                  >
                    {suiFaucetLoading ? 'Talep ediliyor...' : 'Otomatik SUI Al'}
                  </Button>
                </Stack>
              )}
            </Box>
          </Step>

          {/* Step 2: Import into Sui Wallet */}
          <Step active expanded>
            <StepLabel>
              <Typography variant="body2" fontWeight={600}>
                Sui Wallet eklentisine import et
              </Typography>
            </StepLabel>
            <Box sx={{ ml: 3.5, mb: 2 }}>
              <Stack spacing={1}>
                <Typography variant="caption" color="text.secondary">
                  Chrome Web Store'dan <strong>Sui Wallet</strong> eklentisini kurun. Ardından mnemonic kelimelerinizle hesabınızı import edin.
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    variant="outlined"
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
                    <Typography variant="caption" fontWeight={600}>
                      Bu kelimeleri kimseyle paylaşmayın!
                    </Typography>
                  </Alert>
                  <Paper
                    variant="outlined"
                    sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}
                  >
                    <Typography
                      variant="caption"
                      fontFamily="monospace"
                      sx={{ wordBreak: 'break-word', display: 'block' }}
                    >
                      {mnemonic ?? 'Mnemonic bulunamadı (private key ile oluşturulan hesaplarda mnemonic yoktur)'}
                    </Typography>
                    {mnemonic && (
                      <Button
                        size="small"
                        startIcon={<ContentCopy sx={{ fontSize: 12 }} />}
                        onClick={() => onCopy(mnemonic, 'Mnemonic')}
                        sx={{ mt: 0.5, fontSize: '0.68rem' }}
                      >
                        Kopyala
                      </Button>
                    )}
                  </Paper>
                  <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                    Sui Wallet → Import → Passphrase ile girin. Derivasyon yolu: <code>m/44'/784'/0'/0'/0'</code>
                  </Typography>
                </Collapse>
              </Stack>
            </Box>
          </Step>

          {/* Step 3: Swap at faucet.ika.xyz */}
          <Step active expanded>
            <StepLabel>
              <Typography variant="body2" fontWeight={600}>
                faucet.ika.xyz'de SUI → IKA swap et
              </Typography>
            </StepLabel>
            <Box sx={{ ml: 3.5, mb: 1 }}>
              <Stack spacing={1}>
                <Typography variant="caption" color="text.secondary">
                  Sui Wallet bağlantısıyla testnet SUI'nizi IKA'ya dönüştürün. Discord hesabına gerek yok.
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Paper
                    variant="outlined"
                    sx={{ p: 1, flex: 1, bgcolor: 'action.hover', borderRadius: 1 }}
                  >
                    <Typography variant="caption" fontFamily="monospace">
                      {IKA_EXCHANGE_URL}
                    </Typography>
                  </Paper>
                  <Button
                    size="small"
                    variant="contained"
                    endIcon={<OpenInNew sx={{ fontSize: 12 }} />}
                    onClick={() => window.open(IKA_EXCHANGE_URL, '_blank')}
                    sx={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}
                  >
                    Aç
                  </Button>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  Swap sonrası Arfhe wallet'a geri dönün ve bakiyeyi yenileyin.
                </Typography>
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
  currentProgress,
  error,
  onRetry,
}: {
  currentProgress: DKGProgress | null;
  error: string | null;
  onRetry: () => void;
}) {
  const currentStep = currentProgress?.step ?? 'funding-check';
  const currentIndex = STEP_ORDER.indexOf(currentStep);

  if (error) {
    return (
      <Stack spacing={2}>
        <Alert severity="error">
          <Typography variant="body2" fontWeight={600} gutterBottom>
            dWallet oluşturulamadı
          </Typography>
          <Typography variant="caption" sx={{ wordBreak: 'break-word', display: 'block', mb: 1 }}>
            {error}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            Detaylı hata için tarayıcı konsolunu (F12) kontrol edin.
          </Typography>
        </Alert>
        <Button variant="outlined" onClick={onRetry} fullWidth>
          Geri Dön ve Tekrar Dene
        </Button>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      <Alert severity="info" icon={<CircularProgress size={18} />}>
        <Typography variant="body2" fontWeight={600}>
          dWallet oluşturuluyor...
        </Typography>
        <Typography variant="caption">
          {currentProgress?.message ?? 'Başlatılıyor...'}
        </Typography>
      </Alert>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={1.5}>
          {DKG_STEPS.map((step, idx) => {
            const done = idx < currentIndex;
            const active = idx === currentIndex;
            return (
              <Stack key={step.key} direction="row" alignItems="center" spacing={1.5}>
                {done ? (
                  <CheckCircle sx={{ color: 'success.main', fontSize: 20 }} />
                ) : active ? (
                  <CircularProgress size={20} />
                ) : (
                  <RadioButtonUnchecked sx={{ color: 'text.disabled', fontSize: 20 }} />
                )}
                <Typography
                  variant="body2"
                  color={done ? 'text.primary' : active ? 'primary.main' : 'text.disabled'}
                  fontWeight={active ? 600 : 400}
                >
                  {step.label}
                </Typography>
              </Stack>
            );
          })}
        </Stack>
      </Paper>

      <LinearProgress variant="determinate" value={(currentIndex / (STEP_ORDER.length - 1)) * 100} />

      <Typography variant="caption" color="text.secondary" textAlign="center">
        Bu işlem 2-3 dakika sürebilir. Lütfen sayfayı kapatmayın.
      </Typography>
    </Stack>
  );
}

// ─── Active Phase ─────────────────────────────────────────────────────────────

function ActivePhase({
  dwalletAddress,
  dwalletId,
  dwalletCapId,
  lastTxDigest,
  solBalance,
  solBalanceLoading,
  showDetails,
  onToggleDetails,
  onCopy,
  onRefreshBalance,
  onReset,
}: {
  dwalletAddress: string;
  dwalletId?: string;
  dwalletCapId?: string;
  lastTxDigest?: string;
  solBalance: number | null;
  solBalanceLoading: boolean;
  showDetails: boolean;
  onToggleDetails: () => void;
  onCopy: (text?: string, label?: string) => void;
  onRefreshBalance: () => void;
  onReset: () => void;
}) {
  return (
    <Stack spacing={2}>
      {/* Status chip */}
      <Stack direction="row" alignItems="center">
        <CheckCircle sx={{ color: 'success.main', fontSize: 18, mr: 0.5 }} />
        <Typography variant="body2" color="success.main" fontWeight={600}>Aktif</Typography>
        <Typography variant="caption" color="text.secondary" ml={1}>• IKA Testnet · Ed25519</Typography>
      </Stack>

      {/* Main address card */}
      <Paper
        variant="outlined"
        sx={{ p: 2, borderColor: 'primary.main', borderWidth: 1.5 }}
      >
        <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={0.5}>
          SOLANA ADRESİ (dWallet)
        </Typography>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography
            variant="body1"
            fontFamily="monospace"
            fontWeight={600}
            sx={{ flex: 1, wordBreak: 'break-all', fontSize: '0.85rem' }}
          >
            {dwalletAddress}
          </Typography>
          <Tooltip title="Kopyala">
            <IconButton size="small" onClick={() => onCopy(dwalletAddress, 'Solana adresi')}>
              <ContentCopy fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>

        <Divider sx={{ my: 1.5 }} />

        {/* SOL Balance */}
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>BAKİYE</Typography>
            <Typography variant="h6" fontWeight={700}>
              {solBalanceLoading
                ? <CircularProgress size={16} sx={{ ml: 1 }} />
                : solBalance !== null
                  ? `${solBalance.toFixed(6)} SOL`
                  : '— SOL'
              }
            </Typography>
          </Box>
          <IconButton size="small" onClick={onRefreshBalance} disabled={solBalanceLoading}>
            <Refresh fontSize="small" />
          </IconButton>
        </Stack>
      </Paper>

      {/* Action buttons */}
      <Stack direction="row" spacing={1.5}>
        <Button
          variant="contained"
          startIcon={<Send />}
          sx={{ flex: 1, fontWeight: 600 }}
          disabled
        >
          Gönder
        </Button>
        <Button
          variant="outlined"
          startIcon={<CallReceived />}
          sx={{ flex: 1, fontWeight: 600 }}
          onClick={() => onCopy(dwalletAddress, 'Solana adresi')}
        >
          Al
        </Button>
      </Stack>

      <Typography variant="caption" color="text.secondary" textAlign="center">
        Gönderme işlevi — IKA MPC imzalama entegrasyonu tamamlanıyor
      </Typography>

      {/* Details collapsible */}
      <Paper variant="outlined" sx={{ p: 0 }}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ px: 2, py: 1.5, cursor: 'pointer' }}
          onClick={onToggleDetails}
        >
          <Typography variant="body2" fontWeight={600}>Teknik Detaylar</Typography>
          {showDetails ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
        </Stack>

        <Collapse in={showDetails}>
          <Divider />
          <Stack spacing={1.5} sx={{ p: 2 }}>
            <DetailRow label="dWallet ID" value={dwalletId} onCopy={() => onCopy(dwalletId, 'dWallet ID')} />
            <DetailRow label="Cap ID" value={dwalletCapId} onCopy={() => onCopy(dwalletCapId, 'Cap ID')} />
            <DetailRow label="Son TX" value={lastTxDigest} onCopy={() => onCopy(lastTxDigest, 'TX digest')} />
          </Stack>
          <Divider />
          <Box sx={{ p: 2 }}>
            <Button
              variant="text"
              color="error"
              size="small"
              onClick={onReset}
            >
              dWallet verilerini temizle
            </Button>
          </Box>
        </Collapse>
      </Paper>
    </Stack>
  );
}

function DetailRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value?: string;
  onCopy: () => void;
}) {
  if (!value) return null;
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" fontWeight={600}>{label}</Typography>
      <Stack direction="row" alignItems="center" spacing={0.5}>
        <Typography
          variant="caption"
          fontFamily="monospace"
          sx={{ flex: 1, wordBreak: 'break-all', fontSize: '0.7rem' }}
        >
          {value}
        </Typography>
        <IconButton size="small" onClick={onCopy}>
          <ContentCopy sx={{ fontSize: 14 }} />
        </IconButton>
      </Stack>
    </Box>
  );
}
