// src/app/screens/LeaseForm.tsx
import React, {useMemo, useState} from 'react';
import {View, Text, TextInput, ScrollView, Alert, TouchableOpacity, Platform} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import Card from '../components/Card';
import Button from '../components/Button';
import {useThemeColors} from '../theme';
import {useCurrency} from '../../utils/currency';
import {startLeaseAdvanced} from '../../services/rent';
import DateTimePicker from '@react-native-community/datetimepicker';
import {useSettings} from '../state/SettingsContext';
import {formatDateISO} from '../../utils/date';

type Props = NativeStackScreenProps<RootStackParamList, 'LeaseForm'>;

type ChargeDraft = {
  name: string;
  isVariable: boolean;
  unit?: string;
  price?: string;
  meterStart?: string;
};

// format số khi gõ
function formatTyping(s: string) {
  const digits = s.replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('vi-VN');
}

// parse số (loại bỏ hết ký tự không phải số)
function parseAmount(s: string) {
  const digits = (s || '').replace(/\D/g, '');
  return digits ? Number(digits) : 0;
}

export default function LeaseForm({route, navigation}: Props) {
  const {dateFormat, language} = useSettings();
  const roomId = (route.params as any)?.roomId;
  const c = useThemeColors();
  const {format} = useCurrency();

  const [fullName, setFullName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [phone, setPhone] = useState('');

  const [mode, setMode] = useState<'monthly' | 'daily'>('monthly');
  const [startISO, setStartISO] = useState(new Date().toISOString().slice(0, 10));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [months, setMonths] = useState('12');
  const [days, setDays] = useState('');

  const [collect, setCollect] = useState<'start' | 'end'>('start');

  const [baseRentText, setBaseRentText] = useState('');
  const [depositText, setDepositText] = useState('');

  const [allInclusive, setAllInclusive] = useState(false);
  const [allInclusiveAmount, setAllInclusiveAmount] = useState('');

  const [charges, setCharges] = useState<ChargeDraft[]>([]);
  const addCharge = () =>
    setCharges(p => [...p, {name: '', isVariable: false, unit: 'tháng', price: ''}]);
  const updCharge = (i: number, patch: Partial<ChargeDraft>) =>
    setCharges(p => p.map((x, idx) => (idx === i ? {...x, ...patch} : x)));
  const delCharge = (i: number) => setCharges(p => p.filter((_, idx) => idx !== i));

  const durationHint = useMemo(() => {
    if (mode === 'daily') {
      const n = parseAmount(days);
      return n > 0 ? `${n} ngày` : '—';
    }
    const m = parseAmount(months);
    return m > 0 ? `${m} tháng` : '—';
  }, [mode, days, months]);

  function validate(): string | null {
    if (!roomId) return 'Thiếu roomId';
    if (!startISO) return 'Chưa nhập ngày bắt đầu';
    if (mode === 'monthly') {
      const m = parseAmount(months);
      if (m <= 0) return 'Số tháng phải > 0';
    } else {
      const d = parseAmount(days);
      if (d <= 0) return 'Số ngày phải > 0';
    }
    if (allInclusive) {
      const pack = parseAmount(allInclusiveAmount);
      if (pack <= 0) return 'Nhập số tiền trọn gói hợp lệ';
      return null;
    }
    const base = parseAmount(baseRentText);
    if (base <= 0) return 'Nhập giá thuê cơ bản hợp lệ';
    return null;
  }

  function submit() {
    const err = validate();
    if (err) {
      Alert.alert('Thiếu thông tin', err);
      return;
    }

    const baseRent = allInclusive ? parseAmount(allInclusiveAmount) : parseAmount(baseRentText);
    const deposit = parseAmount(depositText);

    const outCharges: NonNullable<
      Parameters<typeof startLeaseAdvanced>[0]
    >['charges'] = !allInclusive
      ? charges
          .filter(ch => ch.name.trim() && parseAmount(ch.price || '') > 0)
          .map(ch => ({
            name: ch.name.trim(),
            type: ch.isVariable ? 'variable' : 'fixed',
            unit: ch.unit || (ch.isVariable ? 'đv' : 'tháng'),
            unitPrice: parseAmount(ch.price || ''),
            meterStart: ch.isVariable ? parseAmount(ch.meterStart || '') : undefined,
          }))
      : undefined;

    const payload = {
      roomId,
      leaseType: 'long_term' as const,
      billing: mode,
      startDateISO: startISO,
      baseRent,
      baseRentCollect: collect,
      deposit,
      durationDays: mode === 'daily' ? parseAmount(days) || 1 : undefined,
      endDateISO:
        mode === 'monthly'
          ? (() => {
              const s = new Date(startISO);
              const m = parseAmount(months);
              const end = new Date(s);
              end.setMonth(end.getMonth() + m);
              end.setDate(end.getDate() - 1);
              return end.toISOString().slice(0, 10);
            })()
          : undefined,
      tenant: fullName
        ? {full_name: fullName.trim(), id_number: idNumber.trim(), phone: phone.trim()}
        : undefined,
      charges: outCharges,
      isAllInclusive: allInclusive,
    };

    try {
      const leaseId = startLeaseAdvanced(payload as any);
      Alert.alert('Thành công', 'Đã tạo hợp đồng', [
        {text: 'OK', onPress: () => navigation.replace('LeaseDetail', {leaseId})},
      ]);
    } catch (e: any) {
      Alert.alert('Lỗi', String(e?.message || e));
    }
  }

  return (
    <View style={{flex: 1, backgroundColor: 'transparent'}}>
      <ScrollView contentContainerStyle={{padding: 12, gap: 12}}>
        {/* Khách thuê */}
        <Card style={{gap: 8}}>
          <TextInput
            placeholder="Tên người thuê"
            placeholderTextColor={c.subtext}
            value={fullName}
            onChangeText={setFullName}
            style={{borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card}}
          />
          <TextInput
            placeholder="Số CCCD/CMND"
            placeholderTextColor={c.subtext}
            value={idNumber}
            onChangeText={setIdNumber}
            style={{borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card}}
          />
          <TextInput
            placeholder="Số điện thoại"
            placeholderTextColor={c.subtext}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            style={{borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card}}
          />
        </Card>

        {/* Loại chu kỳ & thời hạn */}
        <Card style={{gap: 10}}>
          <Text style={{color: c.text, fontWeight: '800'}}>Loại hợp đồng</Text>
          <View style={{flexDirection: 'row', gap: 8}}>
            {(['monthly', 'daily'] as const).map(k => (
              <TouchableOpacity
                key={k}
                onPress={() => setMode(k)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                  backgroundColor: mode === k ? '#1f6feb' : c.card,
                }}>
                <Text style={{color: mode === k ? 'white' : c.text}}>
                  {k === 'monthly' ? 'Tháng' : 'Ngày'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={{color: c.subtext, marginTop: 6}}>Ngày bắt đầu</Text>
          <TouchableOpacity
            onPress={() => setShowDatePicker(true)}
            style={{
              borderRadius: 10,
              padding: 10,
              backgroundColor: c.card,
            }}>
            <Text style={{color: c.text}}>{formatDateISO(startISO, dateFormat, language)}</Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={new Date(startISO)}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(event, date) => {
                setShowDatePicker(false);
                if (date) {
                  setStartISO(date.toISOString().slice(0, 10));
                }
              }}
            />
          )}

          {mode === 'monthly' ? (
            <>
              <Text style={{color: c.subtext, marginTop: 6}}>Số tháng</Text>
              <TextInput
                keyboardType="numeric"
                value={months}
                onChangeText={setMonths}
                style={{borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card}}
              />
            </>
          ) : (
            <>
              <Text style={{color: c.subtext, marginTop: 6}}>Số ngày</Text>
              <TextInput
                keyboardType="numeric"
                value={days}
                onChangeText={setDays}
                style={{borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card}}
              />
            </>
          )}

          <Text style={{color: c.subtext}}>Thời hạn: {durationHint}</Text>
        </Card>

        {/* Thu tiền nhà */}
        <Card>
          <Text style={{color: c.text, fontWeight: '800', marginBottom: 8}}>Thu tiền nhà</Text>
          <View style={{flexDirection: 'row', gap: 8}}>
            {(['start', 'end'] as const).map(k => (
              <TouchableOpacity
                key={k}
                onPress={() => setCollect(k)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                  backgroundColor: collect === k ? '#10b981' : c.card,
                }}>
                <Text style={{color: collect === k ? 'white' : c.text}}>
                  {k === 'start' ? 'Đầu kỳ' : 'Cuối kỳ'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* PHÍ TRỌN GÓI */}
        <Card style={{gap: 8}}>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
            <Text style={{color: c.text, fontWeight: '800'}}>Phí trọn gói</Text>
            <TouchableOpacity
              onPress={() => setAllInclusive(v => !v)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: allInclusive ? '#0ea5e9' : c.card,
              }}>
              <Text style={{color: allInclusive ? 'white' : c.text}}>
                {allInclusive ? 'Bật' : 'Tắt'}
              </Text>
            </TouchableOpacity>
          </View>

          {allInclusive ? (
            <>
              <Text style={{color: c.subtext}}>Số tiền trọn gói (thay cho tiền nhà)</Text>
              <TextInput
                keyboardType="numeric"
                value={allInclusiveAmount}
                onChangeText={t => setAllInclusiveAmount(formatTyping(t))}
                placeholder="VD: 3.000.000 đ"
                placeholderTextColor={c.subtext}
                style={{borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card}}
              />
            </>
          ) : (
            <>
              <Text style={{color: c.subtext}}>Giá thuê cơ bản (tiền nhà)</Text>
              <TextInput
                keyboardType="numeric"
                value={baseRentText}
                onChangeText={t => setBaseRentText(formatTyping(t))}
                placeholder="VD: 3.000.000 đ"
                placeholderTextColor={c.subtext}
                style={{borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card}}
              />
            </>
          )}

          <Text style={{color: c.subtext, marginTop: 6}}>Tiền cọc</Text>
          <TextInput
            keyboardType="numeric"
            value={depositText}
            onChangeText={t => setDepositText(formatTyping(t))}
            placeholder="0"
            placeholderTextColor={c.subtext}
            style={{borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card}}
          />
        </Card>

        {/* CHARGES */}
        {!allInclusive && (
          <Card style={{gap: 10}}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
              <Text style={{color: c.text, fontWeight: '800'}}>Chọn các khoản phí</Text>
              <Button title="+ Thêm" onPress={addCharge} />
            </View>

            {charges.map((ch, idx) => (
              <View key={idx} style={{borderRadius: 10, padding: 10, gap: 8}}>
                <TextInput
                  placeholder="Tên phí (VD: Điện, Nước...)"
                  placeholderTextColor={c.subtext}
                  value={ch.name}
                  onChangeText={t => updCharge(idx, {name: t})}
                  style={{borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card}}
                />

                <View style={{flexDirection: 'row', gap: 8}}>
                  <TouchableOpacity
                    onPress={() => updCharge(idx, {isVariable: false, unit: 'tháng'})}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 10,
                      backgroundColor: ch.isVariable ? c.card : '#10b981',
                    }}>
                    <Text style={{color: ch.isVariable ? c.text : 'white'}}>Cố định</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => updCharge(idx, {isVariable: true, unit: 'đv'})}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 10,
                      backgroundColor: ch.isVariable ? '#10b981' : c.card,
                    }}>
                    <Text style={{color: ch.isVariable ? 'white' : c.text}}>Biến đổi</Text>
                  </TouchableOpacity>
                </View>

                <Text style={{color: c.subtext}}>
                  {ch.isVariable ? 'Đơn giá / đơn vị' : 'Đơn giá / kỳ'}
                </Text>
                <TextInput
                  keyboardType="numeric"
                  value={ch.price}
                  onChangeText={t => updCharge(idx, {price: formatTyping(t)})}
                  style={{borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card}}
                />

                {ch.isVariable && (
                  <>
                    <Text style={{color: c.subtext}}>Chỉ số đầu</Text>
                    <TextInput
                      keyboardType="numeric"
                      value={ch.meterStart}
                      onChangeText={t => updCharge(idx, {meterStart: formatTyping(t)})}
                      style={{borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card}}
                    />
                  </>
                )}

                <Button title="Xoá" variant="ghost" onPress={() => delCharge(idx)} />
              </View>
            ))}
          </Card>
        )}

        {/* ACTIONS */}
        <View style={{flexDirection: 'row', justifyContent: 'flex-end', gap: 12}}>
          <Button title="Huỷ" variant="ghost" onPress={() => navigation.goBack()} />
          <Button title="Tạo hợp đồng" onPress={submit} />
        </View>
      </ScrollView>
    </View>
  );
}
