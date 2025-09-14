// src/app/screens/LeaseHistoryDetail.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import Header from '../components/Header';
import Card from '../components/Card';
import { useThemeColors } from '../theme';
import { useCurrency } from '../../utils/currency';
import { getLease, listCycles, getLeaseSettlement } from '../../services/rent';

type Props = NativeStackScreenProps<RootStackParamList, 'LeaseHistoryDetail'>;

export default function LeaseHistoryDetail({ route, navigation }: Props) {
  const { leaseId } = route.params;
  const c = useThemeColors();
  const { format } = useCurrency();

  const [lease, setLease] = useState<any>();
  const [cycles, setCycles] = useState<any[]>([]);
  const [settle, setSettle] = useState<any | null>(null);

  useEffect(() => {
    try {
      setLease(getLease(leaseId));
      setCycles(listCycles(leaseId) || []);
      setSettle(getLeaseSettlement(leaseId) || null);
    } catch {}
  }, [leaseId]);

  // Parse danh sách phụ phí lưu trong details_json (nếu có)
  const adjustments: Array<{ name: string; amount: number }> = useMemo(() => {
    if (!settle) return [];
    // hỗ trợ cả settle.adjustments (nếu đã được map sẵn ở nơi khác)
    if (Array.isArray((settle as any).adjustments)) {
      return (settle as any).adjustments.map((x: any) => ({
        name: String(x?.name || ''),
        amount: Number(x?.amount || 0),
      }));
    }
    try {
      const raw = settle.details_json ? JSON.parse(settle.details_json) : [];
      if (Array.isArray(raw)) {
        return raw.map((x: any) => ({
          name: String(x?.name || ''),
          amount: Number(x?.amount || 0),
        }));
      }
    } catch {}
    return [];
  }, [settle]);

  const adjustmentsTotal = useMemo(() => {
    // ưu tiên trường DB, fallback tính từ mảng
    const dbTotal = Number(settle?.adjustments_total ?? NaN);
    if (!Number.isNaN(dbTotal)) return dbTotal;
    return adjustments.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  }, [settle, adjustments]);

  const endProjected = useMemo(() => {
    if (!lease) return '—';
    if (lease.end_date) return lease.end_date;
    try {
      const s = new Date(lease.start_date);
      if (lease.billing_cycle === 'monthly') {
        const e = new Date(s);
        e.setMonth(e.getMonth() + 1);
        e.setDate(e.getDate() - 1);
        return e.toISOString().slice(0, 10);
      }
      if (lease.billing_cycle === 'daily') {
        const e = new Date(s);
        e.setDate(e.getDate() + Math.max(1, Number(lease.duration_days || 1)) - 1);
        return e.toISOString().slice(0, 10);
      }
      const e = new Date(s);
      e.setFullYear(e.getFullYear() + 1);
      e.setDate(e.getDate() - 1);
      return e.toISOString().slice(0, 10);
    } catch {
      return '—';
    }
  }, [lease]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }} showsVerticalScrollIndicator>
        <Card>
          <Text style={{ color: c.text }}>Bắt đầu: {lease?.start_date || '—'}</Text>
          <Text style={{ color: c.text }}>Kết thúc: {lease?.end_date || '—'}</Text>
          <Text style={{ color: c.text }}>Kết thúc dự kiến: {endProjected}</Text>
          <Text style={{ color: c.text }}>Trạng thái: {lease?.status}</Text>
          <Text style={{ color: c.text }}>Chu kỳ: {lease?.billing_cycle}</Text>
          <Text style={{ color: c.text }}>Giá thuê cơ bản: {format(lease?.base_rent || 0)}</Text>
          <Text style={{ color: c.text }}>Tiền cọc: {format(lease?.deposit_amount || 0)}</Text>
        </Card>

        <Card style={{ gap: 8 }}>
          <Text style={{ color: c.text, fontWeight: '800' }}>Các chu kỳ</Text>
          {cycles.length === 0 ? (
            <Text style={{ color: c.subtext }}>—</Text>
          ) : (
            cycles.map(cy => (
              <TouchableOpacity
                key={cy.id}
                onPress={() => navigation.navigate('CycleDetail', { cycleId: cy.id })}
                activeOpacity={0.7}
              >
                <View style={{ borderWidth: 1, borderColor: '#263042', borderRadius: 10, padding: 10 }}>
                  <Text style={{ color: c.text, fontWeight: '700' }}>
                    {cy.period_start} → {cy.period_end}
                  </Text>
                  <Text style={{ color: c.subtext }}>
                    Trạng thái: <Text style={{ color: c.text }}>{cy.status}</Text>
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </Card>

        <Card style={{ gap: 8 }}>
          <Text style={{ color: c.text, fontWeight: '800' }}>Quyết toán khi kết thúc</Text>
          {settle ? (
            <>
              <Text style={{ color: c.text }}>Tiền cọc: {format(Number(settle.deposit || 0))}</Text>

              <View style={{ marginTop: 6, gap: 6 }}>
                <Text style={{ color: c.text, fontWeight: '700' }}>Các khoản phụ phí</Text>
                {adjustments.length > 0 ? (
                  adjustments.map((it, idx) => (
                    <View
                      key={`${it.name}-${idx}`}
                      style={{ borderWidth: 1, borderColor: '#263042', borderRadius: 10, padding: 8 }}
                    >
                      <Text style={{ color: c.text, fontWeight: '600' }}>
                        {it.name || 'Khoản phí'}
                      </Text>
                      <Text style={{ color: c.subtext }}>
                        Số tiền:{' '}
                        <Text style={{ color: c.text }}>{format(Number(it.amount) || 0)}</Text>
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={{ color: c.subtext }}>Không có phụ phí.</Text>
                )}
              </View>

              <Text style={{ color: c.text, marginTop: 6 }}>
                Tổng phụ phí: {format(adjustmentsTotal)}
              </Text>

              {Number(settle.final_balance) > 0 && (
                <Text style={{ color: c.text }}>
                  Số tiền trả lại khách: {format(Number(settle.final_balance))}
                </Text>
              )}
              {Number(settle.final_balance) < 0 && (
                <Text style={{ color: c.text }}>
                  Cần thu thêm của khách: {format(Math.abs(Number(settle.final_balance)))}
                </Text>
              )}
              {Number(settle.final_balance) === 0 && (
                <Text style={{ color: c.text }}>Không phát sinh thêm.</Text>
              )}
            </>
          ) : (
            <Text style={{ color: c.subtext }}>— Chưa có dữ liệu quyết toán.</Text>
          )}
        </Card>
      </ScrollView>
    </View>
  );
}
