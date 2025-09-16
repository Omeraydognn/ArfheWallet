import * as React from "react";
import { Typography, Box, Button, Grid, Alert, ThemeProvider, Stack, TextField } from "@mui/material";
import Account from "../backend/Account.js";
import { AppContext, WalletContext } from "../AppContext.js";
import { useNavigate } from "react-router";
import AccountManager from "../backend/AccountManager.js";
import "./Auth.css";
import ArfTheme from "../components/ArfTheme.js";
import { useActiveAccount } from "../ActiveAccountProvider.js";
import { Mnemonic } from "ethers";
import StorageManager from "../backend/StorageManager.js";

// Step enum to keep track of "page-like" flow
enum AuthStep {
  CHOICE,
  CREATE,
  IMPORT,
  LOGIN
}

function CreateWallet({ accountManager, onDone }: { accountManager: AccountManager | undefined; onDone: () => void }) {
  const [words, setWords] = React.useState<string[]>([]);
  const [isGenerated, setIsGenerated] = React.useState(false);
  const [index, setIndex] = React.useState<number>(-1);

  const handleGenerate = () => {
    if (!accountManager) return;
    const index = accountManager.CreateAccount();
    if (index < 0 || !accountManager.accounts[index]) return;
    setIndex(index);

    const mnemonicWords = accountManager.accounts[index]?.GetWords();
    setWords(mnemonicWords ?? []);
    setIsGenerated(true);
  };

  const after = () => {
    onDone()
  }

  return (
    <Box className="auth-step">
      <Typography variant="h5" fontWeight={700} gutterBottom>
        Create New Wallet
      </Typography>
      {isGenerated ? (
        <>
          <Typography variant="body1" gutterBottom>
            Write down these words in order. This is the only way to recover your wallet.
          </Typography>
          <Grid container spacing={2} mt={2}>
            {words.map((word, index) => (
              <Grid size={{ xs: 6, sm: 6, md: 4, lg: 3 }} key={index}>
                <NumberedWord index={index} word={word} />
              </Grid>
            ))}
          </Grid>
          <Box mt={3}>
            <Button variant="outlined" fullWidth onClick={after}>
              I GOT IT DOWN
            </Button>
          </Box>
        </>
      ) : (
        <>
          <Typography variant="body1" gutterBottom>
            Click below to generate a new wallet and view your recovery phrase.
          </Typography>
          <Box mt={3}>
            <Button variant="contained" fullWidth onClick={handleGenerate} disabled={!accountManager}>
              GENERATE RECOVERY PHRASE
            </Button>
          </Box>
        </>
      )}
    </Box>
  );
}

function ImportWallet({ accountManager, onDone }: { accountManager: AccountManager | undefined; onDone: () => void }) {
  const [mnemonic, setMnemonic] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  // const { setActiveIndex } = useActiveAccount();

  const handleImport = () => {
    if (!accountManager) {
      setError("AccountManager is not available");
      return;
    }
    if (!Mnemonic.isValidMnemonic(mnemonic)) {
      setError("Invalid recovery phrase");
      return;
    }
    try {
      const index = accountManager.ImportAccount(mnemonic);
      if (index === -1) {
        setError("Failed to import account");
        return;
      }
      // setActiveIndex(index); // Update ActiveAccountProvider
      setError(null);
      console.log("Importing wallet with mnemonic:", mnemonic);
      onDone();
    } catch (e) {
      setError("Error importing account: " + (e as Error).message);
    }
  };

  return (
    <Box className="auth-step">
      <Typography variant="h5" fontWeight={700} gutterBottom>
        Import Existing Wallet
      </Typography>
      <Typography variant="body1" gutterBottom>
        Paste your 12/24-word recovery phrase below to restore your wallet.
      </Typography>

      <TextField
        label="Recovery Phrase"
        placeholder="word1 word2 word3 ..."
        multiline
        fullWidth
        minRows={4}
        value={mnemonic}
        onChange={(e) => setMnemonic(e.target.value)}
        sx={{ mt: 2 }}
      />

      <Box mt={3}>
        <Button variant="contained" fullWidth onClick={handleImport}>
          IMPORT WALLET
        </Button>
      </Box>
    </Box>
  );
}

