import React from "react";
import { Typography, Box, Button, Grid, Alert, ThemeProvider, Stack, TextField } from "@mui/material";
import Account from "../backend/Account.js";
import { AppContext, WalletContext } from "../AppContext.js";
import { useNavigate } from "react-router";
import AccountManager from "../backend/AccountManager.js";
import "./Auth.css";
import ArfTheme from "../components/ArfTheme.js";

// Step enum to keep track of "page-like" flow
enum AuthStep {
  CHOICE,
  CREATE,
  IMPORT,
  LOGIN
}

function CreateWallet({ accountManager, onDone }: { accountManager: AccountManager | undefined; onDone: () => void }) {
  const [words, setWords] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!accountManager) return;
    const index = accountManager.CreateAccount();
    if (index < 0 || !accountManager.accounts[index]) return;

    const mnemonicWords = accountManager.accounts[index]?.GetWords();
    setWords(mnemonicWords ?? []);
  }, [accountManager]);

  return (
    <Box className="auth-step">
      <Typography variant="h5" fontWeight={700} gutterBottom>
        Your Recovery Phrase
      </Typography>
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
        <Button variant="outlined" fullWidth onClick={onDone}>
          I GOT IT DOWN
        </Button>
      </Box>
    </Box>
  );
}

function ImportWallet({ accountManager, onDone }: { accountManager: AccountManager | undefined; onDone: () => void }) {
  const [mnemonic, setMnemonic] = React.useState("");

  const handleImport = () => {
    if (!accountManager) return;
    // TODO: verify mnemonic and import wallet into accountManager

    const account = accountManager.ImportAccount(mnemonic);
    
    console.log("Importing wallet with mnemonic:", mnemonic);
    onDone();
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

function LoginIntoWallet() {
  return (
    <Typography variant="h5" fontWeight={700}>
      Login or DIE!
    </Typography>
  );
}

export default function Auth() {
  const context = React.useContext<AppContext | undefined>(WalletContext);
  const accountManager = context?.accountManager;
  const navigate = useNavigate();

  const [step, setStep] = React.useState<AuthStep>(AuthStep.CHOICE);
  const [accountExists, setAccountExist] = React.useState(false);

  // TODO: get the private key from localStorage
  // and set accountExists accordingly

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
          <LoginIntoWallet />
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
              <CreateWallet accountManager={accountManager} onDone={() => navigate("/home")} />
            )}

            {step === AuthStep.IMPORT && (
              <ImportWallet accountManager={accountManager} onDone={() => navigate("/home")} />
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
