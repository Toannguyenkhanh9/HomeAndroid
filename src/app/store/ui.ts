import {create} from 'zustand';

export type Currency = 'VND'|'USD';
type State = {
  themeMode: 'light'|'dark';
  currency: Currency;
  dateFormat: 'YYYY-MM-DD'|'DD/MM/YYYY';
  toggleTheme: () => void;
  setCurrency: (c: Currency) => void;
  setDateFormat: (f: 'YYYY-MM-DD'|'DD/MM/YYYY') => void;
};

export const useUIStore = create<State>((set, get)=>({
  themeMode: 'dark',
  currency: 'VND',
  dateFormat: 'YYYY-MM-DD',
  toggleTheme: ()=> set({themeMode: get().themeMode==='dark' ? 'light' : 'dark'}),
  setCurrency: (c)=> set({currency: c}),
  setDateFormat: (f)=> set({dateFormat: f}),
}));
