// src/app/screens/ApartmentReport.tsx
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';
import { useThemeColors } from '../theme';
import { useCurrency } from '../../utils/currency';
import DateTimePicker from '@react-native-community/datetimepicker';

// (tuỳ code hiện tại của bạn) các service đang dùng để tính thu
import { getOperatingMonth } from '../../services/rent';
import { query } from '../../db';
import { onlyDigits } from '../../utils/number';

type Props = NativeStackScreenProps<RootStackParamList, 'ApartmentReport'>;

const toYMD = (d: Date) => d.toISOString().slice(0, 10);
const ymOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const firstDay = (y: number, m0: number) => new Date(y, m0, 1);
const lastDay = (y: number, m0: number) => new Date(y, m0 + 1, 0);

function prevMonthRange(): { from: Date; to: Date } {
  const now = new Date();
  const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const m0 = (now.getMonth() + 11) % 12; // tháng trước (0-based)
  return { from: firstDay(y, m0), to: lastDay(y, m0) };
}

// Trả về list các ym (YYYY-MM) giao với khoảng ngày
function monthsInRange(from: Date, to: Date): string[] {
  const a = new Date(from.getFullYear(), from.getMonth(), 1);
  const b = new Date(to.getFullYear(), to.getMonth(), 1);
  const out: string[] = [];
  while (a <= b) {
    out.push(ymOf(a));
    a.setMonth(a.getMonth() + 1);
  }
  return out;
}

export default function ApartmentReport({ route }: Props) {
  const { apartmentId } = route.params as any;
  const c = useThemeColors();
  const { format } = useCurrency();

  // mặc định tháng trước
  const def = useMemo(prevMonthRange, []);
  const [fromDate, setFromDate] = useState<Date>(def.from);
  const [toDate, setToDate] = useState<Date>(def.to);
  const [showFrom, setShowFrom] = useState(false);
  const [showTo, setShowTo] = useState(false);

  // ====== Thu (ví dụ: tổng theo phòng từ invoices trong khoảng) ======
  // Bạn có thể giữ nguyên logic cũ tính "Thu theo phòng" của bạn.
  const incomeByRoom = useMemo(() => {
    // ví dụ tham khảo: join invoices -> rooms
    const rows = query<any>(
      `
      SELECT r.code AS room_code, COALESCE(SUM(i.total),0) AS total
      FROM invoices i
      JOIN leases l ON l.id = i.lease_id
      JOIN rooms r  ON r.id = l.room_id
      WHERE r.apartment_id = ?
        AND date(i.issue_date) >= date(?)
        AND date(i.issue_date) <= date(?)
      GROUP BY r.code
      ORDER BY r.code ASC
      `,
      [apartmentId, toYMD(fromDate), toYMD(toDate)],
    );
    const total = rows.reduce((s, r) => s + (Number(r.total) || 0), 0);
    return { rows, total };
  }, [apartmentId, fromDate, toDate]);

  // ====== Chi phí hoạt động của căn hộ (lấy theo tháng trong khoảng) ======
  const operatingCost = useMemo(() => {
    const yms = monthsInRange(fromDate, toDate);
    let total = 0;
    const detail: Array<{ ym: string; name: string; amount: number }> = [];

    for (const ym of yms) {
      const { items } = getOperatingMonth(apartmentId, ym);
      for (const it of items || []) {
        const amt = Number(onlyDigits(String(it.amount ?? 0))) || 0;
        total += amt;
        detail.push({ ym, name: it.name, amount: amt });
      }
    }
    return { total, detail };
  }, [apartmentId, fromDate, toDate]);

  const finalBalance = useMemo(() => incomeByRoom.total - operatingCost.total, [incomeByRoom.total, operatingCost.total]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>

        {/* Khoảng thời gian + DateTimePicker */}
        <Card>
          <Text style={{ color: c.text, fontWeight: '800', marginBottom: 8 }}>Khoảng thời gian</Text>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setShowFrom(true)}
            style={{
              borderWidth: 1,
              borderColor: '#2A2F3A',
              borderRadius: 10,
              padding: 10,
              backgroundColor: c.card,
              marginBottom: 8,
            }}
          >
            <Text style={{ color: c.text }}>{toYMD(fromDate)}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setShowTo(true)}
            style={{
              borderWidth: 1,
              borderColor: '#2A2F3A',
              borderRadius: 10,
              padding: 10,
              backgroundColor: c.card,
            }}
          >
            <Text style={{ color: c.text }}>{toYMD(toDate)}</Text>
          </TouchableOpacity>

          {showFrom && (
            <DateTimePicker
              value={fromDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(_, d) => {
                setShowFrom(false);
                if (d) setFromDate(d);
              }}
            />
          )}
          {showTo && (
            <DateTimePicker
              value={toDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(_, d) => {
                setShowTo(false);
                if (d) setToDate(d);
              }}
            />
          )}

          <View style={{ alignItems: 'flex-end', marginTop: 10 }}>
            <Button title="Xem báo cáo" onPress={() => { /* dữ liệu tính theo state nên không cần gì thêm */ }} />
          </View>
        </Card>

        {/* Thu theo phòng */}
        <Card style={{ gap: 8 }}>
          <Text style={{ color: c.text, fontWeight: '800' }}>Thu theo phòng</Text>
          {incomeByRoom.rows.length === 0 ? (
            <Text style={{ color: c.subtext }}>—</Text>
          ) : (
            incomeByRoom.rows.map((r, i) => (
              <View key={i} style={{ borderWidth: 1, borderColor: '#263042', borderRadius: 10, padding: 10 }}>
                <Text style={{ color: c.text, fontWeight: '700' }}>Phòng {r.room_code}</Text>
                <Text style={{ color: c.subtext }}>
                  Tổng thu: <Text style={{ color: c.text }}>{format(Number(r.total) || 0)}</Text>
                </Text>
              </View>
            ))
          )}
          <Text style={{ color: c.text, marginTop: 6 }}>Tổng thu: {format(incomeByRoom.total)}</Text>
        </Card>

        {/* Chi của căn hộ */}
        <Card style={{ gap: 8 }}>
          <Text style={{ color: c.text, fontWeight: '800' }}>Chi của căn hộ</Text>
          {operatingCost.detail.length === 0 ? (
            <Text style={{ color: c.subtext }}>—</Text>
          ) : (
            operatingCost.detail.map((d, idx) => (
              <View key={idx} style={{ borderWidth: 1, borderColor: '#263042', borderRadius: 10, padding: 10 }}>
                <Text style={{ color: c.text, fontWeight: '700' }}>
                  {d.ym} — {d.name}
                </Text>
                <Text style={{ color: c.subtext }}>
                  Số tiền: <Text style={{ color: c.text }}>{format(d.amount)}</Text>
                </Text>
              </View>
            ))
          )}
          <Text style={{ color: c.text, marginTop: 6 }}>Tổng chi: {format(operatingCost.total)}</Text>
        </Card>

        {/* Số dư */}
        <Card>
          <Text style={{ color: c.text, fontWeight: '700' }}>Số dư cuối cùng: {format(finalBalance)}</Text>
        </Card>
      </ScrollView>
    </View>
  );
}
