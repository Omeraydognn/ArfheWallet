import React, { useState } from "react";
import { Search, Activity, Box, Clock, ArrowRight } from "lucide-react";
import './Explore.css'; // Stil dosyasını buraya import ediyoruz

// Mock Data (Gerçek verilerinizle değiştirin)
const mockData = {
  blocks: [
    { number: 1056789, hash: "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f", transactions: 25, size: "1.2 KB", timestamp: "20 saniye önce" },
    { number: 1056788, hash: "0x2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f1", transactions: 18, size: "1.1 KB", timestamp: "45 saniye önce" },
    { number: 1056787, hash: "0x3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f12", transactions: 32, size: "1.5 KB", timestamp: "1 dakika önce" },
  ],
  recentTransactions: [
    { hash: "0x4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f123", amount: "0.5 ETH", gasFee: "0.001 ETH", status: "confirmed", timestamp: "5 saniye önce" },
    { hash: "0x5e6f7a8b9c0d1e2f3a4b5c6d7e8f1234", amount: "1.2 BTC", gasFee: "0.0002 BTC", status: "pending", timestamp: "15 saniye önce" },
    { hash: "0x6f7a8b9c0d1e2f3a4b5c6d7e8f12345", amount: "15 USDT", gasFee: "0.0005 ETH", status: "confirmed", timestamp: "30 saniye önce" },
  ],
  addresses: [
    { address: "0x7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c", transactions: 125, balance: "10 ETH", lastActivity: "5 dakika önce" },
    { address: "0x8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3", transactions: 89, balance: "2 BTC", lastActivity: "20 dakika önce" },
    { address: "0x9b0c1d2e3f4a5b6c7d8e9f0a1b2c34", transactions: 210, balance: "5000 USDT", lastActivity: "1 saat önce" },
  ],
};

const Explorer = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("transactions");
  const { blocks, recentTransactions, addresses } = mockData;

  const handleSearch = (e) => {
    e.preventDefault();
    console.log("Searching for:", searchQuery);
    // Gerçek arama mantığı buraya eklenecek
  };

  const Card = ({ children }) => <div className="card">{children}</div>;
  const CardHeader = ({ children }) => <div className="card-header">{children}</div>;
  const CardTitle = ({ children }) => <h2 className="card-title">{children}</h2>;
  const CardContent = ({ children }) => <div className="card-content">{children}</div>;
  const Badge = ({ children, variant }) => <span className={`badge badge--${variant}`}>{children}</span>;
  const TabsList = ({ children }) => <div className="tabs-list">{children}</div>;
  const TabsTrigger = ({ children, value, active, onClick }) => (
    <button
      onClick={onClick}
      className={`tabs-trigger ${active ? 'tabs-trigger--active' : ''}`}
    >
      {children}
    </button>
  );

  return (
    <div className="explorer-container">
      <div className="header">
        <h1>Blockchain Explorer</h1>
        <p>Blokları, işlemleri ve adresleri keşfedin</p>
      </div>

      <div className="search-section">
        <form onSubmit={handleSearch} className="search-form">
          <div className="search-input-wrapper">
            <Search className="search-icon" />
            <input
              type="text"
              placeholder="Blok numarası, işlem hash'i veya adres ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>
          <button type="submit" className="search-button">
            Ara
          </button>
        </form>
      </div>

      <div className="tabs-section">
        <TabsList>
          <TabsTrigger value="transactions" active={activeTab === "transactions"} onClick={() => setActiveTab("transactions")}>
            İşlemler
          </TabsTrigger>
          <TabsTrigger value="blocks" active={activeTab === "blocks"} onClick={() => setActiveTab("blocks")}>
            Bloklar
          </TabsTrigger>
          <TabsTrigger value="addresses" active={activeTab === "addresses"} onClick={() => setActiveTab("addresses")}>
            Adresler
          </TabsTrigger>
        </TabsList>
        
        <div className="tab-content">
          {activeTab === "transactions" && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <div className="card-title-icon-wrapper">
                    <Activity className="card-title-icon" />
                    <span>Son İşlemler</span>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="item-list">
                  {recentTransactions.map((tx) => (
                    <div
                      key={tx.hash}
                      className="list-item clickable"
                      onClick={() => console.log(`Navigating to tx: ${tx.hash}`)}
                    >
                      <div className="list-item-main">
                        <div className="list-item-hash">
                          <span className="hash-text">{tx.hash.substring(0, 8)}...{tx.hash.substring(tx.hash.length - 8)}</span>
                        </div>
                        <div className="list-item-meta">
                          <Clock className="meta-icon" />
                          <span className="meta-text">{tx.timestamp}</span>
                        </div>
                      </div>
                      <div className="list-item-details">
                        <div className="details-text">
                          <span className="details-amount">{tx.amount}</span>
                          <span className="details-gas">Gas: {tx.gasFee}</span>
                        </div>
                        <Badge variant={tx.status === "confirmed" ? "default" : "secondary"}>
                          {tx.status === "confirmed" ? "Onaylandı" : "Beklemede"}
                        </Badge>
                        <ArrowRight className="details-arrow" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "blocks" && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <div className="card-title-icon-wrapper">
                    <Box className="card-title-icon" />
                    <span>Son Bloklar</span>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="item-list">
                  {blocks.map((block) => (
                    <div
                      key={block.number}
                      className="list-item clickable"
                    >
                      <div className="list-item-main">
                        <div className="block-number-badge">
                          #{block.number}
                        </div>
                        <div className="list-item-content">
                          <span className="hash-text">{block.hash.substring(0, 8)}...{block.hash.substring(block.hash.length - 8)}</span>
                          <div className="list-item-meta">
                            <Clock className="meta-icon" />
                            <span className="meta-text">{block.timestamp}</span>
                          </div>
                        </div>
                      </div>
                      <div className="list-item-details">
                        <div className="details-text">
                          <span className="details-tx-count">{block.transactions} işlem</span>
                          <span className="details-size">Boyut: {block.size}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "addresses" && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <div className="card-title-icon-wrapper">
                    <Activity className="card-title-icon" />
                    <span>Aktif Adresler</span>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="item-list">
                  {addresses.map((address) => (
                    <div
                      key={address.address}
                      className="list-item clickable"
                      onClick={() => console.log(`Navigating to address: ${address.address}`)}
                    >
                      <div className="list-item-main">
                        <div className="address-icon-wrapper">
                          <Activity className="address-icon" />
                        </div>
                        <div className="list-item-content">
                          <span className="hash-text">{address.address.substring(0, 8)}...{address.address.substring(address.address.length - 8)}</span>
                          <span className="details-tx-count">{address.transactions} işlem</span>
                        </div>
                      </div>
                      <div className="list-item-details">
                        <div className="details-text">
                          <span className="details-amount">{address.balance}</span>
                          <span className="details-last-activity">Son aktivite: {address.lastActivity}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default Explorer;