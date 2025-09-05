import React, { useState } from 'react';
import { Search, MoveHorizontal, Expand } from 'lucide-react';
import './GraphExplorer.css';

// Grafik için daha fazla mock data (örnek veri)
const mockGraphData = [
  { id: '0x155a...', type: 'address', color: 'red', position: { top: '10%', left: '35%' } },
  { id: '0x1544...', type: 'address', color: 'orange', position: { top: '40%', left: '45%' } },
  { id: '0xax555...', type: 'address', color: 'green', position: { top: '25%', left: '65%' } },
  { id: '0xax555_2...', type: 'address', color: 'green', position: { top: '45%', left: '75%' } },
  { id: '0xax555_3...', type: 'address', color: 'green', position: { top: '60%', left: '60%' } },
  { id: '0xax555_4...', type: 'address', color: 'green', position: { top: '75%', left: '70%' } },
  { id: '0xdg64...', type: 'address', color: 'green', position: { top: '40%', left: '10%' } },
  { id: '0x97ca...', type: 'address', color: 'red', position: { top: '70%', left: '20%' } },
];

// Bağlantılar için daha fazla mock data
const mockEdgesData = [
  { source: '0x155a...', target: '0x1544...', type: 'dashed' },
  { source: '0x155a...', target: '0x97ca...', type: 'dashed' },
  { source: '0xdg64...', target: '0x97ca...', type: 'dashed' },
  { source: '0xax555...', target: '0xax555_2...', type: 'solid' },
  { source: '0xax555_2...', target: '0xax555_3...', type: 'solid' },
  { source: '0xax555_3...', target: '0xax555_4...', type: 'solid' },
  { source: '0xax555_2...', target: '0x1544...', type: 'dashed' },
  { source: '0x1544...', target: '0x97ca...', type: 'dashed' },
  { source: '0x1544...', target: '0xax555_3...', type: 'dashed' },
];

const GraphExplorer = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredNode, setHoveredNode] = useState(null);
  const [hoveredNodePosition, setHoveredNodePosition] = useState({ x: 0, y: 0 });

  const handleNodeHover = (e, node) => {
    setHoveredNode(node);
    setHoveredNodePosition({ x: e.clientX, y: e.clientY });
  };

  const handleNodeLeave = () => {
    setHoveredNode(null);
  };
  
  const handleSearch = (e) => {
    e.preventDefault();
    console.log('Searching for:', searchQuery);
  };

  return (
    <div className="graph-explorer-page-wrapper">
      <div className="graph-container-box">
        {/* Arama Çubuğu */}
        <div className="search-bar-container">
          <Search size={20} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="0x155a5r45g4g4g445g54t5d1"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        {/* Grafik Alanı */}
        <div className="graph-display-area">
          {/* Bağlantı Çizgileri */}
          {mockEdgesData.map((edge, index) => {
            const sourceNode = mockGraphData.find(node => node.id === edge.source);
            const targetNode = mockGraphData.find(node => node.id === edge.target);
            
            if (!sourceNode || !targetNode) return null;

            return (
              <div
                key={index}
                className={`connection-line ${edge.type}`}
                style={{
                  '--start-x': sourceNode.position.left,
                  '--start-y': sourceNode.position.top,
                  '--end-x': targetNode.position.left,
                  '--end-y': targetNode.position.top,
                }}
              ></div>
            );
          })}

          {/* Cüzdan Düğümleri */}
          {mockGraphData.map((node) => (
            <div
              key={node.id}
              className={`node-circle node-circle-${node.color}`}
              style={{ top: node.position.top, left: node.position.left }}
              onMouseEnter={(e) => handleNodeHover(e, node)}
              onMouseLeave={handleNodeLeave}
            >
              <span className="node-label">{node.id}</span>
            </div>
          ))}

          {/* Bilgi Kutusu (Popover) */}
          {hoveredNode && (
            <div
              className="node-info-popover"
              style={{
                top: hoveredNodePosition.y + 10,
                left: hoveredNodePosition.x + 10,
              }}
            >
              <h4 className="popover-title">Cüzdan Adresi</h4>
              <p className="popover-address">{hoveredNode.id}</p>
              <div className="popover-stats">
                <p><strong>Bakiye:</strong> 1.25 ETH</p>
                <p><strong>İşlem Sayısı:</strong> 25</p>
                <p><strong>İlk İşlem:</strong> 2 ay önce</p>
              </div>
            </div>
          )}
        </div>

        {/* Aksiyon Butonları */}
        <div className="action-buttons-container">
          <button className="action-button">
            <MoveHorizontal size={20} className="action-icon" />
          </button>
          <button className="action-button">
            <Expand size={20} className="action-icon" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default GraphExplorer;