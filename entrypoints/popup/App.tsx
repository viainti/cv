import React, { useState } from 'react';
import { useApp } from '../../src/context/AppContext';
import ProfileView from '../../src/components/ProfileView';
import CVUpload from '../../src/components/CVUpload';
import JobsDashboard from '../../src/components/JobsDashboard';
import Header from '../../src/components/Header';

type ViewType = 'intro' | 'cv' | 'jobs' | 'profile' | 'applications';

const App: React.FC = () => {
  const { loading, profile } = useApp();
  const [currentView, setCurrentView] = useState<ViewType>('intro');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-96 bg-white min-h-screen flex flex-col">
      <Header onNavigate={setCurrentView} />

      <main className="flex-1 overflow-y-auto">
        {!profile ? (
          // Authentication / Intro flow
          <div className="p-4">
            <IntroView onNext={() => setCurrentView('profile')} />
          </div>
        ) : (
          // Main app flow
          <>
            {currentView === 'cv' && <CVUpload />}
            {currentView === 'jobs' && <JobsDashboard />}
            {currentView === 'profile' && <ProfileView />}
            {currentView === 'applications' && <ApplicationsList />}
          </>
        )}
      </main>
    </div>
  );
};

const IntroView: React.FC<{ onNext: () => void }> = ({ onNext }) => (
  <div className="space-y-4">
    <h1 className="text-2xl font-bold text-gray-900">Welcome to TRCVASTIAN</h1>
    <p className="text-gray-600">
      Automate your CV parsing and job applications with AI-powered assistance.
    </p>
    <button onClick={onNext} className="btn btn-primary w-full">
      Get Started
    </button>
  </div>
);

const ApplicationsList: React.FC = () => {
  const { applications } = useApp();

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-semibold">My Applications</h2>
      {applications.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No applications yet</p>
      ) : (
        <div className="space-y-2">
          {applications.map((app) => (
            <div key={app.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <h3 className="font-medium">{app.title}</h3>
              <p className="text-sm text-gray-600">{app.company}</p>
              <p className="text-xs text-gray-500 mt-1">
                Applied: {new Date(app.appliedAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default App;
