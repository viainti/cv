import React from 'react';
import { useApp } from '../context/AppContext';

const JobsDashboard: React.FC = () => {
  const { applications } = useApp();

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold">Job Opportunities</h2>

      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
        <p className="text-sm text-blue-900">
          Navigate to LinkedIn or Indeed to find jobs. The extension will detect job postings and
          automatically fill application forms.
        </p>
      </div>

      {applications.length > 0 && (
        <div>
          <h3 className="font-semibold mb-2">Recent Applications</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {applications.map((app) => (
              <div key={app.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                <h4 className="font-medium">{app.title}</h4>
                <p className="text-sm text-gray-600">{app.company}</p>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-xs text-gray-500">
                    {new Date(app.appliedAt).toLocaleDateString()}
                  </span>
                  <span
                    className={`text-xs font-semibold px-2 py-1 rounded ${
                      app.status === 'submitted'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}
                  >
                    {app.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default JobsDashboard;
