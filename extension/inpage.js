// Arfhe Wallet - Inpage Script
// Bu dosya, web sayfalarının window.ethereum nesnesine erişmesini sağlar.
// EIP-1193 uyumlu bir arayüz sağlar.

class ArfheEthereumProvider {
    constructor() {
        this.isArfhe = true;
        this.isConnected = false;
        this._listeners = {};
    }

    request(args) {
        return new Promise((resolve, reject) => {
            // Arfhe Wallet ile iletişim kur - content-script aracılığıyla
            window.postMessage({
                target: 'arfhe-inpage',
                data: args
            }, '*');

            // Basit bir cevap dinleyici (daha gelişmiş bir mekanizma gerekir)
            const handleMessage = (event) => {
                if (event.data?.target === 'arfhe-content-script') {
                    // ID eşleşmesi kontrol edilmeli
                    window.removeEventListener('message', handleMessage);
                    if (event.data.data?.error) {
                        reject(event.data.data.error);
                    } else {
                        resolve(event.data.data?.result);
                    }
                }
            };
            window.addEventListener('message', handleMessage);
        });
    }

    on(eventName, listener) {
        if (!this._listeners[eventName]) {
            this._listeners[eventName] = [];
        }
        this._listeners[eventName].push(listener);
    }

    removeListener(eventName, listener) {
        if (!this._listeners[eventName]) return;
        this._listeners[eventName] = this._listeners[eventName].filter(l => l !== listener);
    }
}

// window.ethereum nesnesini oluştur
if (!window.ethereum) {
    window.ethereum = new ArfheEthereumProvider();
    window.arfeWallet = window.ethereum; // Alternatif ad
    console.log('Arfhe Wallet injected!');
} else {
  // Başka bir cüzdan zaten varsa, overlay veya fallback mekanizması eklenebilir
  console.log('Another wallet detected (MetaMask etc). Arfhe Wallet skipping injection.');
}
