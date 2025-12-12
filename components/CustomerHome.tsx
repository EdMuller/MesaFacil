
import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { Establishment } from '../types';
import Header from './Header';
import CustomerView from './CustomerView';
import ShareIcon from './icons/ShareIcon';
import UserIcon from './icons/UserIcon';
import TrashIcon from './icons/TrashIcon';
import ShareModal from './ShareModal';
import ProfileModal from './ProfileModal';
import VipModal from './VipModal';
import { APP_URL } from '../constants';

const CustomerHome: React.FC<{ isGuest?: boolean; onExitGuestMode?: () => void }> = ({ isGuest = false, onExitGuestMode }) => {
  const { 
      currentUser, logout, establishments, currentCustomerProfile, 
      getEstablishmentByPhone, searchEstablishmentByPhone, favoriteEstablishment, unfavoriteEstablishment,
      isUpdating
    } = useAppContext();

  const [selectedEstablishment, setSelectedEstablishment] = useState<Establishment | null>(null);
  const [tableNumber, setTableNumber] = useState('');
  const [isEnteringTable, setIsEnteringTable] = useState(false);
  const [phoneToSearch, setPhoneToSearch] = useState('');
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [tableError, setTableError] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  
  // Regra 3: Feedback de atualização
  const showLoading = isUpdating;

  const favorited = useMemo(() => {
    if (!currentCustomerProfile) return [];
    return currentCustomerProfile.favoritedEstablishmentIds
        .map(id => establishments.get(id))
        .filter((e): e is Establishment => e !== undefined);
  }, [currentCustomerProfile, establishments]);
  
  const handleSearch = async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setIsSearching(true);
      
      try {
        let establishment = getEstablishmentByPhone(phoneToSearch);
        
        if (!establishment && searchEstablishmentByPhone) {
            // @ts-ignore
            establishment = await searchEstablishmentByPhone(phoneToSearch);
        }
        
        if (!establishment) { 
            setError("Estabelecimento não encontrado com este telefone."); 
            return; 
        }
        
        if (isGuest) {
            handleSelectEstablishment(establishment);
        } else {
            if (!currentUser) throw new Error("Usuário não logado.");
            await favoriteEstablishment(currentUser!.id, establishment.id);
            setPhoneToSearch('');
        }
      } catch (err: any) { 
          console.error(err);
          setError(err.message || "Erro ao buscar."); 
      } finally {
          setIsSearching(false);
      }
  };

  const handleSelectEstablishment = (establishment: Establishment) => {
    const freshData = establishments.get(establishment.id) || establishment;
    setSelectedEstablishment(freshData);
    if (!freshData.isOpen) {
        setStatusMessage(`"${freshData.name}" - Estabelecimento Fechado`);
        setTimeout(() => setStatusMessage(''), 3000);
    }
    setIsEnteringTable(true);
  };
  
  const handleTableSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedEstablishment) return;
      const freshEstablishment = establishments.get(selectedEstablishment.id) || selectedEstablishment;
      
      // Regra 1: Se estiver fechado (ou parecer fechado por falta de heartbeat), bloqueia
      if(!freshEstablishment.isOpen) {
          setTableError("Estabelecimento Fechado no Momento");
          return;
      }
      setIsEnteringTable(false);
  }

  if (selectedEstablishment && tableNumber && !isEnteringTable) {
      return <CustomerView 
                establishment={selectedEstablishment} 
                tableNumber={tableNumber} 
                onBack={() => { setSelectedEstablishment(null); setTableNumber(''); }}
             />
  }
  
  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <Header onBack={isGuest ? onExitGuestMode! : logout} backText={isGuest ? "Sair Guest" : "Sair"} />
      
      {showLoading && (
          <div className="bg-yellow-100 text-yellow-800 text-xs text-center py-2 font-bold animate-pulse">
              Por favor, aguarde. Atualizando status dos Estabelecimentos...
          </div>
      )}

      <main className="p-2 max-w-lg mx-auto mt-2">
        <h1 className="text-lg font-bold text-blue-600 text-center mb-4">Meus Favoritos</h1>

        <div className="space-y-2">
            {favorited.length === 0 && !isGuest && (
                <p className="text-center text-gray-500 text-sm py-4">Você ainda não tem favoritos. Busque pelo telefone abaixo.</p>
            )}
            {favorited.map(est => (
                <div key={est.id} onClick={() => handleSelectEstablishment(est)} className={`bg-white rounded-lg shadow-sm border p-2 flex items-center gap-3 cursor-pointer ${!est.isOpen ? 'opacity-60 bg-gray-100' : 'hover:border-blue-300'}`}>
                    <div className="relative">
                         <img src={est.photoUrl} className="w-12 h-12 rounded bg-gray-200 object-cover" />
                         {!est.isOpen && <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center text-[8px] text-white font-bold">FECHADO</div>}
                    </div>
                    <div className="flex-grow">
                        <h3 className="font-bold text-sm text-gray-800">{est.name}</h3>
                        <p className="text-xs text-gray-500">{est.phrase}</p>
                    </div>
                    <div className={`w-3 h-3 rounded-full ${est.isOpen ? 'bg-green-500' : 'bg-red-500'}`}></div>
                </div>
            ))}
        </div>

        <form onSubmit={handleSearch} className="mt-6 p-4 bg-white rounded-lg shadow border">
            <h3 className="text-xs font-bold uppercase text-gray-500 mb-2">Adicionar Novo / Buscar</h3>
            <div className="flex gap-2">
                <input value={phoneToSearch} onChange={e => setPhoneToSearch(e.target.value)} placeholder="Telefone (apenas números)..." className="flex-grow border p-2 rounded text-sm" disabled={isSearching} />
                <button type="submit" disabled={isSearching} className={`bg-blue-600 text-white px-4 py-2 rounded text-sm font-bold ${isSearching ? 'opacity-50' : ''}`}>
                    {isSearching ? '...' : 'Buscar'}
                </button>
            </div>
            {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
        </form>
      </main>
    </div>
  );
};

export default CustomerHome;
