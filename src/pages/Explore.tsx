import React, { useState, useEffect } from 'react';
import { Container, Paper, Typography, TextField, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, CircularProgress, Box, Grid, Link as MuiLink } from '@mui/material';
import { Search as SearchIcon, Bolt as BoltIcon, AccountBalanceWallet as AccountBalanceWalletIcon, Public as PublicIcon, Dashboard as DashboardIcon } from '@mui/icons-material';

// Bu bileşen, Metamask ve Phantom gibi cüzdanların explorer sayfalarının modern ve profesyonel
// düzenini yansıtan kapsamlı bir dashboard oluşturur.
// Tüm stil ve mantık, tek bir dosya içinde, harici bir CSS dosyasına ihtiyaç duymadan çalışmaktadır.

// Gösterim amaçlı sahte veri. Gerçek verilerle entegrasyon için API çağrıları gereklidir.
const generateMockData = () => {
  const blocks = [];
  const transactions = [];
  const now = Date.now();
  for (let i = 0; i < 12; i++) {
    blocks.push({
      id: `0x${Math.random().toString(16).slice(2, 10)}`,
      number: 123456789 - i,
      timestamp: new Date(now - i * 60000).toLocaleString('tr-TR'),
      txCount: Math.floor(Math.random() * 50) + 1,
      miner: `0x${Math.random().toString(16).slice(2, 12)}`,
    });

    transactions.push({
      hash: `0x${Math.random().toString(16).slice(2, 20)}`,
      from: `0x${Math.random().toString(16).slice(2, 10)}`,
      to: `0x${Math.random().toString(16).slice(2, 10)}`,
      value: (Math.random() * 10).toFixed(4),
      status: i % 2 === 0 ? 'Başarılı' : 'Beklemede',
    });
  }
  return { blocks, transactions };
};

