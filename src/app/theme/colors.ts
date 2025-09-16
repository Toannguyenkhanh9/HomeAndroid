export type ThemeColors = {
  bg: string;
  card: string;
  text: string;
  subtext: string;
  primary: string;
  divider: string;
  success: string;
  warn: string;
  danger: string;
  border : string;
};

export const LIGHT: ThemeColors = {
  bg: '#F7FAFC',
  card: '#FFFFFF',
  text: '#0B1220',
  subtext: '#6B7280',
  primary: '#22C55E',
  divider: '#E5E7EB',
  success: '#10B981',
  warn: '#F59E0B',
  danger: '#EF4444',
  border: '#22C55E',
};

export const DARK: ThemeColors = {
  bg: '#22C55E',
  card: '#1C2541',
  text: '#E0E6F8',
  subtext: '#94A3B8',
  primary: '#5BC0BE',
  divider: '#1F2937',
  success: '#10B981',
  warn: '#F59E0B',
  danger: '#EF4444',
  border: '#22C55E',
};

/** Một số token phụ để tái sử dụng nếu cần */
export const tokens = {
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
  },
  spacing: {
    xs: 6,
    sm: 10,
    md: 12,
    lg: 16,
    xl: 20,
  },
};
