
import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { Establishment } from '../types';
import FoodClocheIcon from './icons/FoodClocheIcon';

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
        <div className="flex items-center gap-2 md:gap-3 overflow-hidden justify-center w-full">
          {!imageError && establishment.photoUrl ? (
              <img 
                src={establishment.photoUrl} 
                alt={establishment.name} 
                className="w-8 h-8 md:w-10 md:h-10 rounded-full object-cover shadow-sm border-2 border-white/30 flex-shrink-0"
                onError={() => setImageError(true)}
              />
          ) : (
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/20 flex items-center justify-center text-white shadow-sm font-bold border border-white/30 flex-shrink-0 text-xs">
                  {establishment.name.substring(0, 2).toUpperCase()}
              </div>
          )}
          <div className="text-left overflow-hidden min-w-0 text-white">
            <h1 className="text-base md:text-lg font-bold truncate leading-tight">{establishment.name}</h1>
            <p className="text-[10px] text-green-50 italic hidden sm:block truncate">"{establishment.phrase}"</p>
          </div>
        </div>
      );
    }
    if(currentUser?.role === 'ADMIN') {
        return <h1 className="text-lg font-bold text-white">Admin</h1>
    }

    return (
        <div className="flex items-center justify-center gap-2 whitespace-nowrap w-full text-white">
            <div className="flex-shrink-0 scale-90"><FoodClocheIcon /></div>
            <h1 className="text-lg font-bold">Mesa Fácil</h1>
        </div>
    )
  }

  // Lógica padrão alterada para "Voltar" conforme solicitado
  const defaultBackText = 'Voltar'; 
  const label = backText || defaultBackText;

  return (
    <header className="bg-gradient-to-r from-green-500 to-emerald-600 shadow-md border-b border-green-600 sticky top-0 z-40 transition-all duration-300">
      <div className="max-w-7xl mx-auto px-3">
        {/* Altura reduzida para h-13 (aprox 52px) */}
        <div className="flex items-center justify-between h-13 gap-2">
            
            {/* Botão Voltar (Esquerda) */}
            <div className="flex-shrink-0">
                 <button 
                    onClick={onBack} 
                    className="flex items-center gap-1 bg-white/10 hover:bg-white/20 text-white font-semibold py-1.5 px-3 rounded-lg transition-colors text-xs border border-white/20 shadow-sm whitespace-nowrap"
                 >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    <span className="hidden sm:inline">{label}</span>
                    <span className="sm:hidden">Voltar</span>
                </button>
            </div>
         
          {/* Logo Central */}
          <div className="flex-grow flex justify-center min-w-0">
            {renderTitle()}
          </div>
          
          {/* Espaçador (Direita) */}
          <div className="w-14 hidden sm:block flex-shrink-0"></div>
          <div className="w-8 sm:hidden flex-shrink-0"></div>
        </div>
      </div>
    </header>
  );
};

export default Header;