const Explore = () => {
  const [loading, setLoading] = useState(true);
  const [blocks, setBlocks] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const { blocks, transactions } = generateMockData();
    setBlocks(blocks);
    setTransactions(transactions);
    setLoading(false);
  }, []);

  const handleSearch = () => {
    alert(`Aranan terim: ${searchQuery}`);
  };

  if (loading) {
    return (
      <Box className="flex justify-center items-center h-screen bg-gray-100">
        <CircularProgress />
      </Box>
    );
  }

  // Varsayılan ana metrik değerleri
  const totalTransactions = 5000000;
  const latestBlockNumber = 123456789;
  const avgBlockTime = '2.5s';

  return (
    // Ana konteyner: beyaz arka plan ve genel düzen
    <div className="bg-gray-100 min-h-screen flex flex-col font-sans text-gray-800">
      <Container maxWidth="lg" className="py-8">
        <Paper className="p-6 md:p-8 rounded-xl shadow-lg bg-white">
          <Typography variant="h4" gutterBottom className="font-semibold text-gray-800 text-center mb-6">
            Explorer
          </Typography>
          
          {/* Arama çubuğu */}
          <Box className="flex flex-col md:flex-row items-center space-y-4 md:space-y-0 md:space-x-4 mb-8">
            <TextField
              fullWidth
              variant="outlined"
              label="Adres, İşlem Hash veya Blok Numarası Girin"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-lg shadow-sm"
              InputProps={{ classes: { root: 'rounded-lg' } }}
            />
            <Button 
              variant="contained" 
              startIcon={<SearchIcon />} 
              onClick={handleSearch}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition-colors w-full md:w-auto"
            >
              Ara
            </Button>
          </Box>

          {/* İki Sütunlu Düzen: Sol tarafta Metrikler, Sağ tarafta En Son Bloklar ve İşlemler */}
          <Grid container spacing={4}>
            {/* Metrikler ve Ağ Bilgileri - Sol Sütun */}
            <Grid item xs={12} lg={4}>
              <Grid container spacing={4}>
                <Grid item xs={12} sm={6}>
                  <Paper className="p-4 rounded-xl shadow-md bg-gray-50 flex flex-col items-start h-full">
                    <Typography variant="h6" className="font-bold text-gray-800 flex items-center mb-2">
                      <DashboardIcon className="mr-2 text-blue-600" /> Ağ Durumu
                    </Typography>
                    <div className="w-full space-y-3">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500">Son Blok:</span>
                        <span className="font-semibold">{latestBlockNumber}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500">Toplam İşlem:</span>
                        <span className="font-semibold">{totalTransactions.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500">Ortalama Blok Süresi:</span>
                        <span className="font-semibold">{avgBlockTime}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500">Token Fiyatı:</span>
                        <span className="font-semibold text-green-600">$1.25</span>
                      </div>
                    </div>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Paper className="p-4 rounded-xl shadow-md bg-gray-50 flex flex-col items-start h-full">
                    <Typography variant="h6" className="font-bold text-gray-800 mb-2">
                      Popüler Adresler
                    </Typography>
                    {['0xabc...', '0xdef...', '0x123...'].map((address, index) => (
                      <MuiLink key={index} href={`/address/${address}`} className="text-blue-600 hover:underline text-sm mb-1">
                        {address}
                      </MuiLink>
                    ))}
                  </Paper>
                </Grid>
              </Grid>
            </Grid>

            {/* Son Bloklar ve Son İşlemler - Sağ Sütun */}
            <Grid item xs={12} lg={8}>
              <Paper className="p-4 rounded-xl shadow-md bg-gray-50 mb-4">
                <Typography variant="h6" className="font-bold text-gray-800 mb-2">
                  Son Bloklar
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell className="font-bold text-gray-600">Blok No</TableCell>
                        <TableCell className="font-bold text-gray-600">Yaş</TableCell>
                        <TableCell align="right" className="font-bold text-gray-600">İşlem</TableCell>
                        <TableCell className="font-bold text-gray-600">Madenci</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {blocks.map((block) => (
                        <TableRow key={block.id} className="hover:bg-gray-100 transition-colors">
                          <TableCell>
                            <MuiLink href={`/block/${block.number}`} className="text-blue-600 hover:underline">
                              {block.number}
                            </MuiLink>
                          </TableCell>
                          <TableCell>{block.timestamp}</TableCell>
                          <TableCell align="right">{block.txCount}</TableCell>
                          <TableCell className="text-gray-500 font-mono text-xs">
                            <MuiLink href={`/address/${block.miner}`} className="text-blue-600 hover:underline">
                              {block.miner.substring(0, 10)}...
                            </MuiLink>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>

              <Paper className="p-4 rounded-xl shadow-md bg-gray-50">
                <Typography variant="h6" className="font-bold text-gray-800 mb-2">
                  Son İşlemler
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell className="font-bold text-gray-600">İşlem Hash</TableCell>
                        <TableCell className="font-bold text-gray-600">Gönderen</TableCell>
                        <TableCell className="font-bold text-gray-600">Alıcı</TableCell>
                        <TableCell align="right" className="font-bold text-gray-600">Değer</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {transactions.map((tx, index) => (
                        <TableRow key={index} className="hover:bg-gray-100 transition-colors">
                          <TableCell>
                            <MuiLink href={`/tx/${tx.hash}`} className="text-blue-600 hover:underline text-xs">
                              {tx.hash.substring(0, 15)}...
                            </MuiLink>
                          </TableCell>
                          <TableCell>
                            <MuiLink href={`/address/${tx.from}`} className="text-blue-600 hover:underline text-xs">
                              {tx.from.substring(0, 10)}...
                            </MuiLink>
                          </TableCell>
                          <TableCell>
                            <MuiLink href={`/address/${tx.to}`} className="text-blue-600 hover:underline text-xs">
                              {tx.to.substring(0, 10)}...
                            </MuiLink>
                          </TableCell>
                          <TableCell align="right">
                            <span className="font-semibold">{tx.value}</span> FHE
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </Grid>
          </Grid>
        </Paper>
      </Container>
    </div>
  );
};

export default Explore;
