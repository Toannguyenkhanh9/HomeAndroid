let _t: (key: string, params?: any) => string = (k) => k; // fallback

export function setTranslator(fn: (key: string, params?: any) => string) {
  _t = fn;
}

// Dùng ở khắp nơi (service, utils…)
export function t(key: string, params?: any) {
  try {
    return _t(key, params);
  } catch {
    return key;
  }
}
