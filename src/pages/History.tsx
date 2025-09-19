import { Close, Lock, LockOpen } from "@mui/icons-material";
import { Avatar, Box, Card, Chip, Divider, Stack, Typography } from "@mui/material";
import { useContext, useEffect, useState } from "react";
import { WalletContext } from "../AppContext";
import { Network, NetworkId, TransactionHistory } from "../backend/Network";
import TokenCache, { TokenCacheItem } from "../backend/TokenCache";
import "./History.css";

function HistoryFilter() {
  return (
    <Stack direction="row" spacing=".5rem" marginY="1rem">
      <Chip variant="outlined" icon={<Close />} label="" />
      <Chip variant="outlined" icon={<Lock />} label="Encrypted" />
      <Chip variant="outlined" icon={<LockOpen />} label="Not Encrypted" />
    </Stack>
  );
}

export default function History() {
  const walletContext = useContext(WalletContext);
  if (!walletContext) {
    throw new Error("WalletContext not found in History");
  }

  const tokenCache = walletContext.tokenCache;
  const activeAccount = walletContext.accountManager.GetActive();
  const network = walletContext.networkProvider.getSepoliaNetwork();
  if (!network) {
    throw new Error("Sepolia network not initialized");
  }
  
  const [transactions, setTransactions] = useState<TransactionHistory[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch transaction history when component mounts or dependencies change
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        const history = await network.getHistory(activeAccount?.GetAddress()!!, tokenCache);
        setTransactions(history);
        setError(null);
      } catch (err) {
        console.error("Failed to fetch transaction history:", err);
        setError("Failed to load transaction history");
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [ network, tokenCache]);

  // Helper function to format transaction description
  const getTransactionDescription = (tx: TransactionHistory, token: TokenCacheItem | undefined): string => {
    const isSent = tx.from.toLowerCase() === activeAccount?.GetAddress()!!.toLowerCase();
    const action = isSent ? "Sent" : "Received";
    const symbol = tx.isNative ? "ETH" : token?.symbol || "Unknown";
    const value = tx.value;
    const counterparty = isSent ? tx.to : tx.from;
    // Shorten address for display (first 6 and last 4 characters)
    const shortAddress = `${counterparty.slice(0, 6)}...${counterparty.slice(-4)}`;
    return `${action} ${value} ${symbol} ${isSent ? "to" : "from"} ${shortAddress}`;
  };

  const getEtherscanTxUrl = (networkId: NetworkId, txHash: string): string => {
    let baseUrl: string;
    switch (networkId) {
      case NetworkId.Ethereum_Sepolia:
        baseUrl = "https://sepolia.etherscan.io";
        break;
      case NetworkId.Ethereum_Mainnet:
        baseUrl = "https://etherscan.io";
        break;
      default:
        baseUrl = "https://etherscan.io"; // Fallback to mainnet
    }
    return `${baseUrl}/tx/${txHash}`;
  };

  // Handler for clicking a transaction
  const handleTransactionClick = (txHash: string) => {
    const url = getEtherscanTxUrl(network.network_id, txHash);
    window.open(url, "_blank");
  };

  return (
    <div className="history">
      <Typography variant="h6">History</Typography>

      <HistoryFilter />

      {loading && <Typography>Loading...</Typography>}
      {error && <Typography color="error">{error}</Typography>}

      {!loading && !error && transactions.length === 0 && (
        <Typography>No transactions found.</Typography>
      )}

      {!loading &&
        transactions.map((tx, index) => {
          // Get token metadata from cache
          const token = tokenCache.hasToken(network.network_id, tx.contractAddress)
            ? tokenCache.getToken(network.network_id, tx.contractAddress)
            : undefined;

          return (
            <Card
              key={index}
              className="history-card"
              onClick={() => handleTransactionClick(tx.hash)} // Add click handler
              variant="outlined">
              <Stack direction="row" alignItems="center">
                <Avatar className="history-avatar" src={token?.logoSrc || "/logos/default.png"} />

                <Stack className="history-text">
                  <Typography fontSize={12} color="grey">
                    {tx.hash}
                  </Typography>
                  <Typography fontSize={14}>
                    {getTransactionDescription(tx, token)}
                  </Typography>
                  <Typography fontSize={12} color="grey">
                    {new Date(tx.timestamp).toLocaleString()}
                  </Typography>
                </Stack>

                <Box className="history-icons">
                  {/* Assuming transactions are not encrypted unless specified */}
                  <LockOpen />
                </Box>
              </Stack>
            </Card>
          );
        })}
    </div>
  );
}