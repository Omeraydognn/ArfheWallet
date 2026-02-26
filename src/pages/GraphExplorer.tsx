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
      } catch (e: any) {
        console.error("Graph fetch failed", e);
        setError(e.message);
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
    return theme.palette.mode === 'dark' ? '#94a3b8' : '#334155'; // Slate 400 (Dark) / Slate 700 (Light)
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
            'border-color': '#4f46e5', // Indigo Highlight
            'line-color': '#4f46e5',
            'target-arrow-color': '#4f46e5',
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
      height: '100dvh', // Dynamic Viewport Height for mobile bounds
      width: '100vw',
      overflow: 'hidden',
      bgcolor: 'background.default',
      position: 'relative'
    }}>

      {/* Search Header */}
      <Box sx={{
        position: 'absolute',
        top: 30,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '90%',
        maxWidth: 600,
        zIndex: 50,
        display: 'flex',
        justifyContent: 'center'
      }}>
        <Paper elevation={4} sx={{
          p: '2px 4px',
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          borderRadius: 50,
          bgcolor: alpha(theme.palette.background.paper, 0.85),
          backdropFilter: 'blur(20px)',
          border: '1px solid',
          borderColor: 'divider',
        }}>
          <InputAdornment position="start" sx={{ pl: 2 }}>
            <Search sx={{ color: 'text.secondary' }} />
          </InputAdornment>
          <TextField
            sx={{ ml: 1, flex: 1 }}
            placeholder="Search Wallet Address (0x...)"
            variant="standard"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={onKeyDown}
            InputProps={{ disableUnderline: true }}
          />
          <IconButton sx={{ p: '10px', color: 'primary.main' }} onClick={handleSearch}>
            <YoutubeSearchedFor />
          </IconButton>
        </Paper>
      </Box>

      {/* Loading */}
      {loading && (
        <Box sx={{
          position: 'absolute', inset: 0, zIndex: 10,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)',
          backdropFilter: 'blur(4px)'
        }}>
          <CircularProgress />
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 2 }}>Visualizing Network...</Typography>
        </Box>
      )}

      {/* Error */}
      {error && !loading && (
        <Box sx={{
          position: 'absolute', top: 100, left: 0, right: 0, zIndex: 20,
          display: 'flex', justifyContent: 'center'
        }}>
          <Chip
            label={error}
            color="error"
            onDelete={() => setError("")}
            sx={{ fontWeight: 'bold' }}
          />
        </Box>
      )}

      {/* Graph Area */}
      <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, zIndex: 1 }} />

      {/* Controls */}
      <Box sx={{ position: 'absolute', bottom: 120, right: 20, display: 'flex', flexDirection: 'column', gap: 1, zIndex: 20 }}>
        <IconButton
          onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 1.2)}
          sx={{ bgcolor: 'background.paper', boxShadow: 2, '&:hover': { bgcolor: 'action.hover' } }}
        >
          <ZoomIn color="action" />
        </IconButton>
        <IconButton
          onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 0.8)}
          sx={{ bgcolor: 'background.paper', boxShadow: 2, '&:hover': { bgcolor: 'action.hover' } }}
        >
          <ZoomOut color="action" />
        </IconButton>
        <IconButton
          onClick={() => cyRef.current?.fit()}
          sx={{ bgcolor: 'background.paper', boxShadow: 2, '&:hover': { bgcolor: 'action.hover' } }}
        >
          <Hub color="primary" />
        </IconButton>
      </Box>

      {/* Legend */}
      <Box sx={{ position: 'absolute', bottom: 120, left: 20, zIndex: 20, pointerEvents: 'none' }}>
        <Paper elevation={3} sx={{
          p: 2,
          borderRadius: 4,
          bgcolor: alpha(theme.palette.background.paper, 0.85),
          backdropFilter: 'blur(20px)',
          border: '1px solid',
          borderColor: 'divider',
          display: { xs: 'none', md: 'block' }
        }}>
          <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', mb: 1, display: 'block' }}>FLOW LEGEND</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Box sx={{ w: 20, h: 4, bgcolor: '#059669', borderRadius: 2 }} />
            <Typography variant="caption" fontWeight={600}>Inflow (Green)</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ w: 20, h: 4, bgcolor: '#dc2626', borderRadius: 2 }} />
            <Typography variant="caption" fontWeight={600}>Outflow (Red)</Typography>
          </Box>
        </Paper>
      </Box>

      {/* Details Panel */}
      <Slide direction="up" in={!!selectedNode || !!selectedEdge} mountOnEnter unmountOnExit>
        <Paper sx={{
          position: 'absolute',
          bottom: 200, // Safe distance from bottom bar (approx 80px)
          left: 16, // Use side margins for floating card look
          right: 16,
          maxHeight: '40vh', // Reduce max height to ensure it fits on small screens without pushing top
          overflowY: 'auto',
          p: 3,
          borderRadius: 4, // More rounded
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)', // Stronger shadow for floating effect
          zIndex: 100, // Ensure it's above everything else
          bgcolor: alpha(theme.palette.background.paper, 0.85),
          backdropFilter: 'blur(20px)',
          border: '1px solid',
          borderColor: 'divider',
          backgroundImage: 'none', // Override if needed
        }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {selectedNode ? <Hub color="primary" sx={{ fontSize: 32 }} /> : <SwapHoriz color="success" sx={{ fontSize: 32 }} />}
              <Box>
                <Typography variant="h6" fontWeight={700} color="text.primary">
                  {selectedNode ? "Wallet Details" : "Transaction Details"}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {selectedNode ? selectedNode.type.toUpperCase() : "TRANSFER"}
                </Typography>
              </Box>
            </Box>
            <IconButton onClick={handleClosePanel}><Clear /></IconButton>
          </Box>

          <Grid container spacing={2}>
            {selectedNode && (
              <>
                <Grid item xs={12} sm={6}>
                  <DataCard label="Address" value={selectedNode.id} copyable />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <DataCard label="Label" value={selectedNode.label} />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Button
                    variant="contained"
                    fullWidth
                    size="large"
                    disableElevation
                    onClick={() => {
                      setTargetAddress(selectedNode.id);
                      setSearchInput(selectedNode.id);
                      handleClosePanel();
                    }}
                  >
                    Visualize
                  </Button>
                </Grid>
              </>
            )}

            {selectedEdge && (
              <>
                <Grid item xs={12} sm={5}>
                  <DataCard label="Tx Hash" value={selectedEdge.hash} copyable />
                </Grid>
                <Grid item xs={6} sm={2}>
                  <DataCard label="Value" value={`${selectedEdge.value.toFixed(4)} ${selectedEdge.asset || 'ETH'}`} highlight />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <DataCard label="Time" value={new Date(selectedEdge.timestamp).toLocaleDateString()} />
                </Grid>
                <Grid item xs={6} sm={2}>
                  <Button
                    variant="outlined"
                    fullWidth
                    sx={{ mt: 1 }}
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
                  >
                    Open
                  </Button>
                </Grid>
              </>
            )}
          </Grid>
        </Paper>
      </Slide>
    </Box>
  );
};

const DataCard = ({ label, value, copyable, highlight }: any) => (
  <Card variant="outlined" sx={{ bgcolor: 'rgba(0,0,0,0.02)', border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontFamily={copyable ? 'monospace' : 'inherit'} sx={{
        wordBreak: 'break-all',
        color: highlight ? 'success.main' : 'text.primary',
        fontWeight: highlight ? 700 : 400
      }}>
        {value}
      </Typography>
    </CardContent>
  </Card>
);

export default GraphExplorer;
