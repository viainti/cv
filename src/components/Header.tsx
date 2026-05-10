import React from 'react';

interface HeaderProps {
  onNavigate: (view: 'intro' | 'cv' | 'jobs' | 'profile' | 'applications') => void;
}

const Header: React.FC<HeaderProps> = ({ onNavigate }) => {
  return (
    <header className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">TRCVASTIAN</h1>
          <p className="text-xs text-blue-100">CV & Job Automation</p>
        </div>
        <nav className="flex gap-2">
          <button
            onClick={() => onNavigate('profile')}
            className="p-2 hover:bg-blue-500 rounded-lg transition"
            title="Profile"
          >
            👤
          </button>
          <button
            onClick={() => onNavigate('cv')}
            className="p-2 hover:bg-blue-500 rounded-lg transition"
            title="CVs"
          >
            📄
          </button>
          <button
            onClick={() => onNavigate('jobs')}
            className="p-2 hover:bg-blue-500 rounded-lg transition"
            title="Jobs"
          >
            💼
          </button>
        </nav>
      </div>
    </header>
  );
};

export default Header;
