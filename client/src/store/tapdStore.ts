import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface TapdConfig {
  apiBaseUrl: string;
}

interface TapdStore extends TapdConfig {
  setConfig: (config: TapdConfig) => void;
  isConfigured: () => boolean;
}

export const useTapdStore = create<TapdStore>()(
  persist(
    (set, get) => ({
      apiBaseUrl: '',
      setConfig: (config: TapdConfig) => set(config),
      isConfigured: () => {
        const { apiBaseUrl } = get();
        return !!apiBaseUrl;
      },
    }),
    {
      name: 'tapd-config',
    }
  )
);
