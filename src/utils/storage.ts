import { UserProfile, CVData, JobApplication, UserPlan } from '../types';

/**
 * Unified Storage API for Chrome Extension
 * Uses chrome.storage.local for persistence
 */

const STORAGE_PREFIX = 'trcvastian_';

export const storage = {
  // Profile methods
  async getProfile(): Promise<UserProfile | null> {
    const data = await chrome.storage.local.get(`${STORAGE_PREFIX}profile`);
    return data[`${STORAGE_PREFIX}profile`] || null;
  },

  async setProfile(profile: UserProfile): Promise<void> {
    await chrome.storage.local.set({
      [`${STORAGE_PREFIX}profile`]: {
        ...profile,
        updatedAt: Date.now(),
      },
    });
  },

  // CV methods
  async getCVs(): Promise<CVData[]> {
    const data = await chrome.storage.local.get(`${STORAGE_PREFIX}cvs`);
    return data[`${STORAGE_PREFIX}cvs`] || [];
  },

  async addCV(cv: CVData): Promise<void> {
    const cvs = await this.getCVs();
    cvs.push(cv);
    await chrome.storage.local.set({
      [`${STORAGE_PREFIX}cvs`]: cvs,
    });
  },

  async deleteCV(id: string): Promise<void> {
    const cvs = await this.getCVs();
    const filtered = cvs.filter((cv) => cv.id !== id);
    await chrome.storage.local.set({
      [`${STORAGE_PREFIX}cvs`]: filtered,
    });
  },

  // Applications methods
  async getApplications(): Promise<JobApplication[]> {
    const data = await chrome.storage.local.get(`${STORAGE_PREFIX}applications`);
    return data[`${STORAGE_PREFIX}applications`] || [];
  },

  async addApplication(app: JobApplication): Promise<void> {
    const apps = await this.getApplications();
    apps.push(app);
    await chrome.storage.local.set({
      [`${STORAGE_PREFIX}applications`]: apps,
    });
  },

  // Plan methods
  async getPlan(): Promise<UserPlan> {
    const data = await chrome.storage.local.get(`${STORAGE_PREFIX}plan`);
    return (
      data[`${STORAGE_PREFIX}plan`] || {
        type: 'freemium',
        remaining: 10,
        used: 0,
        limit: 10,
        status: 'active',
      }
    );
  },

  async updatePlan(plan: Partial<UserPlan>): Promise<void> {
    const current = await this.getPlan();
    await chrome.storage.local.set({
      [`${STORAGE_PREFIX}plan`]: {
        ...current,
        ...plan,
      },
    });
  },

  // Cache methods
  async getCache<T>(key: string): Promise<T | null> {
    const data = await chrome.storage.local.get(`${STORAGE_PREFIX}cache_${key}`);
    const cached = data[`${STORAGE_PREFIX}cache_${key}`];
    if (!cached) return null;

    // Check expiration (30 days)
    if (cached.expiresAt && cached.expiresAt < Date.now()) {
      await this.clearCache(key);
      return null;
    }

    return cached.value || null;
  },

  async setCache<T>(key: string, value: T, ttl = 30 * 24 * 60 * 60 * 1000): Promise<void> {
    await chrome.storage.local.set({
      [`${STORAGE_PREFIX}cache_${key}`]: {
        value,
        expiresAt: Date.now() + ttl,
      },
    });
  },

  async clearCache(key: string): Promise<void> {
    await chrome.storage.local.remove(`${STORAGE_PREFIX}cache_${key}`);
  },

  // General methods
  async clear(): Promise<void> {
    const data = await chrome.storage.local.get();
    const keysToRemove = Object.keys(data).filter((key) => key.startsWith(STORAGE_PREFIX));
    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
    }
  },
};
