
import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { Establishment } from '../types';

interface HeaderProps {
    onBack: () => void;
    isEstablishment?: boolean;
    establishmentOverride?: Establishment | null;
    backText?: string;
}

const Header: React.FC<HeaderProps> = ({ onBack, isEstablishment = false, establishmentOverride, backText }) => {
  const { currentEstablishment, currentUser } = useAppContext();
  const establishment = establishmentOverride ?? currentEstablishment;

  // Estado local para controlar erro de imagem
  const [imageError, setImageError] = useState(false);

  // Resetar erro quando mudar o estabelecimento
  useEffect(() => {
      setImageError(false);
  }, [establishment?.id]);

  const renderTitle = () => {
    if (establishment) {
      return (
        <div className="flex items-center gap-3">
          {!imageError && establishment.photoUrl ? (
              <img 
                src={establishment.photoUrl} 
                alt={establishment.name} 
                className="w-10 h-10 md:w-12 md:h-12 rounded-full object-cover shadow-sm border border-white"
                onError={() => setImageError(true)}
              />
          ) : (
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shadow-sm font-bold border border-white">
                  {establishment.name.substring(0, 2).toUpperCase()}
              </div>
          )}
          <div className="text-left overflow-hidden">
            <h1 className="text-lg md:text-xl font-bold text-blue-800 truncate leading-tight">{establishment.name}</h1>
            <p className="text-xs text-gray-500 italic hidden sm:block truncate">"{establishment.phrase}"</p>
          </div>
        </div>
      );
    }
    if(currentUser?.role === 'ADMIN') {
        return <h1 className="text-xl font-bold text-blue-600">Admin</h1>
    }

    return (
        <h1 className="text-xl font-bold text-blue-600">Mesa Ativa</h1>
    )
  }

  const defaultBackText = isEstablishment ? 'Sair' : 'Sair';
  const label = backText || defaultBackText;

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">
            {/* Botão Voltar Evidente */}
            <div className="flex-shrink-0 w-24">
                 <button 
                    onClick={onBack} 
                    className="flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2 px-3 rounded-lg transition-colors text-sm border border-gray-300 shadow-sm"
                 >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    {label}
                </button>
            </div>
         
          <div className="flex-grow flex justify-center mx-2">
            {renderTitle()}
          </div>
          
          <div className="w-24"> {/* Spacer para balancear o layout */} </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
