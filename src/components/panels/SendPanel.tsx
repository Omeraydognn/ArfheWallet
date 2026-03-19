import React, { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Box,
  Select,
  MenuItem,
  Stack,
  Button,
  Typography,
  Paper,
  TextField,
  CircularProgress,
  Link,
  Chip,
  IconButton,
  Tooltip,
  Fade,
  Alert,
  alpha,
  useTheme,
} from "@mui/material";
import {
  Send as SendIcon,
  ContentCopy,
  CheckCircle,
  Shield,
  Error as ErrorIcon,
  LockOutlined,
  ArrowForward,
  OpenInNew,
  Visibility,
  VisibilityOff,
  Contacts,
} from "@mui/icons-material";
import { WalletContext } from "../../AppContext.js";
import { useToast } from "../ToastProvider";
import { ContactBookModal } from "../ContactBookModal.js";
import GasSettingsPanel, { GasSettings } from "../GasSettingsPanel.js";
import FheEncryptingOverlay from "../FheEncryptingOverlay.js";
import SuccessAnimation from "../SuccessAnimation.js";
import { isAddress, parseUnits, Interface, formatEther, toUtf8Bytes, hexlify } from "ethers";
import { isDomainName, resolveDomain } from "../../backend/DomainResolver.js";
import { NetworkId, isFheNetwork } from "../../backend/NetworkTypes.js";
import { TransactionSimulator, SimResult } from "../../backend/TransactionSimulator.js";
import { getContractsForNetwork, getExplorerBaseForNetwork, inputCardSx, ctaButtonSx } from "./shared.js";

