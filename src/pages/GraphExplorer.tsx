import { useState, useEffect, useRef, SetStateAction } from 'react';
import * as d3 from 'd3';
import { Container, Paper, Typography, Box, Tooltip, IconButton, Slide, CircularProgress } from '@mui/material';
import { ZoomIn, ZoomOut, Search, Clear } from '@mui/icons-material';

/* IF YOU ARE READING THIS, THIS IS MY FEEDBACK ON THIS CODE -NS */

// I do not know where this thing is supposed to be, but you need to contact me ASAP about this.
// Slop'ping code with GPT again, good, good. No judgment here.
// I do have much more important things to do than fix this code rn, so sorry 'bout that.
// but def contact me when you fix this.

// Also another reminder: Do not use Turkish characters (or any non-ASCII characters) in code, whatsoever.


const WalletInteractionMap = () => {
  const svgRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState(null);
  const [nodes, setNodes] = useState([] as any[]);
  const [links, setLinks] = useState([] as any[]);

  // Mock data to simulate wallet interactions
  const generateMockData = () => {
    const addresses = [];
    for (let i = 0; i < 20; i++) {
      addresses.push(`0x${Math.random().toString(16).slice(2, 10)}`);
    }

    const mockNodes = addresses.map((address, index) => ({
      id: address,
      group: Math.floor(Math.random() * 5),
      label: address.substring(0, 8) + '..',
    }));

    const mockLinks = [];
    // Generate more links to create a denser graph
    for (let i = 0; i < 35; i++) {
      const sourceIndex = Math.floor(Math.random() * addresses.length);
      let targetIndex = Math.floor(Math.random() * addresses.length);
      // Ensure source and target are not the same
      if (sourceIndex === targetIndex) {
        targetIndex = (targetIndex + 1) % addresses.length;
      }
      mockLinks.push({
        source: addresses[sourceIndex],
        target: addresses[targetIndex],
        value: 1 + Math.random(),
      });
    }

    setNodes(mockNodes);
    setLinks(mockLinks);
    setLoading(false);
  };

  useEffect(() => {
    generateMockData();
  }, []);

  useEffect(() => {
    if (nodes.length === 0 || links.length === 0 || !svgRef.current) return;

    const width = 800;
    const height = 600;

    const svg = d3.select(svgRef.current)
      .attr("viewBox", `0 0 ${width} ${height}`);
    svg.selectAll("*").remove();

    const color = d3.scaleOrdinal(d3.schemeCategory10);

    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d: { id: any; }) => d.id).distance(150))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2));

    const link = svg.append("g")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", (d: { value: number; }) => Math.sqrt(d.value));

    const node = svg.append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("class", "node")
      .on("click", (event: { stopPropagation: () => void; }, d: SetStateAction<null>) => {
        event.stopPropagation();
        setSelectedNode(d);
      });

    node.append("circle")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .attr("r", 15)
      .attr("fill", (d: { group: any; }) => color(d.group));

    node.append("text")
      .attr("x", 18)
      .attr("y", "0.31em")
      .attr("font-family", "sans-serif")
      .attr("font-size", 10)
      .attr("fill", "currentColor")
      .text((d: { label: any; }) => d.label)
      .clone(true).lower()
      .attr("stroke", "white")
      .attr("stroke-width", 3);

    simulation.on("tick", () => {
      link
        .attr("x1", (d: { source: { x: any; }; }) => d.source.x)
        .attr("y1", (d: { source: { y: any; }; }) => d.source.y)
        .attr("x2", (d: { target: { x: any; }; }) => d.target.x)
        .attr("y2", (d: { target: { y: any; }; }) => d.target.y);

      node
        .attr("transform", (d: { x: any; y: any; }) => `translate(${d.x},${d.y})`);
    });

    // Zoom and Pan functionality
    const zoom = d3.zoom()
      .scaleExtent([0.5, 4])
      .on("zoom", (event: { transform: any; }) => {
        d3.select(svgRef.current).attr("transform", event.transform);
      });
    
    d3.select(svgRef.current).call(zoom);

  }, [nodes, links, svgRef.current]);

  const handleClosePanel = () => {
    setSelectedNode(null);
  };

  if (loading) {
    return (
      <Box className="flex justify-center items-center h-screen bg-gray-100">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <div className="bg-gray-100 min-h-screen flex flex-col font-sans text-gray-800">
      <Container maxWidth="lg" className="py-8">
        <Paper className="p-6 md:p-8 rounded-xl shadow-lg bg-white relative overflow-hidden">
          <Typography variant="h4" className="font-semibold text-gray-800 text-center mb-6">
            Ağ Etkileşim Haritası
          </Typography>

          {/* Search bar placeholder */}
          <div className="relative mb-6">
            <input
              type="text"
              placeholder="Cüzdan veya İşlem Ara..."
              className="w-full p-3 pl-10 pr-4 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>

          <div className="relative w-full aspect-[4/3] bg-gray-200 rounded-lg overflow-hidden border-2 border-gray-300">
            <svg ref={svgRef} className="w-full h-full"></svg>
          </div>

          <Box className="flex justify-center items-center mt-4 space-x-2">
            <Tooltip title="Yakınlaştır">
              <IconButton onClick={() => d3.select(svgRef.current).transition().call(d3.zoom().scaleBy, 1.2)}>
                <ZoomIn />
              </IconButton>
            </Tooltip>
            <Tooltip title="Uzaklaştır">
              <IconButton onClick={() => d3.select(svgRef.current).transition().call(d3.zoom().scaleBy, 0.8)}>
                <ZoomOut />
              </IconButton>
            </Tooltip>
          </Box>
          
          <Slide direction="up" in={selectedNode !== null} mountOnEnter unmountOnExit>
            <Box className="absolute bottom-0 left-0 right-0 p-4 bg-white rounded-t-xl shadow-lg border-t border-gray-200">
              {selectedNode && (
                <div className="flex flex-col">
                  <div className="flex justify-between items-center mb-2">
                    <Typography variant="h6" className="font-semibold text-gray-800">
                      Cüzdan Detayları
                    </Typography>
                    <IconButton onClick={handleClosePanel} size="small">
                      <Clear />
                    </IconButton>
                  </div>
                  <Typography variant="body2" className="text-gray-600">
                    <span className="font-bold">Adres:</span> {selectedNode.id}
                  </Typography>
                  <Typography variant="body2" className="text-gray-600">
                    <span className="font-bold">Grup:</span> {selectedNode.group}
                  </Typography>
                  <Typography variant="body2" className="text-gray-600">
                    <span className="font-bold">Toplam İşlem:</span> Sahte Veri
                  </Typography>
                </div>
              )}
            </Box>
          </Slide>
        </Paper>
      </Container>
    </div>
  );
};

export default WalletInteractionMap;
