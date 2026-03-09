import * as React from "react";
import { Typography, Box, Button, Grid, Alert, Stack, TextField, Paper, Container, IconButton, InputAdornment, CircularProgress, LinearProgress } from "@mui/material";
import { AppContext, WalletContext } from "../AppContext.js";
import { useNavigate } from "react-router";
import { Visibility, VisibilityOff, Google, Lock, Fingerprint } from "@mui/icons-material";
import { Mnemonic } from "ethers";
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { BiometricService } from '../backend/BiometricService';
import type AccountManager from '../backend/AccountManager';
import type StorageManager from '../backend/StorageManager';

// --- Web3Auth Imports ---
import { Web3Auth } from "@web3auth/modal";
import { CHAIN_NAMESPACES, WEB3AUTH_NETWORK } from "@web3auth/base";
import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider";

const clientId = import.meta.env.VITE_WEB3AUTH_CLIENT_ID || "BPi5PB_UiIZ-cPz1GtV5i1I2iOSOHuimiXBI0e-Oe_u6X3oVAbCiAZOTEBtTXw4tsluTITPqA8zMsfxIKMjiqNQ"; // Fallback: Web3Auth public testing clientId

/** Calculate password strength 0-100 */
function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 6) score += 15;
  if (pw.length >= 8) score += 15;
  if (pw.length >= 12) score += 10;
  if (/[a-z]/.test(pw)) score += 10;
  if (/[A-Z]/.test(pw)) score += 15;
  if (/[0-9]/.test(pw)) score += 15;
  if (/[^a-zA-Z0-9]/.test(pw)) score += 20;
  score = Math.min(100, score);
  if (score < 30) return { score, label: i18n.t("auth.strengthWeak"), color: "#ef4444" };
  if (score < 60) return { score, label: i18n.t("auth.strengthFair"), color: "#f59e0b" };
  if (score < 80) return { score, label: i18n.t("auth.strengthGood"), color: "#3b82f6" };
  return { score, label: i18n.t("auth.strengthStrong"), color: "#22c55e" };
}

enum AuthStep {
  CHOICE,
  CREATE,
  IMPORT,
  LOGIN,
  SET_PASSWORD
}

interface WalletStepProps {
  accountManager: AccountManager | undefined;
  onDone: () => void;
}

interface PasswordScreenProps {
  storageManager: StorageManager | undefined;
  accountManager: AccountManager | undefined;
  onDone: () => void;
}

interface LoginProps {
  storageManager: StorageManager | undefined;
  accountManager: AccountManager | undefined;
}

// --- Steps Components ---

function CreateWallet({ accountManager, onDone }: WalletStepProps) {
  const { t } = useTranslation();
  const [words, setWords] = React.useState<string[]>([]);
  const [isGenerated, setIsGenerated] = React.useState(false);

  const handleGenerate = () => {
    if (!accountManager) return;
    const index = accountManager.CreateAccount();
    if (index < 0) return;

    const mnemonicWords = accountManager.accounts[index]?.GetWords();
    setWords(mnemonicWords ?? []);
    setIsGenerated(true);
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} gutterBottom align="center" color="text.primary">
        {t('auth.createNewWallet')}
      </Typography>

      {isGenerated ? (
        <>
          <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 3 }}>
            {t('auth.writeDownWords')}
          </Typography>

          <Paper elevation={0} variant="outlined" sx={{ p: 2, borderRadius: 3, bgcolor: 'grey.50' }}>
            <Grid container spacing={1}>
              {words.map((word, index) => (
                <Grid size={{ xs: 6, sm: 4 }} key={index}>
                  <Box sx={{
                    display: 'flex',
                    borderRadius: 2,
                    overflow: 'hidden',
                    bgcolor: 'white',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                  }}>
                    <Box sx={{
                      width: 28,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: 'grey.100',
                      fontSize: 12,
                      color: 'text.secondary',
                      borderRight: '1px solid #e5e5e5'
                    }}>
                      {index + 1}
                    </Box>
                    <Typography sx={{ px: 1.5, py: 0.5, fontSize: 14, fontFamily: 'monospace', color: 'text.primary' }}>
                      {word}
                    </Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Paper>

          <Button
            variant="contained"
            fullWidth
            onClick={onDone}
            size="large"
            sx={{ mt: 4, borderRadius: 3, height: 48, fontSize: 16 }}
          >
            {t('auth.iSavedMyPhrase')}
          </Button>
        </>
      ) : (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="body1" sx={{ mb: 4, color: 'text.secondary' }}>
            {t('auth.generateDescription')}
          </Typography>
          <Button
            variant="contained"
            fullWidth
            onClick={handleGenerate}
            disabled={!accountManager}
            size="large"
            sx={{ borderRadius: 3, height: 48 }}
          >
            {t('auth.generatePhrase')}
          </Button>
        </Box>
      )}
    </Box>
  );
}

