import * as React from "react";
import { Typography, Box, Button, Grid, Alert, Stack, TextField, Paper, Container, IconButton, InputAdornment, CircularProgress } from "@mui/material";
import { AppContext, WalletContext } from "../AppContext.js";
import { useNavigate } from "react-router";
import { Visibility, VisibilityOff, Google, Lock } from "@mui/icons-material";
import { Mnemonic } from "ethers";

// --- Web3Auth Imports ---
import { Web3Auth } from "@web3auth/modal";
import { CHAIN_NAMESPACES, WEB3AUTH_NETWORK } from "@web3auth/base";
import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider";

const clientId = "BPi5PB_UiIZ-cPz1GtV5i1I2iOSOHuimiXBI0e-Oe_u6X3oVAbCiAZOTEBtTXw4tsluTITPqA8zMsfxIKMjiqNQ"; // Web3Auth public testing clientId

enum AuthStep {
  CHOICE,
  CREATE,
  IMPORT,
  LOGIN,
  SET_PASSWORD
}

// --- Steps Components ---

function CreateWallet({ accountManager, onDone }) {
  const [words, setWords] = React.useState([]);
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
        Create New Wallet
      </Typography>

      {isGenerated ? (
        <>
          <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 3 }}>
            Write down these words in the correct order. Keep them safe!
          </Typography>

          <Paper elevation={0} variant="outlined" sx={{ p: 2, borderRadius: 3, bgcolor: 'grey.50' }}>
            <Grid container spacing={1}>
              {words.map((word, index) => (
                <Grid item xs={6} sm={4} key={index}>
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
                      borderRight: '1px solid #f3f4f6'
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
            I Saved My Phrase
          </Button>
        </>
      ) : (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="body1" sx={{ mb: 4, color: 'text.secondary' }}>
            Generate a new secret recovery phrase to create your wallet.
          </Typography>
          <Button
            variant="contained"
            fullWidth
            onClick={handleGenerate}
            disabled={!accountManager}
            size="large"
            sx={{ borderRadius: 3, height: 48 }}
          >
            Generate Phrase
          </Button>
        </Box>
      )}
    </Box>
  );
}

function ImportWallet({ accountManager, onDone }) {
  const [mnemonic, setMnemonic] = React.useState("");
  const [error, setError] = React.useState(null);

  const [isScanning, setIsScanning] = React.useState(false);

  const handleImport = async () => {
    if (!accountManager) return;

    if (!Mnemonic.isValidMnemonic(mnemonic.trim())) {
      setError("Invalid recovery phrase. Please check your words.");
      return;
    }

    setIsScanning(true);
    try {
      const index = accountManager.ImportAccount(mnemonic.trim());
      if (index === -1) {
        setError("Failed to import account.");
        setIsScanning(false);
        return;
      }

      const rpcs = [
        (import.meta as any).env.VITE_ALCHEMY_MAINNET_API_KEY || "https://cloudflare-eth.com",
        (import.meta as any).env.VITE_ALCHEMY_SEPOLIA_API_KEY || "https://rpc.sepolia.org",
        (import.meta as any).env.VITE_ALCHEMY_ARBSEPOLIA_API_KEY || "https://sepolia-rollup.arbitrum.io/rpc",
        (import.meta as any).env.VITE_ALCHEMY_BASESEPOLIA_API_KEY || "https://sepolia.base.org"
      ];
      await accountManager.AutoDiscoverAccounts(rpcs, 3, index);

      onDone();
    } catch (e: any) {
      setError(e.message);
      setIsScanning(false);
    }
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} gutterBottom align="center" color="text.primary">
        Import Wallet
      </Typography>
      <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 3 }}>
        Enter your 12 or 24-word recovery phrase.
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
        {isScanning ? "Scanning Derived Accounts..." : "Import Wallet"}
      </Button>
    </Box>
  );
}

/**
 * Set Password screen — shown AFTER wallet creation/import to encrypt account data.
 */
function SetPasswordScreen({ storageManager, accountManager, onDone }) {
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const handleSubmit = async () => {
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setIsLoading(true);
    try {
      // Initialize encryption with the new password (generates salt + hashes password)
      const ok = await storageManager.initEncryption(password);
      if (!ok) {
        setError("Failed to initialize encryption.");
        setIsLoading(false);
        return;
      }

      // Now persist the in-memory accounts to encrypted storage
      await accountManager.loadFromEncryptedStorage(); // This will detect plaintext and auto-migrate
      // If no migration happened (fresh create), manually trigger save
      if (storageManager.hasUnencryptedAccounts()) {
        await storageManager.migrateToEncrypted();
      }

      onDone();
    } catch (e: any) {
      setError(e.message || "Encryption failed.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box>
      <Box sx={{ textAlign: 'center', mb: 3 }}>
        <Lock sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
        <Typography variant="h5" fontWeight={700} color="text.primary">
          Secure Your Wallet
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Set a password to encrypt your private keys. Your keys will be stored securely using AES-256 encryption.
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

      <Stack spacing={2}>
        <TextField
          label="Password"
          type={showPassword ? "text" : "password"}
          fullWidth
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(null); }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton onClick={() => setShowPassword(!showPassword)} edge="end">
                  {showPassword ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              </InputAdornment>
            ),
          }}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3, bgcolor: 'white' } }}
        />

        <TextField
          label="Confirm Password"
          type={showPassword ? "text" : "password"}
          fullWidth
          value={confirmPassword}
          onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3, bgcolor: 'white' } }}
        />
      </Stack>

      <Paper elevation={0} sx={{ p: 2, mt: 2, borderRadius: 2, bgcolor: 'rgba(99, 102, 241, 0.04)', border: '1px solid rgba(99, 102, 241, 0.1)' }}>
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
          Your password encrypts your private keys using <strong>AES-256-GCM</strong> with <strong>PBKDF2</strong> key derivation (100,000 iterations). Keys are never stored in plaintext.
        </Typography>
      </Paper>

      <Button
        variant="contained"
        fullWidth
        onClick={handleSubmit}
        disabled={isLoading}
        size="large"
        sx={{ mt: 3, borderRadius: 3, height: 48 }}
      >
        {isLoading ? <CircularProgress size={24} color="inherit" /> : "Encrypt & Continue"}
      </Button>
    </Box>
  );
}

