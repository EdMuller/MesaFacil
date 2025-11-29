
import React, { useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { CallType, CallStatus, Establishment, SemaphoreStatus } from '../types';
import { CALL_TYPE_INFO } from '../constants';
import Header from './Header';

// Selected Icons
import HandIcon from './icons/HandIcon';
import MenuIcon from './icons/MenuIcon';
import ReceiptIcon from './icons/ReceiptIcon';


interface CustomerViewProps {
    establishment: Establishment;
    tableNumber: string;
    onBack: () => void;
}

const CustomerView: React.FC<CustomerViewProps> = ({ establishment: initialEstablishment, tableNumber, onBack }) => {
  const { establishments } = useAppContext();
  
  // O PULO DO GATO:
  // Em vez de usar o 'initialEstablishment' (que é estático), buscamos a versão atualizada
  // diretamente do contexto global. Assim, quando o Realtime atualiza o contexto, 
  // esta tela atualiza sozinha e os botões mudam de cor.
  const establishment = establishments.get(initialEstablishment.id) || initialEstablishment;

  const backText = establishment.ownerId ? "Voltar" : "Sair";

  return (
    <div className="min-h-screen bg-gray-100 pb-20">
      <Header onBack={onBack} isEstablishment={false} establishmentOverride={establishment} backText={backText} />
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <div className="text-center mb-6">
            <p className="text-lg text-gray-600">Sua Mesa</p>
            <h2 className="text-5xl font-bold text-blue-600">{tableNumber}</h2>
        </div>

        <div className="grid grid-cols-1 gap-4">
            <CallButton 
              type={CallType.WAITER}
              establishment={establishment}
              tableNumber={tableNumber}
            />
            <CallButton 
              type={CallType.MENU}
              establishment={establishment}
              tableNumber={tableNumber}
            />
            <CallButton 
              type={CallType.BILL} 
              establishment={establishment}
              tableNumber={tableNumber}
            />
        </div>
      </div>
    </div>
  );
};

interface CallButtonProps {
    type: CallType;
    establishment: Establishment;
    tableNumber: string;
}

const CallButton: React.FC<CallButtonProps> = ({ type, establishment, tableNumber }) => {
    const { addCall, cancelOldestCallByType, getCallTypeSemaphoreStatus } = useAppContext();

    const icons: Record<CallType, React.ReactNode> = {
        [CallType.WAITER]: <HandIcon />,
        [CallType.MENU]: <MenuIcon />,
        [CallType.BILL]: <ReceiptIcon />,
    };

    const table = establishment.tables.get(tableNumber);
    const pendingCalls = useMemo(() => {
        return table?.calls.filter(c => c.type === type && (c.status === CallStatus.SENT || c.status === CallStatus.VIEWED)) || [];
    }, [table, type]);
    
    const pendingCount = pendingCalls.length;
    const oldestCall = pendingCount > 0 ? pendingCalls.sort((a,b) => a.createdAt - b.createdAt)[0] : null;

    const semaphoreStatus = getCallTypeSemaphoreStatus(table ?? {number: tableNumber, calls: []}, type, establishment.settings);
    
    const semaphoreClasses: Record<SemaphoreStatus, string> = {
        [SemaphoreStatus.IDLE]: 'border-gray-200',
        [SemaphoreStatus.GREEN]: 'border-green-500 bg-green-50 ring-2 ring-green-200',
        [SemaphoreStatus.YELLOW]: 'border-yellow-400 bg-yellow-50 ring-2 ring-yellow-200',
        [SemaphoreStatus.RED]: 'border-red-500 bg-red-50 ring-2 ring-red-200',
    };

    const receivedStatus = oldestCall?.status === CallStatus.VIEWED 
        ? 'bg-green-100 text-green-800 border-green-200' 
        : oldestCall?.status === CallStatus.SENT
        ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
        : 'bg-gray-100 text-gray-500 border-gray-200';

    const statusLabel = oldestCall?.status === CallStatus.VIEWED ? 'Visualizado' : 'Enviado';

    return (
        <div className={`bg-white rounded-xl shadow-md border-2 transition-all duration-300 ${semaphoreClasses[semaphoreStatus]}`}>
            <button 
                onClick={() => addCall(establishment.id, tableNumber, type)}
                className="w-full flex items-center justify-center text-gray-800 font-bold py-4 rounded-t-lg hover:bg-black hover:bg-opacity-5 transition-colors duration-200 p-4"
                aria-label={CALL_TYPE_INFO[type].verb}
            >
                <div className="flex items-center gap-4 text-blue-600">
                    <div className="scale-110">{icons[type]}</div>
                    <span className="text-xl text-gray-800">{CALL_TYPE_INFO[type].verb}</span>
                </div>
            </button>
            {pendingCount > 0 && (
                <div className="pt-0 border-t-2 border-dashed border-gray-200 flex justify-between items-center bg-gray-50/80 p-3 rounded-b-lg">
                    <div className={`px-3 py-1 rounded-full border text-xs font-bold uppercase tracking-wide flex items-center gap-1 ${receivedStatus}`}>
                        <span className={`w-2 h-2 rounded-full ${oldestCall?.status === CallStatus.VIEWED ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                        {statusLabel}
                    </div>
                    
                    <div className="flex items-center gap-1 text-gray-600">
                        <span className="text-xs font-bold uppercase">Chamados:</span>
                        <span className="text-lg font-bold">{pendingCount}</span>
                    </div>

                    <button 
                        onClick={() => cancelOldestCallByType(establishment.id, tableNumber, type)} 
                        className="bg-white border border-red-200 text-red-600 font-bold text-xs px-3 py-1.5 rounded-md hover:bg-red-50 transition-colors shadow-sm"
                        aria-label={`Cancelar ${CALL_TYPE_INFO[type].label}`}
                    >
                        Cancelar
                    </button>
                </div>
            )}
        </div>
    );
};

export default CustomerView;
