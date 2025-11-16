import React, { useState } from 'react';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  text: string;
  url: string;
}

const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, title, text, url }) => {
  const [copied, setCopied] = useState(false);
  
  if (!isOpen) return null;

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;

  const handleCopy = () => {
      navigator.clipboard.writeText(url).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
      });
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6 text-center relative">
        <button onClick={onClose} className="absolute top-2 right-2 text-gray-400 hover:text-gray-600">&times;</button>
        <h2 className="text-2xl font-bold mb-2">{title}</h2>
        <p className="text-gray-600 mb-4">{text}</p>
        
        <div className="flex justify-center my-4">
            <img src={qrCodeUrl} alt={title} width="200" height="200" />
        </div>

        <div className="relative flex items-center">
            <input type="text" value={url} readOnly className="w-full p-2 border border-gray-300 rounded-md bg-gray-100"/>
            <button onClick={handleCopy} className="absolute right-1 bg-blue-500 text-white px-3 py-1 rounded-md text-sm">
                {copied ? 'Copiado!' : 'Copiar'}
            </button>
        </div>

        <div className="mt-6">
          <button onClick={onClose} className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Fechar</button>
        </div>
      </div>
    </div>
  );
};

export default ShareModal;
