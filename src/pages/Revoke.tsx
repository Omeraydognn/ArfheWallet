import React from 'react';
import './Revoke.css';
import { Shield } from 'lucide-react';

const Revoke = () => {
  // Mock data for demonstration purposes
  const contracts = [
    { address: "0xa25g5de5g451vvvd75q5r...", risk: 86 },
    { address: "0xazzg5de5g451vvvd75q5r...", risk: 50 },
    { address: "0xaopg5de5g451vvvd75q5r...", risk: 0 },
  ];

  const specificAllowance = {
    address: "0xa25g5de5g451vvvd75q5rdg5d4545451322b25265436",
    allowance: "100 USDX",
    risk: 86,
  };

  return (
    <div className="revoke-page-wrapper">
      <div className="revoke-container">
        <div className="header-icon-wrapper">
          <Shield size={48} color="#0f172a" />
        </div>

        <div className="contract-list">
          {contracts.map((contract, index) => (
            <div key={index} className="contract-card">
              <div className="card-header-content">
                {/* Yeni eklenen span ile metin taşmasını kontrol ediyoruz */}
                <span className="contract-address">Sözleşme adresi <span className="address-hash">{contract.address}</span></span>
              </div>
              <div className="card-body">
                <div className="button-group">
                  <button className="details-button">Detayları göster</button>
                  <button className="revoke-button">İzinleri iptal et</button>
                </div>
                <div className="risk-indicator">
                  <span className="risk-label">Risk</span>
                  <div className="risk-bar-container">
                    <div 
                      className="risk-bar" 
                      style={{ width: `${contract.risk}%`, backgroundColor: contract.risk > 50 ? '#dc2626' : contract.risk > 0 ? '#f59e0b' : '#22c55e' }}
                    ></div>
                  </div>
                  <span className="risk-value">{contract.risk}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="specific-allowance-card">
          <div className="card-header-content">
            <span className="contract-address">Sözleşme adresi <span className="address-hash">{specificAllowance.address}</span></span>
          </div>
          <div className="card-content-body">
            <p className="allowance-text">İzin verilen değer</p>
            <p className="allowance-value">{specificAllowance.allowance}</p>
            <div className="risk-indicator">
              <span className="risk-label">Risk</span>
              <div className="risk-bar-container">
                <div 
                  className="risk-bar" 
                  style={{ width: `${specificAllowance.risk}%`, backgroundColor: '#dc2626' }}
                ></div>
              </div>
              <span className="risk-value">{specificAllowance.risk}</span>
            </div>
            <button className="revoke-button full-width">İzinleri iptal et</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Revoke;