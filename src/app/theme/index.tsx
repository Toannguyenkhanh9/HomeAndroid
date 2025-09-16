import React, {createContext, useContext, useEffect, useMemo, useState} from 'react';
import {ColorSchemeName, useColorScheme, View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {LIGHT, DARK, ThemeColors, tokens} from './colors';

type ThemeMode = 'light' | 'dark' | 'system';

type ThemeContext = {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  colors: ThemeColors;
};

const THEME_KEY = 'app_theme_mode';
const ThemeCtx = createContext<ThemeContext | null>(null);

export function ThemeProvider({children}: {children: React.ReactNode}) {
  const sys: ColorSchemeName = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  // load persisted mode
  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem(THEME_KEY);
        if (v === 'light' || v === 'dark' || v === 'system') setModeState(v);
      } catch {}
    })();
  }, []);

  // persist
  const setMode = (m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(THEME_KEY, m).catch(() => {});
  };

  const isDark = mode === 'dark' || (mode === 'system' && sys === 'dark');
  const colors = isDark ? DARK : LIGHT;

  const value = useMemo(() => ({mode, setMode, colors}), [mode, colors]);

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

/** Lấy bảng màu để dùng trong UI (c.bg, c.card, …) */
export function useThemeColors() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error('useThemeColors must be used within ThemeProvider');
  return ctx.colors;
}

/** Truy cập / đổi theme mode (để gắn vào Settings) */
export function useThemeMode() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error('useThemeMode must be used within ThemeProvider');
  return {mode: ctx.mode, setMode: ctx.setMode};
}

/** Nền đơn giản (gradient nhẹ bằng overlay) dùng cho một số màn hình */
export function SimpleBackground({children}: {children: React.ReactNode}) {
  const c = useThemeColors();
  return (
    <View style={{flex: 1, backgroundColor: c.bg}}>
      {/* overlay chấm mờ rất nhẹ */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.06,
          backgroundColor: c.text,
        }}
      />
      {children}
    </View>
  );
}
/** Style mặc định cho các thẻ/card */
export const cardStyle = (c: ReturnType<typeof useThemeColors>) => ({
  backgroundColor: c.card,
  borderRadius: 12,
  padding: 14,
  // borderWidth: 1,
  //borderColor: c.border,
  // shadow cho iOS
  shadowColor: '#000',
  shadowOpacity: 0.06,
  shadowRadius: 6,
  shadowOffset: {width: 0, height: 2},
  // elevation cho Android
  elevation: 2,
});

// Re-export tokens nếu cần dùng chỗ khác (màu semantic, radius…)
export const themeTokens = tokens;
