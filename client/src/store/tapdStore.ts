import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface TapdConfig {
  apiBaseUrl: string;
  apiToken: string;
}

interface TapdStore extends TapdConfig {
  setConfig: (config: TapdConfig) => void;
  isConfigured: () => boolean;
}

export const useTapdStore = create<TapdStore>()(
  persist(
    (set, get) => ({
      apiBaseUrl: '',
      apiToken: '',
      setConfig: (config: TapdConfig) => set(config),
      isConfigured: () => {
        const { apiBaseUrl, apiToken } = get();
        return !!apiBaseUrl && !!apiToken;
      },
    }),
    {
      name: 'tapd-config',
    }
  )
);