function ImportWallet({ accountManager, onDone }: WalletStepProps) {
  const { t } = useTranslation();
  const [mnemonic, setMnemonic] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const [isScanning, setIsScanning] = React.useState(false);

  const handleImport = async () => {
    if (!accountManager) return;

    if (!Mnemonic.isValidMnemonic(mnemonic.trim())) {
      setError(t('auth.invalidMnemonic'));
      return;
    }

    setIsScanning(true);
    try {
      const index = accountManager.ImportAccount(mnemonic.trim());
      if (index === -1) {
        setError(t('auth.importFailed'));
        setIsScanning(false);
        return;
      }

      const rpcs = [
        import.meta.env.VITE_ALCHEMY_MAINNET_API_KEY || "https://cloudflare-eth.com",
        import.meta.env.VITE_ALCHEMY_SEPOLIA_API_KEY || "https://rpc.sepolia.org",
        import.meta.env.VITE_ALCHEMY_ARBSEPOLIA_API_KEY || "https://sepolia-rollup.arbitrum.io/rpc",
        import.meta.env.VITE_ALCHEMY_BASESEPOLIA_API_KEY || "https://sepolia.base.org"
      ];
      await accountManager.AutoDiscoverAccounts(rpcs, 3, index);

      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setIsScanning(false);
    }
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} gutterBottom align="center" color="text.primary">
        {t('auth.importTitle')}
      </Typography>
      <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 3 }}>
        {t('auth.importDescription')}
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

      <TextField
        placeholder="apple banana cat dog..."
        multiline
        fullWidth
        minRows={4}
        value={mnemonic}
        onChange={(e) => {
          setMnemonic(e.target.value);
          setError(null);
        }}
        sx={{
          '& .MuiOutlinedInput-root': {
            borderRadius: 3,
            bgcolor: 'grey.50',
            fontFamily: 'monospace'
          }
        }}
      />

      <Button
        variant="contained"
        fullWidth
        onClick={handleImport}
        disabled={!accountManager || isScanning}
        size="large"
        sx={{ mt: 3, borderRadius: 3, height: 48 }}
      >
        {isScanning ? t('auth.scanningAccounts') : t('auth.importWallet')}
      </Button>
    </Box>
  );
}

/**
 * Set Password screen — shown AFTER wallet creation/import to encrypt account data.
 */
