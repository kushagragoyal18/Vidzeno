import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth } from '../api';
import AuthModal from './AuthModal';

interface User {
  id: string;
  name?: string;
  email: string;
  plan: 'free' | 'premium';
}

export default function Header() {
  const [user, setUser] = useState<User | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const navigate = useNavigate();

  useEffect(() => {
    auth.me().then(setUser).catch(() => setUser(null));
  }, []);

  const handleLogout = async () => {
    await auth.logout();
    setUser(null);
    navigate('/');
  };

  const openLogin = () => {
    setAuthMode('login');
    setShowAuthModal(true);
  };

  const openRegister = () => {
    setAuthMode('register');
    setShowAuthModal(true);
  };

  return (
    <>
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link to="/" className="flex items-center space-x-2">
              <img src="/logo.jpg" alt="Vidzeno Logo" className="w-8 h-8 rounded" />
              <span className="text-xl font-bold text-gray-900">Vidzeno</span>
            </Link>

            <nav className="flex items-center space-x-4">
              <Link to="/help" className="text-gray-600 hover:text-gray-900 transition-colors">
                Help
              </Link>

              {user ? (
                <div className="flex items-center space-x-4">
                  <Link
                    to="/settings"
                    className="text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    {user.name || user.email}
                    {user.plan === 'premium' && (
                      <span className="ml-2 bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full">
                        Premium
                      </span>
                    )}
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <div className="flex items-center space-x-3">
                  <button
                    onClick={openLogin}
                    className="text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    Login
                  </button>
                  <button onClick={openRegister} className="btn-primary">
                    Sign Up
                  </button>
                </div>
              )}
            </nav>
          </div>
        </div>
      </header>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        mode={authMode}
        onSuccess={(userData) => {
          setUser(userData);
          setShowAuthModal(false);
        }}
      />
    </>
  );
}