function LoginIntoWallet({ storageManager }: { storageManager?: StorageManager | undefined }) {
  const navigate = useNavigate();
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isSettingPassword, setIsSettingPassword] = React.useState(false);

  React.useEffect(() => {
    if (!storageManager) return;
    const storedPassword = storageManager.getLocal("passwd");
    if (!storedPassword) {
      setIsSettingPassword(true);
    } else {
      setIsSettingPassword(false);
    }
  }, [storageManager]);

  const handleLogin = () => {
    if (!storageManager) {
      setError("StorageManager is not available");
      return;
    }
    const storedPassword = storageManager.getLocal("passwd");
    if (storedPassword && storedPassword === password) {
      setError(null);
      navigate("/home");
    } else {
      setError("Incorrect password. Please try again.");
      setPassword(""); // Clear the input field
    }
  };

  const handleSetPassword = () => {
    if (!storageManager) {
      setError("StorageManager is not available");
      return;
    }
    if (password.trim() === "") {
      setError("Password cannot be empty");
      return;
    }
    storageManager.setLocal("passwd", password);
    setError(null);
    setIsSettingPassword(false);
    navigate("/home");
  };

  return (
    <Box className="auth-step">
      {isSettingPassword ? (
        <>
          <Typography variant="h5" fontWeight={700} gutterBottom>
            Set Your Wallet Password
          </Typography>
          <Typography variant="body1" gutterBottom>
            Please set a password for your wallet. This will be required to access your wallet in the future.
          </Typography>
          {error && (
            <Box mt={2}>
              <Alert severity="error">{error}</Alert>
            </Box>
          )}
          <TextField
            label="New Password"
            type="password"
            fullWidth
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            sx={{ mt: 2 }}
          />
          <Box mt={3}>
            <Button variant="contained" fullWidth onClick={handleSetPassword}>
              SET PASSWORD
            </Button>
          </Box>
        </>
      ) : (
        <>
          <Typography variant="h5" fontWeight={700} gutterBottom>
            Login to Your Wallet
          </Typography>
          <Typography variant="body1" gutterBottom>
            Enter your password to access your wallet.
          </Typography>
          {error && (
            <Box mt={2}>
              <Alert severity="error">{error}</Alert>
            </Box>
          )}
          <TextField
            label="Password"
            type="password"
            fullWidth
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            sx={{ mt: 2 }}
          />
          <Box mt={3}>
            <Button variant="contained" fullWidth onClick={handleLogin}>
              LOGIN
            </Button>
          </Box>
        </>
      )}
    </Box>
  );
}

export default function Auth() {
  const context = React.useContext<AppContext | undefined>(WalletContext);
  const accountManager = context?.accountManager;
  const navigate = useNavigate();

  const [step, setStep] = React.useState<AuthStep>(AuthStep.CHOICE);
  const [accountExists, setAccountExist] = React.useState(false);

  React.useEffect(() => {
    if (!accountManager) return;

    const accounts = accountManager.GetAll();
    const hasAccounts = accounts.length > 0;
    setAccountExist(hasAccounts);

    // Only switch to LOGIN if not in CREATE or IMPORT and accounts exist
    if (hasAccounts && step !== AuthStep.CREATE && step !== AuthStep.IMPORT) {
      setStep(AuthStep.LOGIN);
      if (accountManager.GetActiveIndex() === -1) {
        // setActiveIndex(0); // Set first account as active if none is set
      }
    }
  }, [accountManager]);

  const handleDone = () => {
    setAccountExist(true);
    setStep(AuthStep.LOGIN); // Move to LOGIN after CREATE or IMPORT
    // navigate("/home");
  };

  return (
    <ThemeProvider theme={ArfTheme}>
      <div className="auth">
        <Box mb={2}>
          {accountManager ? (
            <Alert severity="success">AccountManager is online</Alert>
          ) : (
            <Alert severity="error">AccountManager is offline</Alert>
          )}
        </Box>

        {accountExists ? (
          <LoginIntoWallet storageManager={context?.storageManager} />
        ) : (
          <>
            {step === AuthStep.CHOICE && (
              <Box className="auth-step">
                <Typography variant="h5" fontWeight={700}>
                  You do not have an ArfheWallet created yet.
                </Typography>
                <Typography variant="body1" mt={2}>
                  So you can create one now, or you can import an existing one.
                </Typography>

                <Stack spacing={1} mt={3}>
                  <Button fullWidth variant="contained" color="inherit" onClick={() => setStep(AuthStep.IMPORT)}>
                    IMPORT
                  </Button>
                  <Button fullWidth variant="contained" color="inherit" onClick={() => setStep(AuthStep.CREATE)}>
                    CREATE
                  </Button>
                </Stack>
              </Box>
            )}

            {step === AuthStep.CREATE && (
              <CreateWallet accountManager={accountManager} onDone={handleDone} />
            )}

            {step === AuthStep.IMPORT && (
              <ImportWallet accountManager={accountManager} onDone={handleDone} />
            )}
          </>
        )}
      </div>
    </ThemeProvider>
  );
}

function NumberedWord({ index, word }: { index: number; word: string }) {
  return (
    <Box
      display="flex"
      alignItems="center"
      sx={{
        border: ".1rem solid gray",
        borderRadius: "4px",
        overflow: "hidden",
        width: "100%",
        height: "100%",
      }}
    >
      {/* Number box */}
      <Box
        sx={{
          padding: "2px 4px",
          borderRight: "1px solid gray",
          textAlign: "center",
          minWidth: "20px",
          flexShrink: 0,
        }}
      >
        <Typography fontSize={13}>{index + 1}</Typography>
      </Box>

      {/* Word box */}
      <Box
        sx={{
          padding: "4px 12px",
          flex: 1,
        }}
      >
        <Typography fontSize={13} textAlign="center">
          {word}
        </Typography>
      </Box>
    </Box>
  );
}
