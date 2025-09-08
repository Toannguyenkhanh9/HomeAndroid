import React, {useMemo, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Platform,
  Switch,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';
import {useThemeColors} from '../theme';
import {groupVN, onlyDigits} from '../../utils/number';
import {startLease, addRecurringCharge} from '../../services/rent';
import ChargeChooserModal from '../components/ChargeChooserModal';
import DateTimePicker from '@react-native-community/datetimepicker';

type Props = NativeStackScreenProps<RootStackParamList, 'LeaseForm'>;

type Billing = 'daily' | 'monthly' | 'yearly';

type SelectedEntry = {
  id: string;
  name: string;
  isVariable: boolean;
  unit?: string | null;
  price?: number;
  meterStart?: number;
};

export default function LeaseForm({route, navigation}: Props) {
  const {roomId} = route.params as any;
  const c = useThemeColors();

  // Tenant
  const [tenantName, setTenantName] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [tenantPhone, setTenantPhone] = useState('');

  // Có thời hạn / Không có thời hạn
  const [hasTerm, setHasTerm] = useState(true);

  // Chu kỳ thanh toán
  const [billing, setBilling] = useState<Billing>('monthly');

  // Ngày bắt đầu
  const [startDate, setStartDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const startYMD = useMemo(() => startDate.toISOString().slice(0, 10), [startDate]);

  // Thời lượng (chỉ hiển thị khi có thời hạn)
  const [durationText, setDurationText] = useState('');

  // Giá cơ bản & cọc
  const [baseRentText, setBaseRentText] = useState('');
  const [depositText, setDepositText] = useState('');

  // Bao toàn bộ phí
  const [allIn, setAllIn] = useState(false);
  const [allInAmountText, setAllInAmountText] = useState('');

  // Chọn phí (khi không bao phí)
  const [openCharges, setOpenCharges] = useState(false);
  const [charges, setCharges] = useState<SelectedEntry[]>([]);

  const durationLabel = billing === 'daily' ? 'Số ngày' : billing === 'monthly' ? 'Số tháng' : 'Số năm';

  const Tab = ({
    title,
    active,
    onPress,
  }: {
    title: string;
    active: boolean;
    onPress: () => void;
  }) => (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 10,
        backgroundColor: active ? c.primary : 'transparent',
        borderWidth: 1,
        borderColor: active ? 'transparent' : '#2A2F3A',
      }}>
      <Text style={{color: active ? '#fff' : c.text, fontWeight: '700'}}>{title}</Text>
    </TouchableOpacity>
  );

  function onSave() {
    const baseRent = Number(onlyDigits(baseRentText)) || 0;
    const deposit = Number(onlyDigits(depositText)) || 0;
    const allInAmount = Number(onlyDigits(allInAmountText)) || 0;

    // Xác định loại hợp đồng/chu kỳ
    const lease_type = hasTerm && billing === 'daily' ? 'short_term' : 'long_term';
    const durationDays =
      hasTerm && billing === 'daily'
        ? Math.max(1, Number(onlyDigits(durationText)) || 0)
        : undefined;

    const leaseId = startLease(
      roomId,
      lease_type,
      startYMD,
      billing,
      baseRent,
      deposit,
      durationDays,
      allIn,
      allIn ? (allInAmount || baseRent) : undefined,
    );

    if (!allIn && charges.length > 0) {
      charges.forEach(ch => {
        const price = Number(ch.price || 0);
        if (ch.isVariable) {
          addRecurringCharge(leaseId, ch.id, price, 1, {meterStart: Number(ch.meterStart || 0)});
        } else {
          if (ch.name?.toLowerCase() === 'tiền phòng') return; // tránh trùng với baseRent
          addRecurringCharge(leaseId, ch.id, price, 0);
        }
      });
    }

    navigation.goBack();
  }

  return (
    <View style={{flex: 1, backgroundColor: c.bg}}>
      <Header title="Tạo hợp đồng" />

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding: 12, gap: 12}}>
        {/* Thông tin người thuê */}
        <Card>
          <Text style={{color: c.text, fontWeight: '800', marginBottom: 8}}>Thông tin người thuê</Text>
          <TextInput
            placeholder="Tên người thuê"
            placeholderTextColor={c.subtext}
            value={tenantName}
            onChangeText={setTenantName}
            style={{borderWidth: 1, borderColor: '#2A2F3A', borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card, marginBottom: 8}}
          />
          <TextInput
            placeholder="Số CCCD/CMND"
            placeholderTextColor={c.subtext}
            value={tenantId}
            onChangeText={setTenantId}
            style={{borderWidth: 1, borderColor: '#2A2F3A', borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card, marginBottom: 8}}
          />
          <TextInput
            placeholder="Số điện thoại"
            placeholderTextColor={c.subtext}
            keyboardType="phone-pad"
            value={tenantPhone}
            onChangeText={setTenantPhone}
            style={{borderWidth: 1, borderColor: '#2A2F3A', borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card}}
          />
        </Card>

        {/* Loại hợp đồng */}
        <Card>
          <Text style={{color: c.text, fontWeight: '800', marginBottom: 8}}>Loại hợp đồng</Text>
          <View style={{flexDirection: 'row', gap: 10}}>
            <Tab title="Có thời hạn" active={hasTerm} onPress={() => setHasTerm(true)} />
            <Tab title="Không có thời hạn" active={!hasTerm} onPress={() => setHasTerm(false)} />
          </View>

          {/* Chu kỳ: ẩn khi không có thời hạn */}
          {hasTerm && (
            <>
              <Text style={{color: c.text, fontWeight: '800', marginVertical: 10}}>Chu kỳ</Text>
              <View style={{flexDirection: 'row', gap: 10}}>
                <Tab title="Ngày" active={billing === 'daily'} onPress={() => setBilling('daily')} />
                <Tab title="Tháng" active={billing === 'monthly'} onPress={() => setBilling('monthly')} />
                <Tab title="Năm" active={billing === 'yearly'} onPress={() => setBilling('yearly')} />
              </View>
            </>
          )}

          {/* Ngày bắt đầu — luôn hiển thị */}
          <Text style={{color: c.text, marginTop: 12, marginBottom: 6}}>Ngày bắt đầu</Text>
          <TouchableOpacity
            onPress={() => setShowPicker(true)}
            style={{borderWidth: 1, borderColor: '#2A2F3A', borderRadius: 10, padding: 12, backgroundColor: c.card}}>
            <Text style={{color: c.text}}>{startYMD}</Text>
          </TouchableOpacity>
          {showPicker && (
            <DateTimePicker
              value={startDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={(e, d) => {
                setShowPicker(false);
                if (d) setStartDate(d);
              }}
            />
          )}

          {/* Thời lượng — chỉ khi Có thời hạn */}
          {hasTerm && (
            <>
              <Text style={{color: c.text, marginTop: 12, marginBottom: 6}}>{durationLabel}</Text>
              <TextInput
                keyboardType="numeric"
                value={durationText}
                onChangeText={setDurationText}
                onBlur={() => setDurationText(groupVN(durationText))}
                placeholderTextColor={c.subtext}
                style={{borderWidth: 1, borderColor: '#2A2F3A', borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card}}
              />
            </>
          )}

          {/* Giá thuê cơ bản & tiền cọc */}
          <Text style={{color: c.text, marginTop: 12, marginBottom: 6}}>Giá thuê cơ bản (tiền nhà)</Text>
          <TextInput
            keyboardType="numeric"
            value={baseRentText}
            onChangeText={setBaseRentText}
            onBlur={() => setBaseRentText(groupVN(baseRentText))}
            placeholderTextColor={c.subtext}
            style={{borderWidth: 1, borderColor: '#2A2F3A', borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card}}
          />

          <Text style={{color: c.text, marginTop: 12, marginBottom: 6}}>Tiền cọc</Text>
          <TextInput
            keyboardType="numeric"
            value={depositText}
            onChangeText={setDepositText}
            onBlur={() => setDepositText(groupVN(depositText))}
            placeholderTextColor={c.subtext}
            style={{borderWidth: 1, borderColor: '#2A2F3A', borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card}}
          />

          {/* Bao toàn bộ phí */}
          <View style={{flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:12}}>
            <Text style={{color:c.text, fontWeight:'700'}}>Bao toàn bộ phí</Text>
            <Switch value={allIn} onValueChange={setAllIn} />
          </View>

          {!allIn ? (
            <TouchableOpacity
              onPress={() => setOpenCharges(true)}
              style={{marginTop:10, padding:12, borderWidth:1, borderColor:'#2A2F3A', borderRadius:10, backgroundColor:c.card}}>
              <Text style={{color:c.subtext}}>Chọn các khoản phí (cố định/không cố định)</Text>
            </TouchableOpacity>
          ) : (
            <>
              <Text style={{color:c.text, marginTop:12, marginBottom:6}}>Tổng phí trọn gói</Text>
              <TextInput
                keyboardType="numeric"
                value={allInAmountText}
                onChangeText={setAllInAmountText}
                onBlur={()=> setAllInAmountText(groupVN(allInAmountText))}
                placeholderTextColor={c.subtext}
                style={{borderWidth:1, borderColor:'#2A2F3A', borderRadius:10, padding:10, color:c.text, backgroundColor:c.card}}
              />
            </>
          )}
        </Card>

        {/* Action */}
        <View style={{alignItems:'flex-end', marginBottom:24}}>
          <Button title="Lưu" onPress={onSave} />
        </View>
      </ScrollView>

      {/* Modal chọn phí */}
      <ChargeChooserModal
        visible={openCharges}
        onClose={()=> setOpenCharges(false)}
        initialSelected={charges}
        onConfirm={(list)=> setCharges(list)}
      />
    </View>
  );
}
