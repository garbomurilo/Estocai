import React, { useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { QrCode, ExternalLink, Printer } from 'lucide-react';

export default function QRCodePage() {
  const { tenantId } = useAuth();
  const qrRef = useRef(null);
  
  // Use location.origin but point to the React app route
  const cardapioUrl = `${window.location.origin}/cardapio/${tenantId || ''}`;

  useEffect(() => {
    // Dynamically load QRCode library (or you could install `qrcode.react`)
    // For now we'll just inject the script as the original did to stay faithful, 
    // but ideally we'd use `npm install qrcode.react`. I will write a simple UI 
    // and instruct the user to install it or use Google Charts API.
    // Let's just use Google Charts API for the QR code image for simplicity in React without extra libs.
  }, []);

  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(cardapioUrl)}`;

  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=600,width=800');
    printWindow.document.write(`
      <html>
        <head>
          <title>QR Code - ${tenantId}</title>
          <style>
            body { display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; margin: 0; font-family: sans-serif; text-align: center; } 
            h1 { color: #ea580c; font-size: 40px; text-transform: uppercase; } 
            img { width: 300px; height: 300px; border: 4px solid #fff; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); }
          </style>
        </head>
        <body>
          <h1>${tenantId || 'Cardápio'}</h1>
          <p style="font-size: 20px; color: #666; margin-bottom: 30px; font-weight: bold;">Escaneie para ver o cardápio</p>
          <img src="${qrImageUrl}" />
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
  };

  return (
    <div className="h-full flex flex-col items-center justify-center space-y-8 animate-fade-in max-w-2xl mx-auto">
      <div className="text-center space-y-3">
        <h2 className="text-4xl font-black text-dark-800 tracking-tight">QR Code do Cardápio</h2>
        <p className="text-dark-500 font-medium">Imprima e coloque nas mesas para seus clientes acessarem o cardápio digital.</p>
      </div>

      <div className="bg-white/70 backdrop-blur-md p-10 rounded-[40px] shadow-premium border border-white w-full flex flex-col items-center gap-8 relative overflow-hidden">
        {/* Decorative blobs */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-orange-400/10 rounded-full blur-2xl"></div>
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-orange-500/10 rounded-full blur-2xl"></div>

        <div className="bg-orange-50 p-6 rounded-3xl border border-orange-100 w-full z-10 relative">
          <p className="text-orange-800 font-bold text-sm mb-3 uppercase tracking-wider">Link Público:</p>
          <div className="flex gap-3">
            <input 
              type="text" 
              value={cardapioUrl} 
              className="flex-1 px-5 py-4 rounded-xl bg-white border border-orange-200 focus:ring-2 focus:ring-orange-500 outline-none transition-all text-dark-600 font-medium shadow-sm" 
              readOnly 
            />
            <a 
              href={cardapioUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="bg-white text-orange-600 border border-orange-200 px-6 py-4 rounded-xl font-bold hover:bg-orange-50 hover:border-orange-300 transition-all shadow-sm flex items-center justify-center"
              title="Abrir link"
            >
              <ExternalLink className="w-5 h-5" />
            </a>
          </div>
        </div>

        <div className="p-8 bg-white border-2 border-dashed border-orange-200 rounded-[32px] flex flex-col items-center gap-6 shadow-sm z-10 hover:border-orange-400 transition-colors">
          <img src={qrImageUrl} alt="QR Code" className="w-48 h-48 rounded-xl shadow-sm" />
          <p className="text-sm text-orange-600 font-bold uppercase tracking-widest bg-orange-50 px-4 py-2 rounded-full">
            Aponte a câmera
          </p>
        </div>
        
        <button 
          onClick={handlePrint}
          className="w-full sm:w-auto bg-gradient-to-r from-dark-800 to-black text-white px-10 py-5 rounded-2xl font-black hover:shadow-xl transform hover:-translate-y-1 transition-all flex items-center justify-center gap-3 z-10"
        >
          <Printer className="w-6 h-6" /> Imprimir QR Code em Alta Qualidade
        </button>
      </div>
    </div>
  );
}