// --- Send Panel ---
export default function SendPanel() {
  const { t } = useTranslation();
  const context = useContext(WalletContext);
  const activeAccount = context?.accountManager?.GetActive();
  const network = context?.networkProvider?.getActiveNetwork();
  const theme = useTheme();
  const networkId = network?.network_id ?? NetworkId.Unknown;
  const showFhe = isFheNetwork(networkId);

  // 'sendAddress' always holds what the user *typed* (domain or 0x address).
  // 'resolvedAddress' holds the actual 0x address after domain resolution.
  // When it's a plain 0x input, resolvedAddress === sendAddress.
  const [sendAddress, setSendAddress] = useState("");
  const [resolvedAddress, setResolvedAddress] = useState("");

  // Domain resolution state
  const [isDomainInput, setIsDomainInput] = useState(false);
  const [isResolvingDomain, setIsResolvingDomain] = useState(false);
  const [domainResolutionError, setDomainResolutionError] = useState<string | null>(null);
  const [resolvedDomainMethod, setResolvedDomainMethod] = useState<"ens" | "ud" | null>(null);

  const [sendTokenAddress, setSendTokenAddress] = useState("ETH");
  const [sendAmount, setSendAmount] = useState("");
  const [sendMemo, setSendMemo] = useState("");

  // Listen for prefill events from TokenDetail page
  React.useEffect(() => {
    const handlePrefill = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.token) {
        setSendTokenAddress(detail.token);
      }
    };
    window.addEventListener('arf-send-prefill', handlePrefill);
    return () => window.removeEventListener('arf-send-prefill', handlePrefill);
  }, []);
  const [isConfidential, setIsConfidential] = useState(false);
  const [showContacts, setShowContacts] = useState(false);

  // Reset confidential mode when switching to a non-FHE network
  React.useEffect(() => {
    if (!showFhe) setIsConfidential(false);
  }, [showFhe]);

  // Phishing Protection State
  const [isNewAddress, setIsNewAddress] = useState(false);
  const [isCheckingAddress, setIsCheckingAddress] = useState(false);

  // Preview State
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [estimatedGasFee, setEstimatedGasFee] = useState<string | null>(null);
  const [simResult, setSimResult] = useState<SimResult | null>(null);

  const [status, setStatus] = useState<"idle" | "validating" | "signing" | "broadcasting" | "pending" | "success" | "fail">("idle");
  const [feedbackMsg, setFeedbackMsg] = useState("");
  const [txHash, setTxHash] = useState("");

  const [ownedTokens, setOwnedTokens] = useState<{ contractAddress: string; symbol: string; balance: string }[]>([]);
  const [ownedShieldedTokens, setOwnedShieldedTokens] = useState<{ contractAddress: string; symbol: string; balance: string }[]>([]);
  const [tokensLoading, setTokensLoading] = useState(true);

  // ── Domain resolution with 500ms debounce ──────────────────────────
  React.useEffect(() => {
    // Reset state on every keystroke immediately
    setDomainResolutionError(null);
    setResolvedDomainMethod(null);

    const input = sendAddress.trim();

    // Plain 0x address: pass through directly, no resolution needed
    if (isAddress(input)) {
      setIsDomainInput(false);
      setResolvedAddress(input);
      setIsResolvingDomain(false);
      return;
    }

    // Empty or raw partial hex: clear resolved address
    if (!isDomainName(input)) {
      setIsDomainInput(false);
      setResolvedAddress("");
      setIsResolvingDomain(false);
      return;
    }

    // Domain detected — show resolving state and debounce the RPC call
    setIsDomainInput(true);
    setResolvedAddress("");
    setIsResolvingDomain(true);

    const timeoutId = setTimeout(async () => {
      const result = await resolveDomain(input);
      setIsResolvingDomain(false);
      if (result.address) {
        setResolvedAddress(result.address);
        setResolvedDomainMethod(result.method);
        setDomainResolutionError(null);
      } else {
        setResolvedAddress("");
        setDomainResolutionError(result.error);
      }
    }, 500); // 500ms debounce — protects RPC rate limits

    return () => clearTimeout(timeoutId);
  }, [sendAddress]);

  // Address Interaction Check (runs on resolvedAddress, not raw input)
  React.useEffect(() => {
    const checkAddressHistory = async () => {
      if (!isAddress(resolvedAddress) || !activeAccount || !network) {
        setIsNewAddress(false);
        return;
      }

      setIsCheckingAddress(true);
      try {
        const myAddress = activeAccount.GetAddress()?.toLowerCase();
        const targetAddress = resolvedAddress.toLowerCase();

        // Don't warn if sending to self
        if (myAddress === targetAddress) {
          setIsNewAddress(false);
          setIsCheckingAddress(false);
          return;
        }

        // 1. Check local contacts & recent addresses
        const contacts = context?.contactManager?.getContacts() || [];
        const recents = context?.contactManager?.getRecentAddresses() || [];

        const isKnownLocally = contacts.some(c => c.address.toLowerCase() === targetAddress) ||
          recents.some(r => r.address.toLowerCase() === targetAddress);

        if (isKnownLocally) {
          setIsNewAddress(false);
          setIsCheckingAddress(false);
          return;
        }

        // 2. Check absolute history directly via ExplorerService
        if (network.explorerService && typeof (network.explorerService as any).checkInteraction === 'function') {
          const hasInteracted = await (network.explorerService as any).checkInteraction(myAddress!, targetAddress);
          setIsNewAddress(!hasInteracted);
        } else if (network.explorerService) {
          // Fallback to recent graph logic
          const graphData = await network.explorerService.fetchGraphData(myAddress!);
          const hasInteracted = graphData.nodes.some(node => node.id.toLowerCase() === targetAddress);
          setIsNewAddress(!hasInteracted);
        } else {
          // Fallback if explorerService is missing
          setIsNewAddress(false);
        }
      } catch (e) {
        setIsNewAddress(false); // Default to not showing warning on error
      } finally {
        setIsCheckingAddress(false);
      }
    };

    // Debounce the check to avoid spamming the RPC while typing
    const timeoutId = setTimeout(checkAddressHistory, 800);
    return () => clearTimeout(timeoutId);
  }, [resolvedAddress, activeAccount, network, context?.tokenCache]);

  // Load token balances on mount
  React.useEffect(() => {
    const loadBalances = async () => {
      if (!network || !activeAccount) {
        setTokensLoading(false);
        return;
      }
      setTokensLoading(true);
      try {
        const address = activeAccount.GetAddress();
        if (!address) { setTokensLoading(false); return; }
        const networkId = network.network_id;

        const IGNORED_CONTRACTS = [
          "0xbde0a2e375b67c802d4651fecf3b678b1886d15b",
          "0x3e0722a877e52fe755e8bf02372342c63930fd57",
          "0x6ab305c679002c0938c2be3f824fcb8b81be5b70",
          "0x5c3f1fe2c451ccc73443865fec914a595c3d1a7c",
          "0x730bb4ee9ea1cdb0b45c1db01ca67a616d2d3c88",
          "0x23bad885b76c95ec9e2b47663022d552d780200f",
          "0x503e16b7920420277ce1548444dbb30e97f87d40",
          "0x3696a9a8ecd0dbd7111dd15f7837d7f38d83a0c0",
          "0x7890673c207a728ef7d9378c7206030749351dad",
          "0x4b3dd819cfbf1364cabd5c8f9c5c05917d09168c",
          "0x421583e66b21de780b4f94fcecce858c07f3d2d9",
          "0x0125c55244724c1bf1d16b91e046fe7e8a5719e2",
          "0x8d0419e8a259366516fc4fbabebdc013cad8770f",
          "0x2210264a3775d5fbc51b1b73667f5590230ac2bd"
        ];

        const isFheNetwork = networkId === NetworkId.Ethereum_Sepolia || networkId === NetworkId.Arbitrum_Sepolia || networkId === NetworkId.Base_Sepolia;
        const activeContracts = getContractsForNetwork(networkId);

        const WRAPPED_USDC = networkId === NetworkId.Arbitrum_Sepolia
          ? (import.meta.env.VITE_ARB_WRAPPED_USDC_ADDRESS || "").toLowerCase()
          : networkId === NetworkId.Base_Sepolia
            ? (import.meta.env.VITE_BASE_WRAPPED_USDC_ADDRESS || "").toLowerCase()
            : (import.meta.env.VITE_WRAPPED_USDC_ADDRESS || "").toLowerCase();
        const WRAPPED_ETH = networkId === NetworkId.Arbitrum_Sepolia
          ? (import.meta.env.VITE_ARB_WRAPPED_ETH_ADDRESS || "").toLowerCase()
          : networkId === NetworkId.Base_Sepolia
            ? (import.meta.env.VITE_BASE_WRAPPED_ETH_ADDRESS || "").toLowerCase()
            : (import.meta.env.VITE_WRAPPED_ETH_ADDRESS || "").toLowerCase();
        const shieldedAddresses = [WRAPPED_USDC, WRAPPED_ETH].filter(Boolean);
        const REAL_WETH = activeContracts["ETH"]?.public?.toLowerCase() || "";

        const tokenBalances = await network.getTokenBalances(context?.tokenCache, address);
        const seenSymbols = new Set<string>();
        const publicTokensWithBalance = tokenBalances
          .filter(tb => {
            if (parseFloat(tb.tokenBalance) <= 0) return false;
            const addr = tb.contractAddress.toLowerCase();
            if (IGNORED_CONTRACTS.includes(addr)) return false;
            if (shieldedAddresses.includes(addr)) return false;

            // Allow native ETH immediately
            if (tb.isNative) return true;

            const meta = context?.tokenCache?.getToken(networkId, tb.contractAddress);

            // Allow our recognized public WETH unconditionally, by hardcoded address
            if (addr === REAL_WETH) return true;

            const symbol = meta?.symbol ?? "";

            // Ignore other random testnet WETHs that aren't the primary one
            if (symbol === "WETH" && addr !== REAL_WETH) return false;

            // Keep track of unique symbols so we don't list duplicates if they have the same symbol
            if (symbol) {
              if (seenSymbols.has(symbol)) return false;
              seenSymbols.add(symbol);
            }

            return true;
          })
          .map(tb => {
            const addr = tb.contractAddress.toLowerCase();
            const meta = context?.tokenCache?.getToken(networkId, tb.contractAddress);
            let symbol = meta?.symbol;

            // Inject symbol manually for known assets if meta is missing
            if (!symbol) {
              if (tb.isNative) symbol = "ETH";
              else if (addr === REAL_WETH) symbol = "WETH";
              else symbol = "???";
            }

            return {
              contractAddress: tb.contractAddress,
              symbol: symbol,
              balance: tb.tokenBalance
            };
          });
        setOwnedTokens(publicTokensWithBalance);

        // Fetch shielded token balances (on FHE-enabled networks)
        if (isFheNetwork && (WRAPPED_USDC || WRAPPED_ETH)) {
          const shielded: { contractAddress: string; symbol: string; balance: string }[] = [];

          if (WRAPPED_ETH) {
            try {
              const bal = await network.getShieldedBalance(WRAPPED_ETH, address, activeAccount);
              if (bal && parseFloat(bal) > 0) {
                shielded.push({ contractAddress: WRAPPED_ETH, symbol: "cETH", balance: bal });
              }
            } catch (e) { /* silenced */ }
          }
          if (WRAPPED_USDC) {
            try {
              const bal = await network.getShieldedBalance(WRAPPED_USDC, address, activeAccount);
              if (bal && parseFloat(bal) > 0) {
                shielded.push({ contractAddress: WRAPPED_USDC, symbol: "cUSDC", balance: bal });
              }
            } catch (e) { /* silenced */ }
          }
          setOwnedShieldedTokens(shielded);
        }
      } catch (e) {
      } finally {
        setTokensLoading(false);
      }
    };
    loadBalances();
  }, [network, activeAccount]);

  const [advancedGas, setAdvancedGas] = useState<GasSettings>({ preset: "standard", maxFeePerGas: 30, maxPriorityFee: 1.5, gasLimit: 21000 });

  const handleSend = async () => {
    if (!activeAccount || !network) return;

    setFeedbackMsg("");
    setTxHash("");
    setStatus("validating");

    try {
      if (!isAddress(resolvedAddress)) throw new Error(isDomainInput ? t("send.domainNotResolved") : t("send.invalidRecipient"));
      if (!sendAmount || parseFloat(sendAmount) <= 0) throw new Error(t("send.invalidAmount"));

      setStatus("signing");
      setFeedbackMsg(t("send.signPrompt"));

      let hash = "";

      // Calculate Gas based on Advanced Gas Settings Panel
      let gasMultiplier = 1.0;
      if (advancedGas.preset === "fast") gasMultiplier = 1.3;
      if (advancedGas.preset === "slow") gasMultiplier = 0.9;

      if (isConfidential) {
        const activeContracts = getContractsForNetwork(network.network_id);
        let tokenAddress = "";
        let decimals = 18;

        if (sendTokenAddress.toLowerCase() === activeContracts["USDC"]?.shielded.toLowerCase()) {
          tokenAddress = sendTokenAddress;
          decimals = 6;
        } else if (sendTokenAddress.toLowerCase() === activeContracts["USDC"]?.public.toLowerCase()) {
          tokenAddress = activeContracts["USDC"]?.shielded;
          decimals = 6;
        } else if (sendTokenAddress.toLowerCase() === activeContracts["ETH"]?.shielded.toLowerCase()) {
          tokenAddress = sendTokenAddress;
          decimals = 18;
        } else if (sendTokenAddress.toLowerCase() === activeContracts["ETH"]?.public.toLowerCase()) {
          tokenAddress = activeContracts["ETH"]?.shielded;
          decimals = 18;
        } else if (sendTokenAddress === "ETH") {
          tokenAddress = activeContracts["ETH"]?.shielded;
          decimals = 18;
        } else {
          throw new Error("Confidential transfer only supports cUSDC and cETH");
        }

        if (tokenAddress === "0x0000000000000000000000000000000000000000") {
          throw new Error("Token wrapper not deployed yet");
        }

        setFeedbackMsg(t("send.encryptingFhe"));
        hash = await network.transferConfidential(activeAccount, tokenAddress, resolvedAddress, sendAmount);

      } else {
        // --- 1. Transaction Simulation & Preview Phase ---
        if (!isPreviewMode) {
          try {
            const { JsonRpcProvider } = await import("ethers");
            const provider = new JsonRpcProvider(network.rpc_url);
            const myAddress = activeAccount.GetAddress();
            if (!myAddress) throw new Error("Account address not available");

            const simulator = new TransactionSimulator(provider);
            let estGas = 0n;

            if (sendTokenAddress === "ETH") {
              const amountWei = parseUnits(sendAmount, 18);
              // 1a. Simulate Native Transfer
              const simOutput = await simulator.simulateTransaction({
                from: myAddress,
                to: resolvedAddress,
                value: amountWei
              });
              if (simOutput.error) throw new Error(simOutput.error);
              setSimResult(simOutput);

              estGas = await provider.estimateGas({
                from: myAddress,
                to: resolvedAddress,
                value: amountWei
              });
            } else {
              const iface = new Interface(["function transfer(address to, uint256 amount)"]);
              const tokenMeta = context?.tokenCache?.getToken(network.network_id, sendTokenAddress);
              const decimals = tokenMeta?.decimals ?? 18;
              const amountWei = parseUnits(sendAmount, decimals);
              const data = iface.encodeFunctionData("transfer", [resolvedAddress, amountWei]);

              // Simulate ERC20 Transfer
              let finalData = data;
              if (sendMemo) {
                const memoHex = hexlify(toUtf8Bytes(sendMemo));
                finalData = finalData + memoHex.slice(2);
              }

              // 1b. Simulate ERC20 Transfer
              const simOutput = await simulator.simulateTransaction({
                from: myAddress,
                to: sendTokenAddress,
                data: finalData
              });

              // Resolve token symbol for UI preview
              if (simOutput.balanceChanges.length > 0 && tokenMeta) {
                simOutput.balanceChanges[0].symbol = tokenMeta.symbol;
                simOutput.balanceChanges[0].decimals = tokenMeta.decimals;
              }

              // Enrich any remaining unresolved balance changes with on-chain metadata
              await simulator.enrichBalanceChanges(simOutput);

              if (simOutput.error) throw new Error(simOutput.error);
              setSimResult(simOutput);

              estGas = await provider.estimateGas({
                from: myAddress,
                to: sendTokenAddress,
                data: finalData
              });
            }

            // Get live fee data — use advanced gas panel values if in custom mode
            const feeData = await provider.getFeeData();
            const baseGasPrice = advancedGas.preset === "custom"
              ? BigInt(Math.floor(advancedGas.maxFeePerGas * 1e9))
              : (feeData.gasPrice || feeData.maxFeePerGas || parseUnits("1", "gwei"));

            // Calculate estimated fee using the selected multiplier
            const estimatedFeeWei = advancedGas.preset === "custom"
              ? estGas * baseGasPrice
              : (estGas * baseGasPrice * BigInt(Math.floor(gasMultiplier * 100))) / 100n;

            setEstimatedGasFee(parseFloat(formatEther(estimatedFeeWei)).toFixed(6) + " ETH");
            setIsPreviewMode(true);
            setStatus("idle");
            return; // Wait for the "Confirm & Send" click

          } catch (simError) {
            const simErr = simError as { info?: { error?: { message?: string } }; reason?: string; message?: string };
            let reason = simErr?.info?.error?.message || simErr?.reason || simErr?.message || "Contract logic reverted or insufficient funds.";

            if (reason.includes("insufficient funds for gas * price + value") || reason.includes("insufficient funds")) {
              reason = "Yetersiz Bakiye: Ağ ücretlerini (gas fee) karşılamak için cüzdanınızda yeterli ETH bulunmuyor.";
            } else if (reason.includes("execution reverted")) {
              reason = "İşlem Reddedildi (Reverted): Akıllı sözleşme veya alıcı bu işlemi kabul etmiyor.";
            }

            throw new Error(`⚠️ Transaction Simulation Failed: ${reason} - İşlem iptal edildi.`);
          }
        }

        // --- 2. Actual Send Phase (Only triggered if isPreviewMode is true or skipped) ---
        let memoHex = sendMemo ? hexlify(toUtf8Bytes(sendMemo)) : "0x";

        if (sendTokenAddress === "ETH") {
          // Only send the data field if memo isn't empty (or "0x" logic will pass it as empty data)
          const txOpts: { to: string; value: string; gasMultiplier: number; data?: string } = { to: resolvedAddress, value: sendAmount, gasMultiplier: gasMultiplier };
          if (memoHex !== "0x") txOpts.data = memoHex;
          hash = await network.sendTransaction(activeAccount, txOpts);
        } else {
          const iface = new Interface(["function transfer(address to, uint256 amount)"]);
          const tokenMeta = context?.tokenCache?.getToken(network.network_id, sendTokenAddress);
          const decimals = tokenMeta?.decimals ?? 18;
          const amountWei = parseUnits(sendAmount, decimals);
          let data = iface.encodeFunctionData("transfer", [resolvedAddress, amountWei]);

          if (memoHex !== "0x") {
            data = data + memoHex.slice(2);
          }
          hash = await network.sendTransaction(activeAccount, { to: sendTokenAddress, value: "0", data, gasMultiplier: gasMultiplier });
        }
      }

      setTxHash(hash);
      setStatus("pending");
      setFeedbackMsg(t("send.broadcasted"));
      await network.waitForTransaction(hash);
      setStatus("success");
      setFeedbackMsg(t("common.success"));

      // Record recipient as recent address
      try {
        context?.contactManager?.addRecentAddress(resolvedAddress);
      } catch (_) { /* non-critical */ }

    } catch (err) {
      setStatus("fail");
      setFeedbackMsg(err instanceof Error ? err.message : t("common.error"));
    }
  };

  const isLoading = ["validating", "signing", "broadcasting", "pending"].includes(status);
  const displayTokens = isConfidential ? ownedShieldedTokens : ownedTokens;

  return (
    <Box sx={{ position: 'relative' }}>
      {/* FHE Encryption Overlay — shown during signing/encrypting */}
      <FheEncryptingOverlay
        visible={isConfidential && ["signing", "broadcasting", "pending"].includes(status)}
        message={status === "signing"
          ? t("send.encryptingFhe")
          : status === "broadcasting"
            ? t("send.broadcastingEncrypted")
            : t("send.waitingConfirmation")
        }
      />

      {/* Header row with confidential toggle */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <SendIcon sx={{ fontSize: 16, color: 'primary.main' }} />
          <Typography variant="subtitle2" fontWeight={700}>
            {t("send.title")}
          </Typography>
        </Stack>
        {showFhe && (
          <Tooltip title={isConfidential ? t("send.encryptedViaFhe") : t("send.enableEncrypted")} arrow>
            <Button
              size="small"
              variant={isConfidential ? "contained" : "outlined"}
              color={isConfidential ? "secondary" : "inherit"}
              onClick={() => setIsConfidential(!isConfidential)}
              startIcon={isConfidential ? <VisibilityOff sx={{ fontSize: 16 }} /> : <Visibility sx={{ fontSize: 16 }} />}
              sx={{
                borderRadius: 2,
                px: 1.5,
                py: 0.5,
                fontSize: '0.75rem',
                fontWeight: 600,
                minWidth: 'auto',
                ...(isConfidential && {
                  boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                })
              }}
            >
              {isConfidential ? t("send.confidential") : t("send.public")}
            </Button>
          </Tooltip>
        )}
      </Stack>

      {/* Confidential mode hint + Shield shortcut */}
      {isConfidential && (
        <Fade in>
          <Paper elevation={0} sx={{
            mb: 1,
            p: 1,
            borderRadius: 2,
            bgcolor: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid',
            borderColor: 'rgba(16, 185, 129, 0.2)',
          }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.4, flex: 1 }}>
                {t("send.confidentialHint")}
              </Typography>
              <Button
                size="small"
                variant="text"
                color="secondary"
                onClick={() => {
                  // Open Shield panel in a new drawer
                  window.dispatchEvent(new CustomEvent('open-shield-panel'));
                }}
                sx={{ fontSize: '0.65rem', fontWeight: 700, minWidth: 'auto', ml: 1, whiteSpace: 'nowrap' }}
              >
                Shield →
              </Button>
            </Stack>
          </Paper>
        </Fade>
      )}

      {/* Success State */}
      {status === 'success' ? (
        <Stack spacing={1.5} alignItems="center" sx={{ py: 3 }}>
          <SuccessAnimation label={t("send.transferComplete")} size={80} />
          {txHash && (
            <Link
              href={`${getExplorerBaseForNetwork(network)}/tx/${txHash}`}
              target="_blank" rel="noopener"
              underline="hover"
              sx={{ fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5 }}
            >
              View on Explorer <OpenInNew sx={{ fontSize: 14 }} />
            </Link>
          )}
          <Button
            variant="outlined"
            onClick={() => { setStatus('idle'); setSendAmount(""); setSendAddress(""); setTxHash(""); setSimResult(null); setIsPreviewMode(false); }}
            sx={{ borderRadius: 3, fontWeight: 600 }}
          >
            {t("send.newTransfer")}
          </Button>
        </Stack>
      ) : isPreviewMode ? (
        <Stack spacing={2.5}>
          {/* ── Risk Level Banner ── */}
          {simResult && simResult.riskLevel !== "LOW" && (
            <Fade in>
              <Paper elevation={0} sx={{
                p: 2, borderRadius: 3,
                bgcolor: simResult.riskLevel === "CRITICAL" ? 'rgba(220, 38, 38, 0.12)'
                  : simResult.riskLevel === "HIGH" ? 'rgba(245, 158, 11, 0.12)'
                    : 'rgba(59, 130, 246, 0.08)',
                border: '1px solid',
                borderColor: simResult.riskLevel === "CRITICAL" ? 'error.main'
                  : simResult.riskLevel === "HIGH" ? 'warning.main'
                    : 'info.main',
              }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                  {simResult.riskLevel === "CRITICAL" ? (
                    <ErrorIcon sx={{ color: 'error.main', fontSize: 20 }} />
                  ) : simResult.riskLevel === "HIGH" ? (
                    <ErrorIcon sx={{ color: 'warning.main', fontSize: 20 }} />
                  ) : (
                    <Shield sx={{ color: 'info.main', fontSize: 20 }} />
                  )}
                  <Chip
                    label={
                      simResult.riskLevel === "CRITICAL" ? t("send.riskCritical") :
                        simResult.riskLevel === "HIGH" ? t("send.riskHigh") : t("send.riskMedium")
                    }
                    size="small"
                    sx={{
                      fontWeight: 800,
                      fontSize: '0.65rem',
                      height: 22,
                      bgcolor: simResult.riskLevel === "CRITICAL" ? 'error.main'
                        : simResult.riskLevel === "HIGH" ? 'warning.main'
                          : 'info.main',
                      color: '#fff',
                    }}
                  />
                </Stack>
                <Stack spacing={0.5}>
                  {simResult.warnings.map((w, i) => (
                    <Typography key={i} variant="caption" sx={{
                      display: 'block',
                      lineHeight: 1.5,
                      color: simResult.riskLevel === "CRITICAL" ? 'error.main'
                        : simResult.riskLevel === "HIGH" ? 'warning.dark'
                          : 'text.secondary',
                      fontWeight: 500,
                    }}>
                      {w}
                    </Typography>
                  ))}
                </Stack>
              </Paper>
            </Fade>
          )}

          {/* ── Safe Transaction Badge (LOW risk) ── */}
          {simResult && simResult.riskLevel === "LOW" && (
            <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1 }}>
              <CheckCircle sx={{ color: 'success.main', fontSize: 18 }} />
              <Typography variant="caption" color="success.main" fontWeight={600}>
                {t("send.simSuccess")}
              </Typography>
            </Stack>
          )}

          {/* ── LOW risk warnings (informational) ── */}
          {simResult && simResult.riskLevel === "LOW" && simResult.warnings.length > 0 && (
            <Paper elevation={0} sx={{ p: 1.5, borderRadius: 2.5, bgcolor: 'rgba(16, 185, 129, 0.06)', border: '1px solid', borderColor: 'rgba(16, 185, 129, 0.2)' }}>
              {simResult.warnings.map((w, i) => (
                <Typography key={i} variant="caption" sx={{ display: 'block', lineHeight: 1.5, color: 'text.secondary' }}>
                  {w}
                </Typography>
              ))}
            </Paper>
          )}

          <Box sx={{ p: 2, borderRadius: 4, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: 'block', mb: 1.5 }}>
              {t("send.transactionPreview")}
            </Typography>

            <Stack spacing={1.5}>
              <Box>
                <Typography variant="caption" color="text.secondary">{t("send.recipient")}</Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{sendAddress}</Typography>
                {simResult?.isContractInteraction && (
                  <Chip label={t("send.smartContract")} size="small" sx={{ mt: 0.5, height: 18, fontSize: '0.6rem', fontWeight: 700, bgcolor: 'rgba(23, 23, 23, 0.1)', color: 'primary.main' }} />
                )}
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">{t("send.assetOut")}</Typography>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography variant="h6" fontWeight={700} color="error.main">
                    - {sendAmount}
                  </Typography>
                  <Typography variant="subtitle2" fontWeight={700}>
                    {sendTokenAddress === "ETH" ? "ETH" : (context?.tokenCache?.getToken(network?.network_id!, sendTokenAddress)?.symbol || "Token")}
                  </Typography>
                </Stack>
              </Box>

              {/* Balance Changes from simulation */}
              {simResult && simResult.balanceChanges.length > 0 && simResult.balanceChanges.some(bc => bc.type === "FHE_ENCRYPTED") && (
                <Box>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <LockOutlined sx={{ fontSize: 14, color: '#10b981' }} />
                    <Typography variant="caption" color="text.secondary">{t("send.fheEncryptedTransfer")}</Typography>
                  </Stack>
                  <Typography variant="body2" sx={{ color: '#10b981', fontWeight: 600, mt: 0.5 }}>
                    {t("send.fheEncryptedNote")}
                  </Typography>
                </Box>
              )}

              <Box>
                <Typography variant="caption" color="text.secondary">{t("send.estimatedNetworkFee")}</Typography>
                <Typography variant="body2" fontWeight={600}>
                  {estimatedGasFee || t("send.calculating")}
                </Typography>
              </Box>

              {sendMemo && (
                <Box>
                  <Typography variant="caption" color="text.secondary">{t("send.transactionNote")}</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', bgcolor: 'action.hover', p: 1, borderRadius: 2 }}>
                    {sendMemo}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    Hex: {hexlify(toUtf8Bytes(sendMemo))}
                  </Typography>
                </Box>
              )}
            </Stack>
          </Box>

          {/* Error */}
          {status === 'fail' && (
            <Fade in>
              <Paper elevation={0} sx={{
                p: 1.5, borderRadius: 2.5,
                bgcolor: 'error.main', color: '#fff',
              }}>
                <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.8rem' }}>
                  {feedbackMsg}
                </Typography>
              </Paper>
            </Fade>
          )}

          {/* Loading */}
          {isLoading && status !== 'fail' && (
            <Fade in>
              <Paper elevation={0} sx={{
                p: 1.5, borderRadius: 2.5,
                bgcolor: 'primary.main', color: '#fff',
              }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <CircularProgress size={16} color="inherit" />
                  <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.8rem' }}>
                    {feedbackMsg || t("send.processing")}
                  </Typography>
                </Stack>
              </Paper>
            </Fade>
          )}

          <Stack direction="row" spacing={2}>
            <Button
              variant="outlined"
              fullWidth
              size="large"
              onClick={() => { setIsPreviewMode(false); setSimResult(null); setStatus('idle'); }}
              disabled={isLoading}
              sx={{ borderRadius: 3, fontWeight: 700 }}
            >
              {t("common.back")}
            </Button>
            <Button
              variant="contained"
              size="large"
              fullWidth
              onClick={handleSend}
              disabled={isLoading || (simResult?.riskLevel === "CRITICAL")}
              color={simResult?.riskLevel === "HIGH" ? "warning" : "primary"}
              sx={{ borderRadius: 3, fontWeight: 700 }}
              endIcon={isLoading ? <CircularProgress size={18} color="inherit" /> : <ArrowForward />}
            >
              {isLoading ? t("send.sending") :
                simResult?.riskLevel === "CRITICAL" ? t("send.blockedCritical") :
                  simResult?.riskLevel === "HIGH" ? t("send.confirmAnyway") :
                    t("send.confirmSend")}
            </Button>
          </Stack>
        </Stack>
      ) : (
        <Stack spacing={1.5}>
          {/* Recipient */}
          <Paper elevation={0} sx={inputCardSx}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="caption" color="text.secondary" fontWeight={600}>{t("send.recipient")}</Typography>
              <IconButton size="small" sx={{ p: 0, color: 'text.secondary', '&:hover': { color: 'primary.main' } }} onClick={() => setShowContacts(true)} aria-label="Open contacts">
                <Contacts fontSize="small" />
              </IconButton>
            </Stack>
            <TextField
              variant="standard"
              placeholder={t("send.recipientPlaceholder")}
              fullWidth
              value={sendAddress}
              onChange={(e) => setSendAddress(e.target.value)}
              disabled={isLoading}
              InputProps={{
                disableUnderline: true,
                style: { fontSize: '0.95rem', fontWeight: 500, fontFamily: 'monospace', marginTop: 4 }
              }}
            />
          </Paper>

          {/* Domain Resolution Feedback */}
          {isDomainInput && isResolvingDomain && (
            <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1 }}>
              <CircularProgress size={12} sx={{ color: 'primary.main' }} />
              <Typography variant="caption" color="text.secondary">{t("send.resolvingDomain")}</Typography>
            </Stack>
          )}

          {isDomainInput && !isResolvingDomain && resolvedAddress && (
            <Fade in>
              <Alert
                severity="success"
                sx={{
                  borderRadius: 3, border: '1px solid', borderColor: 'success.main',
                  bgcolor: alpha(theme.palette.success.main, 0.05),
                  '& .MuiAlert-message': { p: 0.5 }
                }}
              >
                <Typography variant="caption" fontWeight={700} display="block" color="success.dark">
                  ✓ {resolvedDomainMethod === 'ens' ? t("send.resolvedViaEns") : t("send.resolvedViaUd")}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {resolvedAddress}
                </Typography>
              </Alert>
            </Fade>
          )}

          {isDomainInput && !isResolvingDomain && domainResolutionError && (
            <Fade in>
              <Alert severity="error" sx={{ borderRadius: 3, '& .MuiAlert-message': { p: 0.5 } }}>
                <Typography variant="caption" fontWeight={700} display="block">{t("send.couldNotResolve")}</Typography>
                <Typography variant="caption" color="text.secondary">{domainResolutionError}</Typography>
              </Alert>
            </Fade>
          )}

          {/* Phishing Protection Warning */}
          {isAddress(resolvedAddress) && isCheckingAddress && (
            <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1 }}>
              <CircularProgress size={12} sx={{ color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary">{t("send.verifyingAddress")}</Typography>
            </Stack>
          )}

          {isAddress(resolvedAddress) && !isCheckingAddress && isNewAddress && (
            <Fade in>
              <Alert
                severity="warning"
                icon={<Shield fontSize="inherit" />}
                sx={{
                  borderRadius: 3,
                  border: '1px solid',
                  borderColor: 'warning.main',
                  bgcolor: alpha(theme.palette.warning.main, 0.05),
                  '& .MuiAlert-message': { p: 0.5 }
                }}
              >
                <Typography variant="caption" fontWeight={700} display="block" color="warning.dark">
                  {t("send.firstTimeInteraction")}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t("send.firstTimeWarning")}
                </Typography>
              </Alert>
            </Fade>
          )}

          {/* Asset + Amount row */}
          <Stack direction="row" spacing={1.5}>
            <Paper elevation={0} sx={{ ...inputCardSx, flex: 1.2 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>{t("send.asset")}</Typography>
              <Select
                value={sendTokenAddress}
                onChange={(e) => setSendTokenAddress(e.target.value)}
                variant="standard"
                disableUnderline
                fullWidth
                disabled={isLoading || tokensLoading}
                sx={{ fontWeight: 600, fontSize: '0.95rem', mt: 0.5 }}
              >
                {tokensLoading ? (
                  <MenuItem value="ETH" disabled>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <CircularProgress size={14} />
                      <span>{t("common.loading")}</span>
                    </Stack>
                  </MenuItem>
                ) : displayTokens.length === 0 ? (
                  <MenuItem value="ETH" disabled>
                    {isConfidential ? t("send.noShieldedTokens") : t("send.noTokensFound")}
                  </MenuItem>
                ) : (
                  displayTokens.map(t => (
                    <MenuItem key={t.contractAddress} value={t.contractAddress}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ width: '100%' }}>
                        <Typography variant="body2" fontWeight={600}>{t.symbol}</Typography>
                        <Typography variant="caption" color="text.secondary">{parseFloat(t.balance).toFixed(4)}</Typography>
                      </Stack>
                    </MenuItem>
                  ))
                )}
              </Select>
            </Paper>

            <Paper elevation={0} sx={{ ...inputCardSx, flex: 1 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>{t("send.amount")}</Typography>
              <TextField
                variant="standard"
                placeholder="0.00"
                type="number"
                fullWidth
                value={sendAmount}
                onChange={(e) => setSendAmount(e.target.value)}
                disabled={isLoading}
                InputProps={{
                  disableUnderline: true,
                  style: { fontSize: '1rem', fontWeight: 700, marginTop: 4 }
                }}
              />
            </Paper>
          </Stack>

          {/* Advanced Gas Settings Panel (EIP-1559) */}
          {!isConfidential && (
            <Box sx={{ mt: 0.5 }}>
              <GasSettingsPanel
                compact
                initialPreset="standard"
                onChange={(settings) => setAdvancedGas(settings)}
              />
            </Box>
          )}

          {/* Error */}
          {status === 'fail' && (
            <Fade in>
              <Paper elevation={0} sx={{
                p: 1.5, borderRadius: 2.5,
                bgcolor: 'error.main', color: '#fff',
              }}>
                <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.8rem' }}>
                  {feedbackMsg}
                </Typography>
              </Paper>
            </Fade>
          )}

          {/* Loading feedback */}
          {isLoading && status !== 'fail' && (
            <Fade in>
              <Paper elevation={0} sx={{
                p: 1.5, borderRadius: 2.5,
                bgcolor: 'primary.main', color: '#fff',
              }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <CircularProgress size={16} color="inherit" />
                  <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.8rem' }}>
                    {feedbackMsg || t("send.processing")}
                  </Typography>
                </Stack>
              </Paper>
            </Fade>
          )}

          {/* CTA */}
          <Button
            variant="contained"
            size="large"
            fullWidth
            onClick={handleSend}
            disabled={isLoading || !resolvedAddress || !sendAmount || isResolvingDomain}
            color={isConfidential ? "secondary" : "primary"}
            sx={{
              ...ctaButtonSx,
              ...(isConfidential && {
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
              })
            }}
            endIcon={isLoading ? <CircularProgress size={18} color="inherit" /> : <ArrowForward />}
          >
            {isLoading
              ? t("send.processing")
              : (isConfidential ? t("send.sendConfidential") : t("send.sendTransaction"))
            }
          </Button>
        </Stack>
      )}

      {/* Contact Book Modal */}
      <ContactBookModal
        open={showContacts}
        onClose={() => setShowContacts(false)}
        onSelect={(addr) => setSendAddress(addr)}
      />
    </Box>
  );
}
