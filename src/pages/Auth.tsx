import * as React from "react";
import { Typography, Box, Button, Grid, Alert, Stack, TextField, Paper, Container, IconButton, InputAdornment } from "@mui/material";
import { AppContext, WalletContext } from "../AppContext.js";
import { useNavigate } from "react-router";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import { Mnemonic } from "ethers";

enum AuthStep {
  CHOICE,
  CREATE,
  IMPORT,
  LOGIN
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
                    // border: '1px solid #e5e7eb',
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

  const handleImport = () => {
    if (!accountManager) return;

    if (!Mnemonic.isValidMnemonic(mnemonic.trim())) {
      setError("Invalid recovery phrase. Please check your words.");
      return;
    }

    try {
      const index = accountManager.ImportAccount(mnemonic.trim());
      if (index === -1) {
        setError("Failed to import account.");
        return;
      }
      onDone();
    } catch (e) {
      setError(e.message);
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
        size="large"
        sx={{ mt: 3, borderRadius: 3, height: 48 }}
      >
        Import Wallet
      </Button>
    </Box>
  );
}

function LoginIntoWallet({ storageManager }) {
  const navigate = useNavigate();
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState(null);
  const [isSettingPassword, setIsSettingPassword] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);

  React.useEffect(() => {
    if (!storageManager) return;
    const stored = storageManager.getLocal("passwd");
    setIsSettingPassword(!stored);
  }, [storageManager]);

  const handleSubmit = () => {
    if (!storageManager) {
      // Fallback for demo/dev if storage manager isnt ready properly
      navigate("/home");
      return;
    }

    if (isSettingPassword) {
      if (password.length < 4) {
        setError("Password is too short.");
        return;
      }
      storageManager.setLocal("passwd", password);
      navigate("/home");
    } else {
      const stored = storageManager.getLocal("passwd");
      if (stored === password) {
        navigate("/home");
      } else {
        setError("Incorrect password.");
      }
    }
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} gutterBottom align="center" color="text.primary">
        {isSettingPassword ? "Set Password" : "Welcome Back"}
      </Typography>
      <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 4 }}>
        {isSettingPassword ? "Protect your wallet with a password" : "Enter your password to unlock"}
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
        size="large"
        sx={{ mt: 3, borderRadius: 3, height: 48 }}
      >
        {isSettingPassword ? "Create Password" : "Unlock"}
      </Button>
    </Box>
  );
}

// --- Main Auth Component ---

export default function Auth() {
  const context = React.useContext(WalletContext);
  const accountManager = context?.accountManager;

  const [step, setStep] = React.useState(AuthStep.CHOICE);
  const [accountExists, setAccountExists] = React.useState(false);

  React.useEffect(() => {
    if (!accountManager) return;
    const accounts = accountManager.GetAll();
    const hasAccounts = accounts.length > 0;
    setAccountExists(hasAccounts);

    if (hasAccounts && step !== AuthStep.CREATE && step !== AuthStep.IMPORT) {
      setStep(AuthStep.LOGIN);
    }
  }, [accountManager]);

  const handleDone = () => {
    setAccountExists(true);
    setStep(AuthStep.LOGIN);
  };

  return (
    <Box sx={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      bgcolor: '#f3f4f6', // Light gray background
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

          {accountExists ? (
            <LoginIntoWallet storageManager={context?.storageManager} />
          ) : (
            <>
              {step === AuthStep.CHOICE && (
                <Stack spacing={2}>
                  <Typography variant="body1" align="center" color="text.secondary" sx={{ mb: 2 }}>
                    Welcome to the next generation of privacy-first crypto wallets.
                  </Typography>
                  <Button
                    variant="contained"
                    size="large"
                    onClick={() => setStep(AuthStep.CREATE)}
                    sx={{ borderRadius: 3, height: 48 }}
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

              {step === AuthStep.CREATE && (
                <CreateWallet accountManager={accountManager} onDone={handleDone} />
              )}

              {step === AuthStep.IMPORT && (
                <Box>
                  <ImportWallet accountManager={accountManager} onDone={handleDone} />
                  <Button
                    onClick={() => setStep(AuthStep.CHOICE)}
                    color="inherit"
                    sx={{ mt: 2, textTransform: 'none', color: 'text.secondary' }}
                  >
                    Cancel
                  </Button>
                </Box>
              )}
            </>
          )}
        </Paper>
      </Container>
    </Box>
  );
}