function SetPasswordScreen({ storageManager, accountManager, onDone }: PasswordScreenProps) {
  const { t } = useTranslation();
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const strength = getPasswordStrength(password);

  const handleSubmit = async () => {
    if (password.length < 8) {
      setError(t('auth.passwordMinLength'));
      return;
    }
    if (strength.score < 30) {
      setError(t('auth.passwordTooWeak'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }

    setIsLoading(true);
    try {
      // Initialize encryption with the new password (generates salt + hashes password)
      const ok = await storageManager?.initEncryption(password);
      if (!ok) {
        setError(t('auth.encryptionFailed'));
        setIsLoading(false);
        return;
      }

      // Now persist the in-memory accounts to encrypted storage
      await accountManager?.loadFromEncryptedStorage(); // This will detect plaintext and auto-migrate
      // If no migration happened (fresh create), manually trigger save
      if (storageManager?.hasUnencryptedAccounts()) {
        await storageManager?.migrateToEncrypted();
      }

      onDone();
    } catch (e) {
      setError((e instanceof Error ? e.message : String(e)) || "Encryption failed.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box>
      <Box sx={{ textAlign: 'center', mb: 3 }}>
        <Lock sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
        <Typography variant="h5" fontWeight={700} color="text.primary">
          {t('auth.secureYourWallet')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {t('auth.secureDescription')}
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

      <Stack spacing={2}>
        <TextField
          label={t('auth.password')}
          type={showPassword ? "text" : "password"}
          fullWidth
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(null); }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton onClick={() => setShowPassword(!showPassword)} edge="end" aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              </InputAdornment>
            ),
          }}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3, bgcolor: 'white' } }}
        />

        {/* Password Strength Meter */}
        {password.length > 0 && (
          <Box>
            <LinearProgress
              variant="determinate"
              value={strength.score}
              sx={{
                height: 6,
                borderRadius: 3,
                bgcolor: 'grey.200',
                '& .MuiLinearProgress-bar': {
                  bgcolor: strength.color,
                  borderRadius: 3,
                  transition: 'transform 0.3s ease, background-color 0.3s ease',
                },
              }}
            />
            <Typography variant="caption" sx={{ color: strength.color, fontWeight: 600, mt: 0.5, display: 'block', textAlign: 'right' }}>
              {strength.label}
            </Typography>
          </Box>
        )}

        <TextField
          label={t('auth.confirmPassword')}
          type={showPassword ? "text" : "password"}
          fullWidth
          value={confirmPassword}
          onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3, bgcolor: 'white' } }}
        />
      </Stack>

      <Paper elevation={0} sx={{ p: 2, mt: 2, borderRadius: 2, bgcolor: 'rgba(37, 99, 235, 0.04)', border: '1px solid rgba(37, 99, 235, 0.08)' }}>
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: t('auth.encryptionNote') }} />
      </Paper>

      <Button
        variant="contained"
        fullWidth
        onClick={handleSubmit}
        disabled={isLoading}
        size="large"
        sx={{ mt: 3, borderRadius: 3, height: 48 }}
      >
        {isLoading ? <CircularProgress size={24} color="inherit" /> : t('auth.encryptAndContinue')}
      </Button>
    </Box>
  );
}

/**
 * Login / Unlock screen — decrypts accounts using password.
 */
function LoginIntoWallet({ storageManager, accountManager }: LoginProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [showPassword, setShowPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [biometricAvailable, setBiometricAvailable] = React.useState(false);

  // Check if biometric login is available on mount
  React.useEffect(() => {
    (async () => {
      const available = await BiometricService.isBiometricAvailable();
      const registered = BiometricService.isEnabled();
      setBiometricAvailable(available && registered);
    })();
  }, []);

  const handleSubmit = async () => {
    if (!storageManager) {
      navigate("/home");
      return;
    }

    if (password.length < 1) {
      setError(t('auth.enterPasswordPrompt'));
      return;
    }

    setIsLoading(true);
    try {
      // Verify password and derive AES key
      const ok = await storageManager.initEncryption(password);
      if (!ok) {
        setError(t('auth.incorrectPassword'));
        setIsLoading(false);
        return;
      }

      // Load and decrypt accounts into memory
      await accountManager?.loadFromEncryptedStorage();

      navigate("/home");
    } catch (e) {
      setError((e instanceof Error ? e.message : String(e)) || "Unlock failed.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleBiometricUnlock = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const masterPassword = await BiometricService.authenticateBiometric();
      if (!masterPassword) {
        setError(t('auth.biometricFailed'));
        setIsLoading(false);
        return;
      }

      const ok = await storageManager?.initEncryption(masterPassword);
      if (!ok) {
        setError(t('auth.biometricFailed'));
        setIsLoading(false);
        return;
      }

      await accountManager?.loadFromEncryptedStorage();
      navigate("/home");
    } catch (e) {
      setError(t('auth.biometricFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} gutterBottom align="center" color="text.primary">
        {t('auth.welcomeBack')}
      </Typography>
      <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 4 }}>
        {t('auth.welcomeBackDesc')}
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

      <TextField
        label={t('auth.password')}
        type={showPassword ? "text" : "password"}
        fullWidth
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton onClick={() => setShowPassword(!showPassword)} edge="end" aria-label={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? <VisibilityOff /> : <Visibility />}
              </IconButton>
            </InputAdornment>
          ),
        }}
        sx={{
          '& .MuiOutlinedInput-root': {
            borderRadius: 3,
            bgcolor: 'white'
          }
        }}
      />

      <Button
        variant="contained"
        fullWidth
        onClick={handleSubmit}
        disabled={isLoading}
        size="large"
        sx={{ mt: 3, borderRadius: 3, height: 48 }}
      >
        {isLoading ? <CircularProgress size={24} color="inherit" /> : t('auth.unlock')}
      </Button>

      {/* Biometric Unlock Button */}
      {biometricAvailable && (
        <Button
          variant="outlined"
          fullWidth
          onClick={handleBiometricUnlock}
          disabled={isLoading}
          size="large"
          startIcon={<Fingerprint />}
          sx={{
            mt: 2,
            borderRadius: 3,
            height: 48,
            borderColor: 'rgba(37, 99, 235, 0.25)',
            color: 'primary.main',
            '&:hover': {
              borderColor: 'primary.main',
              bgcolor: 'rgba(37, 99, 235, 0.04)',
            }
          }}
        >
          {t('auth.biometricUnlock')}
        </Button>
      )}
    </Box>
  );
}

