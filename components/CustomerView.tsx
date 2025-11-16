import React, { useMemo, useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { CallType, CallStatus, Establishment, Call } from '../types';
import { CALL_TYPE_INFO } from '../constants';
import Header from './Header';

// Selected Icons
import PersonIcon from './icons/PersonIcon';
import MenuIcon from './icons/MenuIcon';
import CreditCardIcon from './icons/CreditCardIcon';


interface CustomerViewProps {
    establishment: Establishment;
    tableNumber: string;
    onBack: () => void;
}

const CustomerView: React.FC<CustomerViewProps> = ({ establishment, tableNumber, onBack }) => {
  const { addCall, cancelOldestCallByType } = useAppContext();
  
  const customerCalls = useMemo(() => {
    const table = establishment.tables.get(tableNumber);
    return table ? table.calls.filter(c => c.status !== CallStatus.ATTENDED && c.status !== CallStatus.CANCELED) : [];
  }, [establishment.tables, tableNumber]);

  const getPendingCalls = (type: CallType) => {
    return customerCalls.filter(c => c.type === type && (c.status === CallStatus.SENT || c.status === CallStatus.VIEWED));
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-20">
      <Header onBack={onBack} isEstablishment={false} establishmentOverride={establishment} backText="Voltar aos Favoritos" />
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <div className="text-center mb-6">
            <p className="text-lg text-gray-600">Sua Mesa</p>
            <h2 className="text-5xl font-bold text-blue-600">{tableNumber}</h2>
        </div>

        <div className="grid grid-cols-1 gap-4">
            <CallButton 
              type={CallType.WAITER} 
              onCall={() => addCall(establishment.id, tableNumber, CallType.WAITER)} 
              onCancel={() => cancelOldestCallByType(establishment.id, tableNumber, CallType.WAITER)}
              pendingCalls={getPendingCalls(CallType.WAITER)} 
            />
            <CallButton 
              type={CallType.MENU} 
              onCall={() => addCall(establishment.id, tableNumber, CallType.MENU)} 
              onCancel={() => cancelOldestCallByType(establishment.id, tableNumber, CallType.MENU)}
              pendingCalls={getPendingCalls(CallType.MENU)} 
            />
            <CallButton 
              type={CallType.BILL} 
              onCall={() => addCall(establishment.id, tableNumber, CallType.BILL)} 
              onCancel={() => cancelOldestCallByType(establishment.id, tableNumber, CallType.BILL)}
              pendingCalls={getPendingCalls(CallType.BILL)} 
            />
        </div>
      </div>
    </div>
  );
};

interface CallButtonProps {
    type: CallType;
    onCall: () => void;
    onCancel: () => void;
    pendingCalls: Call[];
}

const CallButton: React.FC<CallButtonProps> = ({ type, onCall, onCancel, pendingCalls }) => {
    const selectedIcons: Record<CallType, React.ReactNode> = {
        [CallType.WAITER]: <PersonIcon />,
        [CallType.MENU]: <MenuIcon />,
        [CallType.BILL]: <CreditCardIcon />,
    };

    const pendingCount = pendingCalls.length;
    const oldestCall = pendingCount > 0 ? pendingCalls.sort((a,b) => a.createdAt - b.createdAt)[0] : null;
    
    const [time, setTime] = useState(0);

    useEffect(() => {
        // FIX: Use ReturnType<typeof setInterval> for browser compatibility instead of NodeJS.Timeout.
        let interval: ReturnType<typeof setInterval> | null = null;
        if(oldestCall) {
            setTime(Date.now() - oldestCall.createdAt);
            interval = setInterval(() => {
                setTime(Date.now() - oldestCall.createdAt);
            }, 1000);
        } else {
            setTime(0);
        }

        return () => {
            if(interval) clearInterval(interval);
        };
    }, [oldestCall]);

    const formatTime = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const seconds = (totalSeconds % 60).toString().padStart(2, '0');
        return `${minutes}:${seconds}`;
    }

    return (
        <div className="bg-white rounded-xl shadow-md border-2 border-gray-200">
            <button 
                onClick={onCall}
                className="w-full flex items-center justify-center text-gray-800 font-bold py-4 rounded-t-lg hover:bg-gray-50 transition-colors duration-200 p-4"
            >
                <div className="flex items-center gap-3 text-blue-600">
                    {selectedIcons[type]}
                    <span className="text-xl text-gray-800">{CALL_TYPE_INFO[type].verb}</span>
                </div>
            </button>
            {pendingCount > 0 && (
                <div className="mt-3 pt-3 border-t-2 border-blue-100 flex justify-between items-center bg-blue-50/50 p-3 rounded-b-lg">
                    <div className="text-base text-blue-800">
                        <p>Chamados pendentes: <span className="font-bold text-lg">{pendingCount}</span></p>
                        <p>Aguardando há: <span className="font-mono font-bold text-lg">{formatTime(time)}</span></p>
                    </div>
                    <button onClick={onCancel} className="bg-red-100 text-red-700 font-semibold text-sm px-3 py-1.5 rounded-md hover:bg-red-200 transition-colors">
                        Cancelar
                    </button>
                </div>
            )}
        </div>
    );
};

export default CustomerView;