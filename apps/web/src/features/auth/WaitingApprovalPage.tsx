import { useNavigate } from 'react-router-dom';

export function WaitingApprovalPage() {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-950 px-4">
      <div className="w-full max-w-md text-center">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-8">
          <div className="mb-6">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-yellow-500/10 border border-yellow-500/30 rounded-full flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-yellow-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Menunggu Persetujuan</h1>
            <p className="text-gray-400">
              Akun Anda sedang menunggu persetujuan dari admin. Kami akan memberi tahu Anda melalui email
              ketika akun Anda sudah disetujui.
            </p>
          </div>

          <button
            onClick={() => navigate('/login')}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded transition"
          >
            Kembali ke Login
          </button>
        </div>
      </div>
    </div>
  );
}
