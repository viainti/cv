// User Profile Type
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  phone?: string;
  location: {
    city: string;
    state: string;
    country: string;
    full: string;
  };
  role?: string;
  skills: string[];
  seniority?: 'junior' | 'mid' | 'senior' | 'lead';
  remote?: 'remote' | 'hybrid' | 'onsite';
  createdAt: number;
  updatedAt: number;
}

// CV Data Type
export interface CVData {
  id: string;
  fileName: string;
  content: string;
  extractedData: {
    email?: string;
    phone?: string;
    location?: {
      city?: string;
      state?: string;
      country?: string;
      confidence: number;
    };
    skills?: string[];
    experience?: Array<{
      title: string;
      company: string;
      duration: string;
    }>;
    education?: Array<{
      degree: string;
      school: string;
      year?: string;
    }>;
  };
  uploadedAt: number;
}

// Job Application Type
export interface JobApplication {
  id: string;
  jobId: string;
  title: string;
  company: string;
  location?: string;
  url: string;
  appliedAt: number;
  status: 'pending' | 'submitted' | 'rejected' | 'accepted';
  platform: 'linkedin' | 'indeed' | 'other';
}

// LinkedIn Form Field Type
export interface LinkedInFormField {
  id: string;
  name: string;
  type: 'text' | 'email' | 'phone' | 'select' | 'file' | 'textarea' | 'checkbox';
  label?: string;
  required: boolean;
  value?: string;
  options?: Array<{ label: string; value: string }>;
  placeholder?: string;
}

// API Response Type
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Plan Type
export type PlanType = 'freemium' | 'pro' | 'premium';

export interface UserPlan {
  type: PlanType;
  remaining: number;
  used: number;
  limit: number;
  expiresAt?: number;
  status: 'active' | 'trial' | 'expired';
}

// Storage Keys
export type StorageKey = 'profile' | 'cvs' | 'applications' | 'plan' | 'settings' | 'cache';
