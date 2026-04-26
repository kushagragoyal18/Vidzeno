import { useState } from 'react';
import { payments } from '../api';
import toast from 'react-hot-toast';

interface UpgradeBannerProps {
  variant?: 'compact' | 'full';
}

export default function UpgradeBanner({ variant = 'full' }: UpgradeBannerProps) {
  const [loading, setLoading] = useState(false);

  const handleUpgrade = async (plan: 'monthly' | 'yearly') => {
    setLoading(true);
    try {
      const { url } = await payments.createCheckoutSession(plan);
      if (url) {
        window.location.href = url;
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to start checkout');
    }
  };

  if (variant === 'compact') {
    return (
      <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            <div>
              <p className="font-medium text-gray-900">Upgrade to Premium</p>
              <p className="text-sm text-gray-600">Unlimited conversions, no watermarks, faster processing</p>
            </div>
          </div>
          <button
            onClick={() => handleUpgrade('monthly')}
            disabled={loading}
            className="btn-primary text-sm py-2 px-4"
          >
            {loading ? 'Loading...' : 'Upgrade Now'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-300 rounded-xl p-8">
      <div className="text-center mb-6">
        <h3 className="text-2xl font-bold text-gray-900">Upgrade to Premium</h3>
        <p className="text-gray-600 mt-2">Unlock unlimited conversions and premium features</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
        <div className="bg-white rounded-lg p-6 space-y-4">
          <div className="text-center">
            <p className="text-3xl font-bold text-gray-900">$9.99</p>
            <p className="text-gray-500">per month</p>
          </div>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center">
              <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Unlimited conversions
            </li>
            <li className="flex items-center">
              <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Up to 4GB file size
            </li>
            <li className="flex items-center">
              <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              No watermark
            </li>
            <li className="flex items-center">
              <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Priority processing
            </li>
          </ul>
          <button
            onClick={() => handleUpgrade('monthly')}
            disabled={loading}
            className="btn-primary w-full"
          >
            Start Monthly
          </button>
        </div>

        <div className="bg-white rounded-lg p-6 space-y-4 relative">
          <div className="absolute -top-3 right-4 bg-green-500 text-white text-xs px-2 py-1 rounded-full">
            Best Value
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-gray-900">$79.99</p>
            <p className="text-gray-500">per year</p>
            <p className="text-green-600 text-sm font-medium">Save 33%</p>
          </div>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center">
              <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Unlimited conversions
            </li>
            <li className="flex items-center">
              <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Up to 4GB file size
            </li>
            <li className="flex items-center">
              <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              No watermark
            </li>
            <li className="flex items-center">
              <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Priority processing
            </li>
          </ul>
          <button
            onClick={() => handleUpgrade('yearly')}
            disabled={loading}
            className="btn-primary w-full"
          >
            Start Yearly
          </button>
        </div>
      </div>
    </div>
  );
}
