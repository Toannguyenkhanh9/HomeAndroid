// src/services/leaseSignatures.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

export type LeaseSignatures = { tenant?: string; landlord?: string };

const k = (leaseId: string) => `lease_signatures_${leaseId}`;

export async function loadLeaseSignatures(leaseId: string): Promise<LeaseSignatures> {
  try {
    const raw = await AsyncStorage.getItem(k(leaseId));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export async function saveLeaseSignatures(leaseId: string, patch: LeaseSignatures) {
  const cur = await loadLeaseSignatures(leaseId);
  const next = { ...cur, ...patch };
  await AsyncStorage.setItem(k(leaseId), JSON.stringify(next));
  return next;
}

export async function clearLeaseSignatures(leaseId: string) {
  try { await AsyncStorage.removeItem(k(leaseId)); } catch {}
}
