import {DefaultTheme} from '@react-navigation/native';
import {useUIStore} from '../store/ui';
import {darkColors,lightColors} from './colors';
export function useThemeColors(){return useUIStore(s=>s.themeMode)==='dark'?darkColors:lightColors;}
export function useNavTheme(){const c=useThemeColors(); return {...DefaultTheme, colors:{...DefaultTheme.colors, background:c.bg, card:c.card, text:c.text, border:c.border, primary:c.primary}} as any;}
