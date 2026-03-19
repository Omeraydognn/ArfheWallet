// Arfhe Wallet - Content Script
// Bu script, web sayfalarına "inpage.js" dosyasını enjekte eder.
// Böylece web sayfaları window.ethereum nesnesine erişebilir.

const injectScript = (file_path) => {
    const container = document.head || document.documentElement;
    const script = document.createElement('script');
    script.setAttribute('type', 'text/javascript');
    script.setAttribute('src', chrome.runtime.getURL(file_path));
    script.onload = () => {
        script.remove();
    };
    container.insertBefore(script, container.children[0]);
};

injectScript('inpage.js');

// Sayfadan gelen mesajları dinle ve background script'e ilet
window.addEventListener('message', (event) => {
    // Sadece mevcut pencereden gelen mesajları kabul et
    if (event.source !== window) return;

    // Mesajın Arfhe Wallet'tan gelip gelmediğini kontrol et
    if (event.data?.target === 'arfhe-inpage') {
        // Background script'e (service-worker) gönder
        chrome.runtime.sendMessage(event.data.data, (response) => {
            // Cevabı sayfaya geri gönder
            window.postMessage({
                target: 'arfhe-content-script',
                data: response
            }, '*');
        });
    }
});
