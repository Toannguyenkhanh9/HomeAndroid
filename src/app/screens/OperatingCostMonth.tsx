// src/app/screens/OperatingCostMonth.tsx
import React, {useEffect, useState, useMemo} from 'react';
import {View, Text, ScrollView, TextInput, Alert} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';
import {useThemeColors} from '../theme';
import {getOperatingMonth, saveOperatingMonth} from '../../services/rent';
import {useCurrency} from '../../utils/currency';
import {groupVN, onlyDigits} from '../../utils/number';

type Props = NativeStackScreenProps<RootStackParamList, 'OperatingCostMonth'>;

type Row = {
  id?: string | null;
  name: string;
  is_variable: number;   // 0 = cố định, 1 = không cố định
  amount: string;        // text formatted
  ad_hoc?: boolean;      // true = chỉ tháng này
};

export default function OperatingCostMonth({route, navigation}: Props) {
  const {apartmentId, ym} = route.params as any;
  const c = useThemeColors();
  const {format} = useCurrency();

  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const {items} = getOperatingMonth(apartmentId, ym);
    setRows(
      (items || []).map((i: any) => ({
        id: i.id,
        name: i.name,
        is_variable: Number(i.is_variable) || 0,
        amount: i.amount == null ? '' : groupVN(String(i.amount)),
        ad_hoc: !!i.ad_hoc, // nếu service có trả cờ
      })),
    );
    setLoaded(true);
  }, [apartmentId, ym]);

  // format ngay khi gõ
  const setAmountFmt = (idx: number, typed: string) => {
    const raw = onlyDigits(typed);
    const formatted = raw === '' ? '' : groupVN(String(Number(raw)));
    setRows(arr => arr.map((x, i) => (i === idx ? {...x, amount: formatted} : x)));
  };

  const updateName = (idx: number, name: string) =>
    setRows(arr => arr.map((x, i) => (i === idx ? {...x, name} : x)));

  const removeRow = (idx: number) => {
    const it = rows[idx];
    Alert.alert(
      'Xoá khoản chi',
      `Xoá “${it?.name || 'Khoản chi'}” khỏi tháng ${ym}? (Chỉ ảnh hưởng trong tháng này)`,
      [
        {text: 'Huỷ'},
        {
          text: 'Xoá',
          style: 'destructive',
          onPress: () => setRows(arr => arr.filter((_, i) => i !== idx)),
        },
      ],
    );
  };

  const addAdHocRow = () =>
    setRows(arr => [
      ...arr,
      {
        id: null,
        name: '',
        is_variable: 1, // mặc định: không cố định (nhập tay)
        amount: '',
        ad_hoc: true,   // đánh dấu chỉ-tháng-này
      },
    ]);

  const total = useMemo(
    () => rows.reduce((s, r) => s + (Number(onlyDigits(r.amount || '')) || 0), 0),
    [rows],
  );

  const save = () => {
    // Validate nhẹ cho các dòng ad-hoc
    const invalid = rows.find(r => r.ad_hoc && (!r.name.trim() || !(Number(onlyDigits(r.amount || '')) > 0)));
    if (invalid) {
      Alert.alert('Thiếu thông tin', 'Vui lòng điền tên và số tiền cho chi phí mới thêm.');
      return;
    }

    // Gửi danh sách mục còn lại của tháng
    const payload = rows.map(r => ({
      id: r.id ?? null,
      name: (r.name || '').trim(),
      is_variable: Number(r.is_variable) || 0,
      unit: null, // không dùng đơn vị
      amount: Number(onlyDigits(r.amount || '')) || 0,
      ad_hoc: r.ad_hoc ? 1 : 0,
    }));

    saveOperatingMonth(apartmentId, ym, payload);
    Alert.alert('Đã lưu', 'Chi phí tháng đã được cập nhật.', [
      {text: 'OK', onPress: () => navigation.goBack()},
    ]);
  };

  if (!loaded) {
    return (
      <View style={{flex: 1, backgroundColor: c.bg}}>
        <Header title={`Chi phí ${ym}`} />
      </View>
    );
  }

  return (
    <View style={{flex: 1, backgroundColor: c.bg}}>
      <Header title={`Chi phí ${ym}`} />
      <ScrollView contentContainerStyle={{padding: 12, gap: 12}}>
        <Card style={{gap: 10}}>
          <Text style={{color: c.text, fontWeight: '800'}}>Khoản chi</Text>

          {rows.map((r, idx) => (
            <View
              key={(r.id ?? 'new') + '-' + idx}
              style={{
                borderWidth: 1,
                borderColor: '#263042',
                borderRadius: 10,
                padding: 10,
                gap: 8,
              }}>
              <Text style={{color: c.text, fontWeight: '700'}}>
                {r.name || '—'}{' '}
                {r.ad_hoc ? '• (thêm trong tháng này)' : Number(r.is_variable) === 1 ? '• (không cố định)' : '• (cố định)'}
              </Text>

              {/* Tên chi phí */}
              <TextInput
                placeholder="Tên khoản chi"
                placeholderTextColor={c.subtext}
                value={r.name}
                onChangeText={t => updateName(idx, t)}
                style={{
                  borderWidth: 1,
                  borderColor: '#2A2F3A',
                  borderRadius: 10,
                  padding: 10,
                  color: c.text,
                  backgroundColor: c.card,
                }}
              />

              {/* Số tiền (tự format khi gõ) */}
              <TextInput
                keyboardType="numeric"
                value={r.amount}
                onChangeText={t => setAmountFmt(idx, t)}
                placeholder="Số tiền"
                placeholderTextColor={c.subtext}
                style={{
                  borderWidth: 1,
                  borderColor: '#2A2F3A',
                  borderRadius: 10,
                  padding: 10,
                  color: c.text,
                  backgroundColor: c.card,
                }}
              />

              <View style={{alignItems: 'flex-end'}}>
                <Button title="Xoá (tháng này)" variant="ghost" onPress={() => removeRow(idx)} />
              </View>
            </View>
          ))}

          <View style={{alignItems: 'flex-start'}}>
            <Button title="+ Thêm chi phí" variant="ghost" onPress={addAdHocRow} />
          </View>
        </Card>

        <Card>
          <Text style={{color: c.text, fontWeight: '700'}}>Tổng tháng: {format(total)}</Text>
        </Card>

        <View style={{flexDirection: 'row', justifyContent: 'flex-end', gap: 10}}>
          <Button title="Lưu" onPress={save} />
        </View>
      </ScrollView>
    </View>
  );
}