/**
 * Login / Unlock screen — decrypts accounts using password.
 */
function LoginIntoWallet({ storageManager, accountManager }) {
  const navigate = useNavigate();
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [showPassword, setShowPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  const handleSubmit = async () => {
    if (!storageManager) {
      navigate("/home");
      return;
    }

    if (password.length < 1) {
      setError("Please enter your password.");
      return;
    }

    setIsLoading(true);
    try {
      // Verify password and derive AES key
      const ok = await storageManager.initEncryption(password);
      if (!ok) {
        setError("Incorrect password.");
        setIsLoading(false);
        return;
      }

      // Load and decrypt accounts into memory
      await accountManager?.loadFromEncryptedStorage();

      navigate("/home");
    } catch (e: any) {
      setError(e.message || "Unlock failed.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} gutterBottom align="center" color="text.primary">
        Welcome Back
      </Typography>
      <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 4 }}>
        Enter your password to decrypt and unlock your wallet
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

      <TextField
        label="Password"
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
              <IconButton onClick={() => setShowPassword(!showPassword)} edge="end">
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
        {isLoading ? <CircularProgress size={24} color="inherit" /> : "Unlock"}
      </Button>
    </Box>
  );
}

// --- Main Auth Component ---

export default function Auth() {
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
      bgcolor: '#f3f4f6',
      background: 'radial-gradient(circle at 50% 10%, #fff 0%, #f3f4f6 100%)',
      p: 2
    }}>
      <Container maxWidth="xs">
        <Paper elevation={0} sx={{
          p: 4,
          borderRadius: 4,
          bgcolor: 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(20px)',
          border: '1px solid #e5e7eb',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
        }}>
          {/* Logo Area */}
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Typography variant="h5" fontWeight={800} letterSpacing={1} sx={{
              background: 'linear-gradient(90deg, #fff, #6366f1, #fff)',
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
                Welcome to the next generation of privacy-first crypto wallets.
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
                      rpcTarget: (import.meta as any).env.VITE_ALCHEMY_MAINNET_API_KEY || "https://cloudflare-eth.com",
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
                        console.warn("Could not fetch user info from Web3Auth", e);
                      }

                      if (privateKey) {
                        const importedIndex = accountManager?.ImportPrivateKey(privateKey, accountName);

                        const rpcs = [
                          chainConfig.rpcTarget,
                          (import.meta as any).env.VITE_ALCHEMY_SEPOLIA_API_KEY || "https://rpc.sepolia.org",
                          (import.meta as any).env.VITE_ALCHEMY_ARBSEPOLIA_API_KEY || "https://sepolia-rollup.arbitrum.io/rpc",
                          (import.meta as any).env.VITE_ALCHEMY_BASESEPOLIA_API_KEY || "https://sepolia.base.org"
                        ];
                        await accountManager?.AutoDiscoverAccounts(rpcs, 3, importedIndex);

                        handleWalletCreated();
                      }
                    }
                  } catch (error) {
                    console.error("Web3Auth Login error:", error);
                  } finally {
                    setIsSocialLoading(false);
                  }
                }}
                startIcon={<Google />}
                sx={{
                  borderRadius: 3,
                  height: 48,
                  bgcolor: '#0f172a',
                  color: 'white',
                  '&:hover': { bgcolor: '#1e293b' }
                }}
              >
                {isSocialLoading ? "Connecting & Scanning..." : "Continue with Social"}
              </Button>

              <Box sx={{ display: 'flex', alignItems: 'center', my: 1 }}>
                <Box sx={{ flex: 1, height: '1px', bgcolor: 'grey.300' }} />
                <Typography variant="caption" sx={{ px: 2, color: 'text.secondary', fontWeight: 600 }}>OR</Typography>
                <Box sx={{ flex: 1, height: '1px', bgcolor: 'grey.300' }} />
              </Box>

              <Button
                variant="outlined"
                size="large"
                onClick={() => setStep(AuthStep.CREATE)}
                sx={{ borderRadius: 3, height: 48, borderColor: '#e5e7eb', color: 'text.primary' }}
              >
                Create New Wallet
              </Button>
              <Button
                variant="outlined"
                size="large"
                onClick={() => setStep(AuthStep.IMPORT)}
                sx={{ borderRadius: 3, height: 48, borderColor: '#e5e7eb', color: 'text.primary' }}
              >
                I Have A Wallet
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
                Cancel
              </Button>
            </Box>
          )}
        </Paper>
      </Container>
    </Box>
  );
}