// --- Main Auth Component ---

export default function Auth() {
  const { t } = useTranslation();
  const context = React.useContext(WalletContext);
  const accountManager = context?.accountManager;
  const storageManager = context?.storageManager;

  const [step, setStep] = React.useState(AuthStep.CHOICE);
  const [isSocialLoading, setIsSocialLoading] = React.useState(false);

  React.useEffect(() => {
    if (!storageManager) return;

    // Determine initial step based on existing state
    if (storageManager.hasPassword()) {
      // Existing encrypted wallet — go to login
      setStep(AuthStep.LOGIN);
    } else if (storageManager.hasUnencryptedAccounts()) {
      // Legacy plaintext wallet — need to set password first, then migrate
      setStep(AuthStep.SET_PASSWORD);
    } else {
      // No wallet exists — show choice screen
      setStep(AuthStep.CHOICE);
    }
  }, [storageManager]);

  const handleWalletCreated = () => {
    // After create/import, go to set password step
    setStep(AuthStep.SET_PASSWORD);
  };

  const handlePasswordSet = () => {
    // After password is set and encryption is done, navigate to home
    const nav = document.querySelector("[data-auth-navigate]");
    // Use navigate directly
    window.location.hash = "#/home";
  };

  const navigate = React.useCallback(() => {
    window.location.hash = "#/home";
  }, []);

  return (
    <Box sx={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      bgcolor: '#f7f7f8',
      background: 'radial-gradient(circle at 50% 10%, #fff 0%, #f7f7f8 100%)',
      p: 2
    }}>
      <Container maxWidth="xs">
        <Paper elevation={0} sx={{
          p: 4,
          borderRadius: 4,
          bgcolor: 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(20px)',
          border: '1px solid #d4d4d4',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
        }}>
          {/* Logo Area */}
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Typography variant="h5" fontWeight={800} letterSpacing={1} sx={{
              background: 'linear-gradient(90deg, #dbeafe, #2563eb, #dbeafe)',
              backgroundSize: '200% auto',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              animation: 'shine 3s linear infinite'
            }}>
              ARFHE WALLET
            </Typography>
          </Box>

          {/* Login Screen (Existing encrypted wallet) */}
          {step === AuthStep.LOGIN && (
            <LoginIntoWallet storageManager={storageManager} accountManager={accountManager} />
          )}

          {/* Set Password Screen (After create/import or migration) */}
          {step === AuthStep.SET_PASSWORD && (
            <SetPasswordScreen
              storageManager={storageManager}
              accountManager={accountManager}
              onDone={() => { window.location.hash = "#/home"; }}
            />
          )}

          {/* New Wallet Choice Screen */}
          {step === AuthStep.CHOICE && (
            <Stack spacing={2}>
              <Typography variant="body1" align="center" color="text.secondary" sx={{ mb: 2 }}>
                {t('auth.welcomeMessage')}
              </Typography>

              <Button
                fullWidth
                variant="contained"
                disabled={isSocialLoading}
                onClick={async () => {
                  setIsSocialLoading(true);
                  try {
                    const chainConfig = {
                      chainNamespace: CHAIN_NAMESPACES.EIP155,
                      chainId: "0x1",
                      rpcTarget: import.meta.env.VITE_ALCHEMY_MAINNET_API_KEY || "https://cloudflare-eth.com",
                      displayName: "Ethereum Mainnet",
                      blockExplorerUrl: "https://etherscan.io",
                      ticker: "ETH",
                      tickerName: "Ethereum",
                    };

                    const privateKeyProvider = new EthereumPrivateKeyProvider({ config: { chainConfig } });

                    const web3auth = new Web3Auth({
                      clientId,
                      web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
                      privateKeyProvider,
                    });

                    await web3auth.initModal();
                    await web3auth.connect();

                    if (web3auth.provider) {
                      const privateKey = await web3auth.provider.request({ method: "eth_private_key" }) as string;
                      let accountName = "Social Account";
                      try {
                        const userInfo = await web3auth.getUserInfo();
                        if (userInfo.email) {
                          accountName = userInfo.email;
                        } else if (userInfo.name) {
                          accountName = userInfo.name;
                        }
                      } catch (e) {
                      }

                      if (privateKey) {
                        const importedIndex = accountManager?.ImportPrivateKey(privateKey, accountName);

                        const rpcs = [
                          chainConfig.rpcTarget,
                          import.meta.env.VITE_ALCHEMY_SEPOLIA_API_KEY || "https://rpc.sepolia.org",
                          import.meta.env.VITE_ALCHEMY_ARBSEPOLIA_API_KEY || "https://sepolia-rollup.arbitrum.io/rpc",
                          import.meta.env.VITE_ALCHEMY_BASESEPOLIA_API_KEY || "https://sepolia.base.org"
                        ];
                        await accountManager?.AutoDiscoverAccounts(rpcs, 3, importedIndex);

                        handleWalletCreated();
                      }
                    }
                  } catch (error) {
                  } finally {
                    setIsSocialLoading(false);
                  }
                }}
                startIcon={<Google />}
                sx={{
                  borderRadius: 3,
                  height: 48,
                  bgcolor: '#2563eb',
                  color: 'white',
                  '&:hover': { bgcolor: '#172554' }
                }}
              >
                {isSocialLoading ? t('auth.connectingScanning') : t('auth.continueWithSocial')}
              </Button>

              <Box sx={{ display: 'flex', alignItems: 'center', my: 1 }}>
                <Box sx={{ flex: 1, height: '1px', bgcolor: 'grey.300' }} />
                <Typography variant="caption" sx={{ px: 2, color: 'text.secondary', fontWeight: 600 }}>{t('auth.or')}</Typography>
                <Box sx={{ flex: 1, height: '1px', bgcolor: 'grey.300' }} />
              </Box>

              <Button
                variant="outlined"
                size="large"
                onClick={() => setStep(AuthStep.CREATE)}
                sx={{ borderRadius: 3, height: 48, borderColor: '#d4d4d4', color: 'text.primary' }}
              >
                {t('auth.createWallet')}
              </Button>
              <Button
                variant="outlined"
                size="large"
                onClick={() => setStep(AuthStep.IMPORT)}
                sx={{ borderRadius: 3, height: 48, borderColor: '#d4d4d4', color: 'text.primary' }}
              >
                {t('auth.iHaveAWallet')}
              </Button>
            </Stack>
          )}

          {/* Create Wallet Screen */}
          {step === AuthStep.CREATE && (
            <CreateWallet accountManager={accountManager} onDone={handleWalletCreated} />
          )}

          {/* Import Wallet Screen */}
          {step === AuthStep.IMPORT && (
            <Box>
              <ImportWallet accountManager={accountManager} onDone={handleWalletCreated} />
              <Button
                onClick={() => setStep(AuthStep.CHOICE)}
                color="inherit"
                sx={{ mt: 2, textTransform: 'none', color: 'text.secondary' }}
              >
                {t('auth.cancel')}
              </Button>
            </Box>
          )}
        </Paper>
      </Container>
    </Box>
  );
}
