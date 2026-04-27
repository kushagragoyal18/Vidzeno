import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { payments } from '../api';

export default function PaymentSuccess() {
  const [subscription, setSubscription] = useState<any>(null);

  useEffect(() => {
    payments.subscription()
      .then(setSubscription)
      .catch(console.error);
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="card text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Welcome to Premium!
        </h1>

        <p className="text-gray-600 mb-8">
          Your subscription has been activated. You can now enjoy unlimited conversions,
          priority processing, and no watermarks.
        </p>

        {subscription && subscription.currentPeriodEnd && (
          <div className="bg-gray-50 rounded-lg p-4 mb-8">
            <p className="text-sm text-gray-600">
              Your subscription renews on{' '}
              <span className="font-medium">
                {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
              </span>
            </p>
          </div>
        )}

        <div className="flex space-x-4 justify-center">
          <Link to="/" className="btn-primary">
            Start Converting
          </Link>
          <Link to="/settings" className="btn-secondary">
            Manage Subscription
          </Link>
        </div>
      </div>
    </div>
  );
}
