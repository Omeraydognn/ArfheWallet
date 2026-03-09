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
  Card,
  CardContent,
  Chip,
  Grid,
  Button,
  useTheme,
  alpha
} from '@mui/material';
import { ZoomIn, ZoomOut, Search, Clear, Hub, YoutubeSearchedFor, SwapHoriz } from '@mui/icons-material';
import { WalletContext } from "../AppContext.js";
import { ActiveAccountContext } from "../ActiveAccountProvider.js";
import { GraphNode, GraphEdge } from "../backend/ExplorerService.js";
import { NetworkId } from "../backend/NetworkTypes.js";
import { isAddress } from 'ethers';

// Register layout
cytoscape.use(fcose);

const GraphExplorer = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const theme = useTheme();

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
      // Basic validation before fetch
      if (!net?.explorerService || !targetAddress || !isAddress(targetAddress)) return;

      setLoading(true);
      setError("");
      try {
        const data = await net.explorerService.fetchGraphData(targetAddress);
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
      setError("Invalid address format. Please enter a valid 0x address.");
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
      height: '100dvh',
      width: '100vw',
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
            placeholder="Wallet address (0x...)"
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
            Analyzing network...
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

      {/* ── Floating Controls ──────────────────────────────── */}
      <Box sx={{
        position: 'absolute',
        bottom: 96,
        right: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
        zIndex: 20,
      }}>
        {[
          { icon: <ZoomIn sx={{ fontSize: 20 }} />, action: () => cyRef.current?.zoom(cyRef.current.zoom() * 1.2), label: "Zoom in" },
          { icon: <ZoomOut sx={{ fontSize: 20 }} />, action: () => cyRef.current?.zoom(cyRef.current.zoom() * 0.8), label: "Zoom out" },
          { icon: <Hub sx={{ fontSize: 20, color: 'primary.main' }} />, action: () => cyRef.current?.fit(), label: "Fit to view" },
        ].map((ctrl, i) => (
          <IconButton
            key={i}
            onClick={ctrl.action}
            aria-label={ctrl.label}
            sx={{
              width: 40,
              height: 40,
              bgcolor: alpha(theme.palette.background.paper, 0.9),
              backdropFilter: 'blur(12px)',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2.5,
              boxShadow: theme.palette.mode === 'dark'
                ? '0 4px 16px rgba(11,17,32,0.4)'
                : '0 4px 16px rgba(37,99,235,0.08)',
              transition: 'all 0.2s ease',
              '&:hover': {
                transform: 'scale(1.08)',
                bgcolor: 'background.paper',
                boxShadow: theme.palette.mode === 'dark'
                  ? '0 6px 20px rgba(11,17,32,0.5)'
                  : '0 6px 20px rgba(37,99,235,0.12)',
              },
            }}
          >
            {ctrl.icon}
          </IconButton>
        ))}
      </Box>

      {/* ── Legend ─────────────────────────────────────────── */}
      <Box sx={{
        position: 'absolute',
        bottom: 96,
        left: 16,
        zIndex: 20,
        pointerEvents: 'none',
      }}>
        <Paper elevation={0} sx={{
          p: 1.5,
          borderRadius: 3,
          bgcolor: alpha(theme.palette.background.paper, 0.88),
          backdropFilter: 'blur(20px)',
          border: '1px solid',
          borderColor: 'divider',
          minWidth: 110,
        }}>
          <Typography variant="caption" sx={{
            fontWeight: 800,
            color: 'text.secondary',
            mb: 1,
            display: 'block',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            fontSize: '0.6rem',
          }}>
            Flow Legend
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 16, height: 3, bgcolor: '#059669', borderRadius: 1 }} />
              <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.65rem', color: 'text.secondary' }}>
                Inflow
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 16, height: 3, bgcolor: '#dc2626', borderRadius: 1 }} />
              <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.65rem', color: 'text.secondary' }}>
                Outflow
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 10, height: 10, bgcolor: '#2563eb', borderRadius: '50%' }} />
              <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.65rem', color: 'text.secondary' }}>
                Target
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{
                width: 10, height: 10,
                bgcolor: '#ea580c',
                borderRadius: 0.5,
                transform: 'rotate(45deg)',
              }} />
              <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.65rem', color: 'text.secondary' }}>
                Exchange
              </Typography>
            </Box>
          </Box>
        </Paper>
      </Box>

      {/* ── Details Panel ──────────────────────────────────── */}
      <Slide direction="up" in={!!selectedNode || !!selectedEdge} mountOnEnter unmountOnExit>
        <Paper sx={{
          position: 'absolute',
          bottom: 96,
          left: 12,
          right: 12,
          maxHeight: '38vh',
          overflowY: 'auto',
          p: 0,
          borderRadius: 4,
          boxShadow: theme.palette.mode === 'dark'
            ? '0 -4px 40px rgba(11,17,32,0.5)'
            : '0 -4px 40px rgba(37,99,235,0.1)',
          zIndex: 100,
          bgcolor: alpha(theme.palette.background.paper, 0.92),
          backdropFilter: 'blur(24px)',
          border: '1px solid',
          borderColor: 'divider',
          backgroundImage: 'none',
        }}>
          {/* Panel header */}
          <Box sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            px: 2.5,
            py: 1.5,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{
                width: 36,
                height: 36,
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: selectedNode
                  ? alpha(theme.palette.primary.main, 0.08)
                  : alpha('#059669', 0.08),
              }}>
                {selectedNode
                  ? <Hub sx={{ fontSize: 20, color: 'primary.main' }} />
                  : <SwapHoriz sx={{ fontSize: 20, color: '#059669' }} />}
              </Box>
              <Box>
                <Typography variant="subtitle2" fontWeight={800} sx={{ fontSize: '0.85rem', lineHeight: 1.2 }}>
                  {selectedNode ? "Wallet Details" : "Transaction"}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', fontWeight: 600 }}>
                  {selectedNode ? selectedNode.type.toUpperCase() : "TRANSFER"}
                </Typography>
              </Box>
            </Box>
            <IconButton
              onClick={handleClosePanel}
              size="small"
              aria-label="Close details panel"
              sx={{
                bgcolor: alpha(theme.palette.text.primary, 0.04),
                borderRadius: 1.5,
                '&:hover': { bgcolor: alpha(theme.palette.text.primary, 0.08) },
              }}
            >
              <Clear sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>

          {/* Panel body */}
          <Box sx={{ p: 2.5 }}>
            <Grid container spacing={1.5}>
              {selectedNode && (
                <>
                  <Grid size={{ xs: 12 }}>
                    <DataCard label="Address" value={selectedNode.id} copyable />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <DataCard label="Label" value={selectedNode.label} />
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
                        borderRadius: 2.5,
                        fontWeight: 700,
                        fontSize: '0.8rem',
                        textTransform: 'none',
                        background: theme.palette.mode === 'dark'
                          ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'
                          : 'linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%)',
                        color: '#eff6ff',
                        '&:hover': {
                          background: theme.palette.mode === 'dark'
                            ? 'linear-gradient(135deg, #172554 0%, #1e40af 100%)'
                            : 'linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)',
                        },
                      }}
                    >
                      Visualize
                    </Button>
                  </Grid>
                </>
              )}

              {selectedEdge && (
                <>
                  <Grid size={{ xs: 12 }}>
                    <DataCard label="Tx Hash" value={selectedEdge.hash} copyable />
                  </Grid>
                  <Grid size={{ xs: 4 }}>
                    <DataCard label="Value" value={`${selectedEdge.value.toFixed(4)} ${selectedEdge.asset || 'ETH'}`} highlight />
                  </Grid>
                  <Grid size={{ xs: 4 }}>
                    <DataCard label="Time" value={new Date(selectedEdge.timestamp).toLocaleDateString()} />
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
                        else if (net?.network_id === NetworkId.Fhenix_Sepolia) baseUrl = 'https://explorer.helium.fhenix.zone';
                        window.open(`${baseUrl}/tx/${selectedEdge.hash}`, '_blank');
                      }}
                      sx={{
                        height: '100%',
                        borderRadius: 2,
                        textTransform: 'none',
                        fontWeight: 600,
                        fontSize: '0.75rem',
                        borderColor: 'divider',
                      }}
                    >
                      Explorer ↗
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
}) => (
  <Card variant="outlined" sx={{
    bgcolor: 'action.hover',
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: 2.5,
    transition: 'all 0.2s ease',
  }}>
    <CardContent sx={{ py: 1.25, px: 1.5, '&:last-child': { pb: 1.25 } }}>
      <Typography variant="caption" color="text.secondary" sx={{
        fontWeight: 700,
        fontSize: '0.6rem',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}>
        {label}
      </Typography>
      <Typography variant="body2" fontFamily={copyable ? 'monospace' : 'inherit'} sx={{
        wordBreak: 'break-all',
        color: highlight ? 'success.main' : 'text.primary',
        fontWeight: highlight ? 700 : 500,
        fontSize: '0.78rem',
        mt: 0.25,
      }}>
        {value}
      </Typography>
    </CardContent>
  </Card>
);

export default GraphExplorer;
