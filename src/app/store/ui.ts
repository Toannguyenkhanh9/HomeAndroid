import {create} from 'zustand';
export type Currency='VND'|'USD';
type State={
  themeMode:'light'|'dark';
  currency:Currency;
  dateFormat:'YYYY-MM-DD'|'DD/MM/YYYY';
  notificationsEnabled:boolean;
  toggleTheme:()=>void;
  setCurrency:(c:Currency)=>void;
  setDateFormat:(f:'YYYY-MM-DD'|'DD/MM/YYYY')=>void;
  setNotificationsEnabled:(b:boolean)=>void;
};
export const useUIStore=create<State>((set,get)=>({
  themeMode:'dark',
  currency:'VND',
  dateFormat:'YYYY-MM-DD',
  notificationsEnabled:true,
  toggleTheme:()=>set({themeMode:get().themeMode==='dark'?'light':'dark'}),
  setCurrency:(c)=>set({currency:c}),
  setDateFormat:(f)=>set({dateFormat:f}),
  setNotificationsEnabled:(b)=>set({notificationsEnabled:b}),
}));
