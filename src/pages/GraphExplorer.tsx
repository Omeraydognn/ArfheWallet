import { useState, useEffect, useRef, useContext } from 'react';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import {
  Paper,
  Typography,
  Box,
  IconButton,
  Slide,
  CircularProgress,
  TextField,
  InputAdornment,
  Chip,
  Grid,
  Button,
  useTheme,
  alpha
} from '@mui/material';
import { ZoomIn, ZoomOut, Search, Clear, Hub, YoutubeSearchedFor, SwapHoriz } from '@mui/icons-material';
import { WalletContext } from "../AppContext.js";
import { ActiveAccountContext } from "../ActiveAccountProvider.js";
import { GraphNode, GraphEdge, ExplorerService } from "../backend/ExplorerService.js";
import { NetworkId } from "../backend/NetworkTypes.js";
import { isAddress } from 'ethers';
import { useTranslation } from 'react-i18next';

// Register layout
cytoscape.use(fcose);

const GraphExplorer = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const theme = useTheme();
  const { t } = useTranslation();
  const isDark = theme.palette.mode === 'dark';

  const wallet_context = useContext(WalletContext);
  const active_context = useContext(ActiveAccountContext);
  const net = wallet_context?.networkProvider?.getActiveNetwork();
  const myAddress = active_context?.activeAccount?.GetAddress();

  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);
  const [error, setError] = useState("");

  // Search State
  const [targetAddress, setTargetAddress] = useState<string | undefined>(undefined);
  const [searchInput, setSearchInput] = useState("");

  // Data State
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[], edges: GraphEdge[] }>({ nodes: [], edges: [] });

  // Initialize Target Address
  useEffect(() => {
    if (myAddress && !targetAddress) {
      setTargetAddress(myAddress);
      setSearchInput(myAddress);
    }
  }, [myAddress]);

  // Fetch Data when Target Changes
  useEffect(() => {
    const fetchData = async () => {
      if (!targetAddress || !isAddress(targetAddress) || !net) return;

      setLoading(true);
      setError("");
      try {
        let data: { nodes: GraphNode[], edges: GraphEdge[] };
        if (net.explorerService) {
          // Alchemy-backed network
          data = await net.explorerService.fetchGraphData(targetAddress);
        } else if (net.rpc_url) {
          // Custom / non-Alchemy network: use eth_getLogs fallback
          data = await ExplorerService.fetchGraphDataFromRpc(net.rpc_url, targetAddress);
        } else {
          data = { nodes: [], edges: [] };
        }
        setGraphData(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [net, targetAddress]);

  const handleSearch = () => {
    const query = searchInput.trim();
    if (isAddress(query)) {
      setTargetAddress(query);
      setError("");
    } else {
      setError(t("graph.invalidAddress"));
    }
  };

  // Helper: Node Color (Light Mode friendly)
  const getNodeColor = (n: GraphNode) => {
    if (n.id.toLowerCase() === targetAddress?.toLowerCase()) return '#2563eb'; // Center: Blue
    if (n.type === 'exchange') return '#ea580c'; // Exchange: Orange
    return theme.palette.mode === 'dark' ? '#93c5fd' : '#1e40af'; // Cool 300 (Dark) / Cool 700 (Light)
  };

  // Helper: Edge Color (Green for Incoming, Red for Outgoing)
  const getEdgeStyle = (edge: GraphEdge) => {
    const isIncoming = edge.target.toLowerCase() === targetAddress?.toLowerCase();

    return {
      color: isIncoming ? '#059669' : '#dc2626', // Green 600 vs Red 600
      width: Math.min(Math.max(2, Math.sqrt(edge.value)), 8) // Thicker for better clicking
    };
  };

  // Initialize Graph
  useEffect(() => {
    if (loading || !containerRef.current || graphData.nodes.length === 0) return;

    const elements = [
      ...graphData.nodes.map(n => ({
        data: {
          id: n.id,
          label: n.id.substring(0, 6) + "...",
          fullLabel: n.label,
          type: n.type,
          color: getNodeColor(n),
          size: n.id.toLowerCase() === targetAddress?.toLowerCase() ? 70 : 40
        }
      })),
      ...graphData.edges.map((e, i) => {
        const style = getEdgeStyle(e);
        return {
          data: {
            id: `e${i}`,
            source: e.source,
            target: e.target,
            value: e.value,
            hash: e.hash,
            asset: e.asset, // Pass asset
            timestamp: e.timestamp,
            lineColor: style.color,
            lineWidth: style.width,
            type: e.direction // 'IN' or 'OUT'
          }
        };
      })
    ];

    const cy = cytoscape({
      container: containerRef.current,
      elements: elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            'label': 'data(label)',
            'width': 'data(size)',
            'height': 'data(size)',
            'font-size': '11px',
            'font-weight': 'bold',
            'color': theme.palette.text.primary,
            'text-valign': 'center',
            'text-halign': 'center',
            'border-width': 2,
            'border-color': theme.palette.background.paper,
            'text-outline-width': 2,
            'text-outline-color': theme.palette.background.paper,
            'text-background-color': theme.palette.background.paper,
            'text-background-opacity': 0.8,
            'text-background-padding': '3px',
            'text-background-shape': 'roundrectangle'
          }
        },
        {
          selector: 'node[type="exchange"]',
          style: {
            'shape': 'diamond'
          }
        },
        {
          selector: 'edge', // Base edge
          style: {
            'width': 'data(lineWidth)',
            'line-color': 'data(lineColor)',
            'target-arrow-color': 'data(lineColor)',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 1.2,
            'opacity': 0.8
          }
        },
        {
          selector: ':selected',
          style: {
            'border-width': 4,
            'border-color': '#2563eb', // Cool accent
            'line-color': '#2563eb',
            'target-arrow-color': '#2563eb',
            'z-index': 999,
            'opacity': 1
          }
        }
      ],
      layout: { name: 'preset' } // Start preset, then manual
    });

    // CUSTOM "SPLIT" LAYOUT LOGIC
    const centerNode = cy.getElementById(targetAddress?.toLowerCase() || "");
    const nodes = cy.nodes();

    // 1. Separate nodes
    const incomingNodes = nodes.filter(n => {
      if (n.id() === centerNode.id()) return false;
      return n.edgesTo(centerNode).length > 0;
    });

    const outgoingNodes = nodes.filter(n => {
      if (n.id() === centerNode.id()) return false;
      return centerNode.edgesTo(n).length > 0;
    });

    // 2. Position Center
    centerNode.position({ x: 0, y: 0 });

    // 3. Position Incoming (Left Fan)
    incomingNodes.forEach((n, i) => {
      const angle = Math.PI - (Math.PI / (incomingNodes.length + 1)) * (i + 1);
      const radius = 250 + Math.random() * 150;
      n.position({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius
      });
    });

    // 4. Position Outgoing (Right Fan)
    outgoingNodes.forEach((n, i) => {
      if (incomingNodes.contains(n)) return;

      const angleRight = -Math.PI / 2 + (Math.PI / (outgoingNodes.length + 1)) * (i + 1);
      const radius = 250 + Math.random() * 150;
      n.position({
        x: Math.cos(angleRight) * radius,
        y: Math.sin(angleRight) * radius
      });
    });

    cy.fit(undefined, 50);

    // Event Handlers
    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      const nodeData = graphData.nodes.find(n => n.id.toLowerCase() === node.id().toLowerCase());
      if (nodeData) {
        setSelectedNode(nodeData);
        setSelectedEdge(null);
      }
    });

    cy.on('tap', 'edge', (evt) => {
      const edge = evt.target;
      const edgeData = graphData.edges.find((e, i) => `e${i}` === edge.id());
      if (edgeData) {
        setSelectedEdge(edgeData);
        setSelectedNode(null);
      }
    });

    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        setSelectedNode(null);
        setSelectedEdge(null);
      }
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
    };
  }, [graphData, loading, theme.palette.mode]);

  const handleClosePanel = () => {
    setSelectedNode(null);
    setSelectedEdge(null);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <Box sx={{
      height: '100%',
      width: '100%',
      overflow: 'hidden',
      bgcolor: 'background.default',
      position: 'relative',
    }}>

      {/* ── Gradient Header Bar ────────────────────────────── */}
      <Box sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 100,
        background: theme.palette.mode === 'dark'
          ? 'linear-gradient(180deg, rgba(11,17,32,0.95) 0%, transparent 100%)'
          : 'linear-gradient(180deg, rgba(239,246,255,0.95) 0%, transparent 100%)',
        zIndex: 40,
        pointerEvents: 'none',
      }} />

      {/* ── Search Header ──────────────────────────────────── */}
      <Box sx={{
        position: 'absolute',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '92%',
        maxWidth: 420,
        zIndex: 50,
        display: 'flex',
        justifyContent: 'center',
      }}>
        <Paper elevation={0} sx={{
          p: '4px 6px',
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          borderRadius: 4,
          bgcolor: alpha(theme.palette.background.paper, 0.88),
          backdropFilter: 'blur(24px)',
          border: '1px solid',
          borderColor: theme.palette.mode === 'dark'
            ? 'rgba(96,165,250,0.08)'
            : 'rgba(37,99,235,0.08)',
          boxShadow: theme.palette.mode === 'dark'
            ? '0 8px 32px rgba(11,17,32,0.4)'
            : '0 8px 32px rgba(37,99,235,0.08)',
          transition: 'all 0.3s ease',
          '&:focus-within': {
            borderColor: theme.palette.mode === 'dark'
              ? 'rgba(96,165,250,0.2)'
              : 'rgba(37,99,235,0.15)',
            boxShadow: theme.palette.mode === 'dark'
              ? '0 8px 32px rgba(11,17,32,0.5), 0 0 0 2px rgba(59,130,246,0.1)'
              : '0 8px 32px rgba(37,99,235,0.12), 0 0 0 2px rgba(37,99,235,0.06)',
          },
        }}>
          <InputAdornment position="start" sx={{ pl: 1.5 }}>
            <Search sx={{ color: 'text.secondary', fontSize: 20 }} />
          </InputAdornment>
          <TextField
            sx={{ ml: 0.5, flex: 1, '& input': { fontSize: '0.82rem', py: 0.8 } }}
            placeholder={t("graph.searchPlaceholder")}
            variant="standard"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={onKeyDown}
            InputProps={{ disableUnderline: true }}
          />
          <IconButton
            size="small"
            sx={{
              p: '8px',
              color: 'primary.main',
              bgcolor: alpha(theme.palette.primary.main, 0.06),
              borderRadius: 2,
              transition: 'all 0.2s',
              '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.12) },
            }}
            onClick={handleSearch}
            aria-label="Search address"
          >
            <YoutubeSearchedFor sx={{ fontSize: 20 }} />
          </IconButton>
        </Paper>
      </Box>

      {/* ── Loading Overlay ────────────────────────────────── */}
      {loading && (
        <Box sx={{
          position: 'absolute', inset: 0, zIndex: 10,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          bgcolor: theme.palette.mode === 'dark' ? 'rgba(11,17,32,0.8)' : 'rgba(239,246,255,0.8)',
          backdropFilter: 'blur(8px)',
        }}>
          <Box sx={{
            width: 64, height: 64, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: alpha(theme.palette.primary.main, 0.06),
            border: '2px solid',
            borderColor: alpha(theme.palette.primary.main, 0.15),
            mb: 2,
          }}>
            <CircularProgress size={28} sx={{ color: 'primary.main' }} />
          </Box>
          <Typography variant="body2" sx={{
            color: 'text.secondary',
            fontWeight: 600,
            letterSpacing: '0.02em',
          }}>
            {t("graph.analyzingNetwork")}
          </Typography>
        </Box>
      )}

      {/* ── Error Chip ─────────────────────────────────────── */}
      {error && !loading && (
        <Box sx={{
          position: 'absolute', top: 76, left: 0, right: 0, zIndex: 20,
          display: 'flex', justifyContent: 'center', px: 2,
        }}>
          <Chip
            label={error}
            color="error"
            onDelete={() => setError("")}
            sx={{ fontWeight: 600, fontSize: '0.75rem', borderRadius: 2 }}
          />
        </Box>
      )}

      {/* ── Graph Canvas ───────────────────────────────────── */}
      <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, zIndex: 1 }} />

      {/* ── Bottom Bar: Legend + Zoom Controls ─────────── */}
      <Box sx={{
        position: 'absolute',
        bottom: 8,
        left: 12,
        right: 12,
        zIndex: 20,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        pointerEvents: 'none',
      }}>
        {/* Mini Legend (inline row) */}
        <Paper elevation={0} sx={{
          px: 1.5, py: 0.75,
          borderRadius: 2.5,
          bgcolor: alpha(theme.palette.background.paper, 0.88),
          backdropFilter: 'blur(16px)',
          border: '1px solid',
          borderColor: isDark ? 'rgba(96,165,250,0.08)' : 'rgba(0,0,0,0.06)',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          pointerEvents: 'auto',
        }}>
          {[
            { color: '#059669', shape: 'line', label: t("graph.legendIn") },
            { color: '#dc2626', shape: 'line', label: t("graph.legendOut") },
            { color: '#2563eb', shape: 'circle', label: t("graph.legendCenter") },
            { color: '#ea580c', shape: 'diamond', label: t("graph.legendExchange") },
          ].map((item) => (
            <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {item.shape === 'line' ? (
                <Box sx={{ width: 12, height: 2, bgcolor: item.color, borderRadius: 1 }} />
              ) : item.shape === 'circle' ? (
                <Box sx={{ width: 8, height: 8, bgcolor: item.color, borderRadius: '50%' }} />
              ) : (
                <Box sx={{ width: 7, height: 7, bgcolor: item.color, transform: 'rotate(45deg)', borderRadius: 0.5 }} />
              )}
              <Typography sx={{ fontSize: '0.58rem', fontWeight: 700, color: 'text.secondary', letterSpacing: '0.02em' }}>
                {item.label}
              </Typography>
            </Box>
          ))}
        </Paper>

        {/* Zoom Controls (horizontal) */}
        <Paper elevation={0} sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.25,
          borderRadius: 2.5,
          bgcolor: alpha(theme.palette.background.paper, 0.88),
          backdropFilter: 'blur(16px)',
          border: '1px solid',
          borderColor: isDark ? 'rgba(96,165,250,0.08)' : 'rgba(0,0,0,0.06)',
          p: 0.25,
          pointerEvents: 'auto',
        }}>
          {[
            { icon: <ZoomOut sx={{ fontSize: 18 }} />, action: () => cyRef.current?.zoom(cyRef.current.zoom() * 0.8), label: t("graph.zoomOut") },
            { icon: <Hub sx={{ fontSize: 16, color: 'primary.main' }} />, action: () => cyRef.current?.fit(), label: t("graph.fit") },
            { icon: <ZoomIn sx={{ fontSize: 18 }} />, action: () => cyRef.current?.zoom(cyRef.current.zoom() * 1.2), label: t("graph.zoomIn") },
          ].map((ctrl, i) => (
            <IconButton
              key={i}
              onClick={ctrl.action}
              aria-label={ctrl.label}
              sx={{
                width: 32, height: 32,
                borderRadius: 1.5,
                transition: 'all 0.15s ease',
                '&:hover': {
                  bgcolor: alpha(theme.palette.primary.main, 0.08),
                },
              }}
            >
              {ctrl.icon}
            </IconButton>
          ))}
        </Paper>
      </Box>

      {/* ── Details Panel ──────────────────────────────────── */}
      <Slide direction="up" in={!!selectedNode || !!selectedEdge} mountOnEnter unmountOnExit>
        <Paper elevation={0} sx={{
          position: 'absolute',
          bottom: 8,
          left: 8,
          right: 8,
          maxHeight: '35vh',
          overflowY: 'auto',
          borderRadius: 3,
          zIndex: 100,
          bgcolor: alpha(theme.palette.background.paper, 0.92),
          backdropFilter: 'blur(20px)',
          border: '1px solid',
          borderColor: isDark ? 'rgba(96,165,250,0.1)' : 'rgba(0,0,0,0.08)',
          boxShadow: isDark
            ? '0 -4px 32px rgba(11,17,32,0.5)'
            : '0 -4px 32px rgba(37,99,235,0.08)',
          backgroundImage: 'none',
        }}>
          {/* Panel header */}
          <Box sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            px: 2, py: 1.25,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{
                width: 30, height: 30,
                borderRadius: 2,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                bgcolor: selectedNode
                  ? alpha(theme.palette.primary.main, 0.08)
                  : alpha('#059669', 0.08),
              }}>
                {selectedNode
                  ? <Hub sx={{ fontSize: 16, color: 'primary.main' }} />
                  : <SwapHoriz sx={{ fontSize: 16, color: '#059669' }} />}
              </Box>
              <Box>
                <Typography variant="caption" fontWeight={800} sx={{ fontSize: '0.75rem', lineHeight: 1.2, display: 'block' }}>
                  {selectedNode ? t("graph.nodeWallet") : t("graph.nodeTx")}
                </Typography>
                <Typography sx={{ fontSize: '0.55rem', fontWeight: 600, color: 'text.secondary', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  {selectedNode ? selectedNode.type : t("graph.txTransfer")}
                </Typography>
              </Box>
            </Box>
            <IconButton
              onClick={handleClosePanel}
              size="small"
              aria-label="Close details panel"
              sx={{
                width: 28, height: 28,
                bgcolor: alpha(theme.palette.text.primary, 0.04),
                borderRadius: 1.5,
                '&:hover': { bgcolor: alpha(theme.palette.text.primary, 0.08) },
              }}
            >
              <Clear sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>

          {/* Panel body */}
          <Box sx={{ p: 1.5 }}>
            <Grid container spacing={1}>
              {selectedNode && (
                <>
                  <Grid size={{ xs: 12 }}>
                    <DataCard label={t("common.address")} value={selectedNode.id} copyable />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <DataCard label={t("graph.label")} value={selectedNode.label} />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <Button
                      variant="contained"
                      fullWidth
                      disableElevation
                      onClick={() => {
                        setTargetAddress(selectedNode.id);
                        setSearchInput(selectedNode.id);
                        handleClosePanel();
                      }}
                      sx={{
                        height: '100%',
                        borderRadius: 2,
                        fontWeight: 700,
                        fontSize: '0.72rem',
                        textTransform: 'none',
                        background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                        color: '#eff6ff',
                        '&:hover': {
                          background: 'linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)',
                        },
                      }}
                    >
                      {t("graph.visualizeBtn")}
                    </Button>
                  </Grid>
                </>
              )}

              {selectedEdge && (
                <>
                  <Grid size={{ xs: 12 }}>
                    <DataCard label={t("graph.txHash")} value={selectedEdge.hash} copyable />
                  </Grid>
                  <Grid size={{ xs: 4 }}>
                    <DataCard label={t("graph.value")} value={`${selectedEdge.value.toFixed(4)} ${selectedEdge.asset || 'ETH'}`} highlight />
                  </Grid>
                  <Grid size={{ xs: 4 }}>
                    <DataCard label={t("graph.time")} value={new Date(selectedEdge.timestamp).toLocaleDateString()} />
                  </Grid>
                  <Grid size={{ xs: 4 }}>
                    <Button
                      variant="outlined"
                      fullWidth
                      size="small"
                      onClick={() => {
                        let baseUrl = 'https://etherscan.io';
                        if (net?.network_id === NetworkId.Ethereum_Sepolia) baseUrl = 'https://sepolia.etherscan.io';
                        else if (net?.network_id === NetworkId.Arbitrum_One) baseUrl = 'https://arbiscan.io';
                        else if (net?.network_id === NetworkId.Arbitrum_Sepolia) baseUrl = 'https://sepolia.arbiscan.io';
                        else if (net?.network_id === NetworkId.Base_Mainnet) baseUrl = 'https://basescan.org';
                        else if (net?.network_id === NetworkId.Base_Sepolia) baseUrl = 'https://sepolia.basescan.org';
                        // Explorer URL is handled by getExplorerBaseForNetwork in shared.tsx
                        window.open(`${baseUrl}/tx/${selectedEdge.hash}`, '_blank');
                      }}
                      sx={{
                        height: '100%',
                        borderRadius: 2,
                        textTransform: 'none',
                        fontWeight: 700,
                        fontSize: '0.65rem',
                        borderColor: isDark ? 'rgba(96,165,250,0.15)' : 'divider',
                      }}
                    >
                      {t("graph.explorer")}
                    </Button>
                  </Grid>
                </>
              )}
            </Grid>
          </Box>
        </Paper>
      </Slide>
    </Box>
  );
};

const DataCard = ({ label, value, copyable, highlight }: {
  label: string;
  value: string;
  copyable?: boolean;
  highlight?: boolean;
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box sx={{
      bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
      border: '1px solid',
      borderColor: isDark ? 'rgba(96,165,250,0.06)' : 'rgba(0,0,0,0.05)',
      borderRadius: 2,
      px: 1.25,
      py: 0.75,
    }}>
      <Typography sx={{
        fontSize: '0.55rem',
        fontWeight: 700,
        color: 'text.secondary',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        lineHeight: 1,
        mb: 0.25,
      }}>
        {label}
      </Typography>
      <Typography variant="caption" sx={{
        wordBreak: 'break-all',
        color: highlight ? 'success.main' : 'text.primary',
        fontWeight: highlight ? 700 : 600,
        fontFamily: copyable ? 'monospace' : 'inherit',
        fontSize: '0.7rem',
        lineHeight: 1.4,
      }}>
        {value}
      </Typography>
    </Box>
  );
};

export default GraphExplorer;

