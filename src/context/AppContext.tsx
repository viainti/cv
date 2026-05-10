import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { UserProfile, CVData, UserPlan, JobApplication } from '../types';
import { storage } from '../utils/storage';

interface AppContextType {
  profile: UserProfile | null;
  cvs: CVData[];
  applications: JobApplication[];
  plan: UserPlan;
  loading: boolean;
  error: string | null;

  // Profile actions
  setProfile: (profile: UserProfile) => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;

  // CV actions
  addCV: (cv: CVData) => Promise<void>;
  deleteCV: (id: string) => Promise<void>;

  // Application actions
  addApplication: (app: JobApplication) => Promise<void>;

  // Plan actions
  updatePlan: (plan: Partial<UserPlan>) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [profile, setProfileState] = useState<UserProfile | null>(null);
  const [cvs, setCVsState] = useState<CVData[]>([]);
  const [applications, setApplicationsState] = useState<JobApplication[]>([]);
  const [plan, setPlanState] = useState<UserPlan>({
    type: 'freemium',
    remaining: 10,
    used: 0,
    limit: 10,
    status: 'active',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize app state from storage
  useEffect(() => {
    const initializeApp = async () => {
      try {
        const [profileData, cvsData, applicationsData, planData] = await Promise.all([
          storage.getProfile(),
          storage.getCVs(),
          storage.getApplications(),
          storage.getPlan(),
        ]);

        setProfileState(profileData);
        setCVsState(cvsData);
        setApplicationsState(applicationsData);
        setPlanState(planData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load app state');
      } finally {
        setLoading(false);
      }
    };

    initializeApp();
  }, []);

  const setProfile = async (profile: UserProfile) => {
    setProfileState(profile);
    await storage.setProfile(profile);
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!profile) return;
    const updated = { ...profile, ...updates, updatedAt: Date.now() };
    await setProfile(updated);
  };

  const addCV = async (cv: CVData) => {
    const updated = [...cvs, cv];
    setCVsState(updated);
    await storage.addCV(cv);
  };

  const deleteCV = async (id: string) => {
    const updated = cvs.filter((cv) => cv.id !== id);
    setCVsState(updated);
    await storage.deleteCV(id);
  };

  const addApplication = async (app: JobApplication) => {
    const updated = [...applications, app];
    setApplicationsState(updated);
    await storage.addApplication(app);
  };

  const updatePlanLocal = async (updates: Partial<UserPlan>) => {
    const updated = { ...plan, ...updates };
    setPlanState(updated);
    await storage.updatePlan(updates);
  };

  const value: AppContextType = {
    profile,
    cvs,
    applications,
    plan,
    loading,
    error,
    setProfile,
    updateProfile,
    addCV,
    deleteCV,
    addApplication,
    updatePlan: updatePlanLocal,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};
