
import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';

interface LoginProps {
    onGoToRegister: () => void;
    onBack: () => void;
}

const Login: React.FC<LoginProps> = ({ onGoToRegister, onBack }) => {
    const { login } = useAppContext();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        try {
            await login(email, password);
        } catch (err: any) {
            console.error(err);
            if (err.message.includes("Invalid login credentials") || err.message.includes("Falha no login")) {
                setError("Usuário não encontrado ou senha incorreta.");
            } else {
                setError(err.message || 'Falha no login.');
            }
            setIsLoading(false);
        }
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-50">
             <button onClick={onBack} className="absolute top-4 left-4 text-blue-600 hover:text-blue-800">
                    &larr; Voltar
             </button>
            <div className="w-full max-w-sm text-center">
                <h1 className="text-4xl font-bold text-blue-600 mb-2">Mesa Fácil</h1>
                <p className="text-lg text-slate-600 mb-8">Bem-vindo(a) de volta!</p>
                
                <form onSubmit={handleSubmit} className="w-full bg-white p-8 rounded-2xl shadow-lg text-left space-y-4">
                     {error && <p className="bg-red-100 text-red-700 p-3 rounded-md text-center text-sm">{error}</p>}
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="mt-1 w-full text-lg p-3 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                            required
                            disabled={isLoading}
                        />
                    </div>
                     <div>
                        <label htmlFor="password"className="block text-sm font-medium text-gray-700">Senha</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="mt-1 w-full text-lg p-3 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                            required
                            disabled={isLoading}
                        />
                    </div>
                    <button 
                        type="submit" 
                        disabled={isLoading}
                        className={`w-full text-white font-bold py-3 px-6 rounded-lg shadow-md transition-colors duration-300 ${isLoading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                    >
                        {isLoading ? 'Entrando...' : 'Entrar'}
                    </button>
                </form>
                <div className="mt-8">
                    <p className="text-gray-600">Não tem uma conta?</p>
                    <button onClick={onGoToRegister} className="mt-2 w-full font-medium text-blue-600 hover:text-white border border-blue-600 hover:bg-blue-600 py-2 rounded-lg transition-colors">
                       Cadastre-se
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Login;
