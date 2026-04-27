/// <reference types="vite/client" />
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

// Types
export interface User {
  id: string;
  name?: string;
  email: string;
  plan: 'free' | 'premium';
}

export interface Job {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  inputFilename: string;
  outputFormat: string;
  outputFilename: string | null;
  downloadUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface Format {
  id: string;
  name: string;
  description: string;
}

// Auth
export const auth = {
  register: async (name: string, email: string, password: string) => {
    const { data } = await api.post('/api/auth/register', { name, email, password });
    return data.user as User;
  },

  login: async (email: string, password: string) => {
    const { data } = await api.post('/api/auth/login', { email, password });
    return data.user as User;
  },

  logout: async () => {
    await api.post('/api/auth/logout');
  },

  me: async () => {
    const { data } = await api.get('/api/auth/me');
    return data.user as User & { subscription?: { status: string; currentPeriodEnd: string } };
  },
};

// Upload
export const upload = {
  file: async (file: File, onProgress?: (progress: number) => void) => {
    const formData = new FormData();
    formData.append('file', file);

    const { data } = await api.post('/api/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (event) => {
        if (event.total && onProgress) {
          onProgress(Math.round((event.loaded * 100) / event.total));
        }
      },
    });
    return data;
  },
};

// Convert
export const convert = {
  start: async (fileId: string, outputFormat: string) => {
    const { data } = await api.post('/api/convert', { fileId, outputFormat });
    return data;
  },

  status: async (jobId: string) => {
    const { data } = await api.get(`/api/convert/job/${jobId}`);
    return data as Job;
  },

  formats: async () => {
    const { data } = await api.get('/api/convert/formats');
    return data.formats as Format[];
  },
};

// Payments
export const payments = {
  createCheckoutSession: async (plan: 'monthly' | 'yearly') => {
    const { data } = await api.post('/api/payments/create-checkout-session', { plan });
    return data;
  },

  subscription: async () => {
    const { data } = await api.get('/api/payments/subscription');
    return data;
  },

  createPortalSession: async () => {
    const { data } = await api.post('/api/payments/create-portal-session');
    return data;
  },
};

// Content
export const content = {
  faq: async () => {
    const { data } = await api.get('/api/content/faq');
    return data;
  },

  contact: async (name: string, email: string, subject: string, message: string) => {
    const { data } = await api.post('/api/content/contact', { name, email, subject, message });
    return data;
  },
};

export default api;
