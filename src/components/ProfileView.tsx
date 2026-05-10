import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

type TabType = 'summary' | 'edit' | 'activity';

const ProfileView: React.FC = () => {
  const { profile, updateProfile, plan } = useApp();
  const [activeTab, setActiveTab] = useState<TabType>('summary');
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(profile || {});

  const handleSave = async () => {
    if (profile) {
      await updateProfile(formData);
      setIsEditing(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">My Profile</h2>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="btn btn-sm btn-secondary"
          >
            Edit
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {(['summary', 'edit', 'activity'] as TabType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-2 px-4 font-medium transition ${
              activeTab === tab
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab === 'summary' && '📋 Summary'}
            {tab === 'edit' && '✏️ Edit'}
            {tab === 'activity' && '📊 Activity'}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'summary' && <SummaryTab profile={profile} plan={plan} />}
      {activeTab === 'edit' && (
        <EditTab
          formData={formData}
          setFormData={setFormData}
          isEditing={isEditing}
          onSave={handleSave}
          onCancel={() => setIsEditing(false)}
        />
      )}
      {activeTab === 'activity' && <ActivityTab />}
    </div>
  );
};

const SummaryTab: React.FC<{ profile: any; plan: any }> = ({ profile, plan }) => (
  <div className="space-y-4">
    <div className="bg-gray-50 p-4 rounded-lg">
      <h3 className="font-semibold mb-3">Profile Information</h3>
      <div className="space-y-2 text-sm">
        <p>
          <span className="text-gray-600">Name:</span>{' '}
          <span className="font-medium">{profile?.name || 'Not set'}</span>
        </p>
        <p>
          <span className="text-gray-600">Email:</span>{' '}
          <span className="font-medium">{profile?.email || 'Not set'}</span>
        </p>
        <p>
          <span className="text-gray-600">Location:</span>{' '}
          <span className="font-medium">{profile?.location?.full || 'Not set'}</span>
        </p>
      </div>
    </div>

    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
      <h3 className="font-semibold mb-2">Plan Status</h3>
      <div className="flex justify-between items-center">
        <div>
          <p className="text-sm text-gray-600">Current Plan</p>
          <p className="font-bold text-blue-600">{plan?.type.toUpperCase()}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-blue-600">{plan?.remaining}</p>
          <p className="text-xs text-gray-600">remaining</p>
        </div>
      </div>
    </div>
  </div>
);

const EditTab: React.FC<{
  formData: any;
  setFormData: (data: any) => void;
  isEditing: boolean;
  onSave: () => void;
  onCancel: () => void;
}> = ({ formData, setFormData, isEditing, onSave, onCancel }) => (
  <div className="space-y-4">
    <div>
      <label className="label">Full Name</label>
      <input
        type="text"
        value={formData?.name || ''}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        disabled={!isEditing}
        className="input input-bordered w-full"
      />
    </div>

    <div>
      <label className="label">Location</label>
      <input
        type="text"
        value={formData?.location?.full || ''}
        onChange={(e) =>
          setFormData({
            ...formData,
            location: { ...formData?.location, full: e.target.value },
          })
        }
        disabled={!isEditing}
        className="input input-bordered w-full"
      />
    </div>

    {isEditing && (
      <div className="flex gap-2">
        <button onClick={onSave} className="btn btn-primary flex-1">
          Save
        </button>
        <button onClick={onCancel} className="btn btn-secondary flex-1">
          Cancel
        </button>
      </div>
    )}
  </div>
);

const ActivityTab: React.FC = () => (
  <div className="space-y-4">
    <p className="text-gray-500 text-center py-8">No activity yet</p>
  </div>
);

export default ProfileView;
