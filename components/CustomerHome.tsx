
import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { Establishment, UserStatus } from '../types';
import Header from './Header';
import CustomerView from './CustomerView';
import ShareIcon from './icons/ShareIcon';
import UserIcon from './icons/UserIcon';
import TrashIcon from './icons/TrashIcon';
import ShareModal from './ShareModal';
import ProfileModal from './ProfileModal';
import VipModal from './VipModal';
import { APP_URL } from '../constants';

interface CustomerHomeProps {
  isGuest?: boolean;
  onExitGuestMode?: () => void;
}

const CustomerHome: React.FC<CustomerHomeProps> = ({ isGuest = false, onExitGuestMode }) => {
  const { 
      currentUser,
      logout, 
      establishments, 
      currentCustomerProfile, 
      getEstablishmentByPhone,
      searchEstablishmentByPhone,
      favoriteEstablishment,
      unfavoriteEstablishment,
      subscribeToEstablishmentCalls,
    } = useAppContext();

  const [selectedEstablishment, setSelectedEstablishment] = useState<Establishment | null>(null);
  const [tableNumber, setTableNumber] = useState('');
  const [isEnteringTable, setIsEnteringTable] = useState(false);
  const [phoneToSearch, setPhoneToSearch] = useState('');
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [tableError, setTableError] = useState('');
  const [isShareAppOpen, setShareAppOpen] = useState(false);
  const [isProfileOpen, setProfileOpen] = useState(false);
  const [isVipModalOpen, setVipModalOpen] = useState(false);
  const [isLoadingSearch, setIsLoadingSearch] = useState(false);

  useEffect(() => {
      if (selectedEstablishment) {
          const unsubscribe = subscribeToEstablishmentCalls(selectedEstablishment.id);
          return () => {
              unsubscribe && unsubscribe();
          };
      }
  }, [selectedEstablishment?.id, subscribeToEstablishmentCalls]);

  const favorited = useMemo(() => {
    if (!currentCustomerProfile) return [];
    return currentCustomerProfile.favoritedEstablishmentIds
        .map(id => establishments.get(id))
        .filter((e): e is Establishment => e !== undefined);
  }, [currentCustomerProfile, establishments]);
  
  const handleSearch = async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setStatusMessage('');
      setIsLoadingSearch(true);
      
      try {
        let establishment = getEstablishmentByPhone(phoneToSearch);
        if (!establishment && searchEstablishmentByPhone) {
            // @ts-ignore
            establishment = await searchEstablishmentByPhone(phoneToSearch);
        }
        
        if (!establishment) {
            setError("Não encontrado.");
            return;
        }
        
        if (isGuest) {
            handleSelectEstablishment(establishment);
        } else {
            try {
                if (!currentUser) throw new Error("Usuário não logado.");
                await favoriteEstablishment(currentUser!.id, establishment.id);
                setPhoneToSearch('');
                if(!establishment.isOpen) {
                    setStatusMessage(`Adicionado (Fechado).`);
                    setTimeout(() => setStatusMessage(''), 3000);
                }
            } catch (err: any) {
                if (err.message && err.message.includes("máximo 3")) {
                    setVipModalOpen(true);
                } else {
                    setError(err.message || "Erro.");
                }
            }
        }
      } catch (err: any) {
          console.error("Erro na busca:", err);
          setError("Erro de conexão.");
      } finally {
          setIsLoadingSearch(false);
      }
  };

  const handleSelectEstablishment = (establishment: Establishment) => {
    setError('');
    setStatusMessage('');

    if (!establishment.isOpen) {
        setStatusMessage(`"${establishment.name}" está fechado.`);
        setTimeout(() => setStatusMessage(''), 3000);
        return;
    }

    setSelectedEstablishment(establishment);
    setIsEnteringTable(true);
  };
  
  const handleTableSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      setTableError('');

      if (!selectedEstablishment) return;
      if(!selectedEstablishment.isOpen) {
          setTableError("Estabelecimento fechou.");
          return;
      }
      if (!tableNumber.trim()) {
        setTableError("Informe a mesa.");
        return;
      }

      const table = selectedEstablishment?.tables.get(tableNumber);
      const hasActiveCalls = table?.calls.some(c => c.status === 'SENT' || c.status === 'VIEWED');
      if (hasActiveCalls) {
          setTableError("Mesa em uso.");
          // return; 
      }
      
      const tableNum = parseInt(tableNumber, 10);
      const totalTables = selectedEstablishment?.settings?.totalTables || 20;
      
      if (isNaN(tableNum) || tableNum < 1 || tableNum > totalTables) {
           setTableError("Mesa Inexistente.");
           return;
      }

      setIsEnteringTable(false);
  }

  if (selectedEstablishment && tableNumber && !isEnteringTable) {
      return <CustomerView 
                establishment={selectedEstablishment} 
                tableNumber={tableNumber} 
                onBack={() => {
                    setSelectedEstablishment(null);
                    setTableNumber('');
                    setTableError('');
                    if (isGuest && selectedEstablishment) {
                        setIsEnteringTable(true); 
                    }
                }}
             />
  }

  const headerAction = isGuest ? onExitGuestMode! : logout;
  const backText = "Voltar"; 

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <Header onBack={headerAction} backText={backText} establishmentOverride={null} />
       <main className="p-2 max-w-lg mx-auto">
        
        {isGuest ? (
            <div className="mb-3">
                <div className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg shadow py-2 px-3 flex items-center justify-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    <span className="text-lg font-bold">Acesso Eventual</span>
                </div>
            </div>
        ) : (
            <div className="text-center mb-2 mt-1">
                <h1 className="text-lg font-bold text-blue-600">Meus Favoritos</h1>
            </div>
        )}

        {/* LISTA DE FAVORITOS (Vem primeiro agora) */}
        {!isGuest && (
            <div className="mb-3">
                {favorited.length === 0 ? (
                    <div className="bg-white rounded-lg border border-dashed border-gray-300 p-4 text-center">
                        <p className="text-gray-400 text-xs">Lista de favoritos vazia.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {favorited.map(est => (
                            <div 
                                key={est.id} 
                                onClick={() => handleSelectEstablishment(est)}
                                className="bg-white rounded-lg shadow-sm border border-gray-200 p-2 hover:shadow-md transition-all cursor-pointer"
                            >
                                <div className="flex gap-2 items-center">
                                    <img src={est.photoUrl} alt={est.name} className="w-14 h-14 rounded-lg object-cover bg-gray-200 flex-shrink-0" />

                                    <div className="flex-grow overflow-hidden min-w-0">
                                        <h3 className="text-sm font-bold text-blue-600 truncate leading-tight">{est.name}</h3>
                                        <p className="text-[10px] text-gray-500 italic truncate leading-tight mt-0.5">"{est.phrase}"</p>
                                        
                                        <div className="flex items-center justify-between mt-1">
                                            <span className={`text-[9px] px-1.5 py-px rounded font-bold uppercase tracking-wide ${est.isOpen ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                                {est.isOpen ? 'Aberto' : 'Fechado'}
                                            </span>

                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (window.confirm(`Remover "${est.name}"?`)) {
                                                        unfavoriteEstablishment(currentUser!.id, est.id);
                                                    }
                                                }}
                                                className="text-gray-300 hover:text-red-500 p-1 -mr-1"
                                            >
                                                <TrashIcon />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )}

        {/* SEARCH FORM (Agora embaixo dos favoritos) */}
        <form onSubmit={handleSearch} className="mb-2 p-2 bg-white rounded-lg shadow-sm border border-gray-200">
            <h2 className="font-bold mb-1.5 text-[10px] uppercase text-gray-500 tracking-wider">
                {isGuest ? 'Buscar Estabelecimento' : 'Adicionar Novo Favorito'}
            </h2>
            <div className="flex flex-row gap-2 items-center">
                <input 
                    type="tel"
                    value={phoneToSearch}
                    onChange={(e) => setPhoneToSearch(e.target.value)}
                    placeholder="Telefone do local..."
                    className="flex-grow w-0 p-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
                <button 
                    disabled={isLoadingSearch} 
                    type="submit" 
                    className="flex-shrink-0 bg-blue-600 text-white font-bold py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-blue-300 text-xs whitespace-nowrap"
                >
                    {isLoadingSearch ? '...' : (isGuest ? 'Entrar' : 'Adicionar')}
                </button>
            </div>
            {error && <p className="text-red-500 text-xs mt-1 text-center">{error}</p>}
            {statusMessage && <p className="text-blue-600 text-xs font-bold mt-1 text-center animate-pulse">{statusMessage}</p>}
        </form>

        {/* VIP BANNER (Compacto) */}
        {!isGuest && (
             <div className="mt-2 text-center bg-blue-50 py-2 px-3 rounded-lg border border-blue-100 flex items-center justify-between">
                <span className="text-[10px] text-gray-600">Quer mais favoritos?</span>
                <button onClick={() => setVipModalOpen(true)} className="text-xs font-bold text-blue-600 hover:text-blue-800 underline">
                   Seja VIP
                </button>
            </div>
        )}

      </main>

      {isEnteringTable && selectedEstablishment && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in">
              <div className="bg-white rounded-lg shadow-xl w-full max-w-xs p-5 text-center">
                  <h2 className="text-lg font-bold mb-1 text-blue-800">{selectedEstablishment.name}</h2>
                  
                  <form onSubmit={handleTableSubmit}>
                      <label htmlFor="tableNumber" className="block text-sm font-medium text-gray-600 my-3">Qual o número da mesa?</label>
                      <input
                          id="tableNumber"
                          type="number"
                          value={tableNumber}
                          onChange={(e) => setTableNumber(e.target.value)}
                          className="w-full text-center text-3xl font-bold p-3 border-2 border-gray-200 rounded-lg focus:ring-green-500 focus:border-green-500 text-gray-800"
                          autoFocus
                          required
                      />
                      {tableError && <p className="text-red-500 text-xs mt-2 font-medium bg-red-50 p-1 rounded">{tableError}</p>}
                      
                      <div className="mt-5 flex gap-2">
                         <button type="button" onClick={() => { setIsEnteringTable(false); setSelectedEstablishment(null); setTableNumber(''); setTableError(''); }} className="flex-1 bg-gray-100 text-gray-700 font-bold py-2 rounded-md text-sm hover:bg-gray-200">
                            Cancelar
                        </button>
                        <button 
                            type="submit" 
                            className="flex-1 bg-green-600 text-white font-bold py-2 rounded-md text-sm hover:bg-green-700 shadow-md"
                        >
                            Entrar
                        </button>
                      </div>
                  </form>
              </div>
          </div>
      )}
      
      {!isGuest && (
        <>
            <div className="fixed bottom-0 left-0 right-0 bg-white shadow-[0_-2px_10px_rgba(0,0,0,0.05)] border-t border-gray-100 p-2 flex justify-between px-8 items-center z-10 h-12">
              <button onClick={() => setShareAppOpen(true)} className="flex flex-col items-center text-gray-400 hover:text-blue-600 transition-colors">
                  <ShareIcon /> <span className="text-[9px] mt-0.5">Share</span>
              </button>
              <button onClick={() => setProfileOpen(true)} className="flex flex-col items-center text-gray-400 hover:text-blue-600 transition-colors">
                  <UserIcon /> <span className="text-[9px] mt-0.5">Perfil</span>
              </button>
            </div>
            <ShareModal isOpen={isShareAppOpen} onClose={() => setShareAppOpen(false)} title="Compartilhar" text="" url={APP_URL} />
            <ProfileModal isOpen={isProfileOpen} onClose={() => setProfileOpen(false)} />
            <VipModal isOpen={isVipModalOpen} onClose={() => setVipModalOpen(false)} />
        </>
      )}

    </div>
  );
};

export default CustomerHome;
