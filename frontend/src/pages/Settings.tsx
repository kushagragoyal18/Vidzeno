import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, payments } from '../api';
import toast from 'react-hot-toast';
import UpgradeBanner from '../components/UpgradeBanner';

interface Subscription {
  plan: 'free' | 'premium';
  status: string;
  currentPeriodEnd?: string;
}

export default function Settings() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    payments.subscription()
      .then(setSubscription)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleManageSubscription = async () => {
    try {
      const { url } = await payments.createPortalSession();
      if (url) {
        window.location.href = url;
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to open portal');
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4" />
          <div className="h-4 bg-gray-200 rounded w-1/2" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Account Settings</h1>

      <div className="space-y-8">
        {/* Subscription Status */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Subscription</h2>

          {subscription?.plan === 'premium' ? (
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Premium Plan</p>
                  <p className="text-sm text-gray-500">
                    {subscription.status === 'active' ? 'Active' : subscription.status}
                  </p>
                </div>
              </div>

              {subscription.currentPeriodEnd && (
                <p className="text-sm text-gray-600">
                  Renews on {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </p>
              )}

              <button
                onClick={handleManageSubscription}
                className="btn-outline"
              >
                Manage Subscription
              </button>
            </div>
          ) : (
            <div>
              <p className="text-gray-600 mb-4">
                You're currently on the free plan. Upgrade to Premium for unlimited conversions,
                no watermarks, and priority processing.
              </p>
              <UpgradeBanner variant="full" />
            </div>
          )}
        </div>

        {/* Account Info */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Account</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">
                Email
              </label>
              <p className="text-gray-900">Loading...</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
