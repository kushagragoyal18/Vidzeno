import { Link } from 'react-router-dom';

export default function PaymentCancel() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="card text-center">
        <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Checkout Cancelled
        </h1>

        <p className="text-gray-600 mb-8">
          No worries! Your free account is still active. Upgrade anytime to unlock
          premium features.
        </p>

        <div className="flex space-x-4 justify-center">
          <Link to="/" className="btn-primary">
            Continue with Free Plan
          </Link>
          <Link to="/settings" className="btn-outline">
            View Premium Benefits
          </Link>
        </div>
      </div>
    </div>
  );
}
