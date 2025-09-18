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
import {useTranslation} from 'react-i18next';

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
  const {t} = useTranslation();
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
      return n > 0 ? `${n} ${t('leaseForm.days')}` : '—';
    }
    const m = parseAmount(months);
    return m > 0 ? `${m} ${t('leaseForm.months')}` : '—';
  }, [mode, days, months, t]);

  function validate(): string | null {
    if (!roomId) return t('leaseForm.errorMissingRoomId');
    if (!startISO) return t('leaseForm.errorMissingStart');
    if (mode === 'monthly') {
      const m = parseAmount(months);
      if (m <= 0) return t('leaseForm.errorMonths');
    } else {
      const d = parseAmount(days);
      if (d <= 0) return t('leaseForm.errorDays');
    }
    if (allInclusive) {
      const pack = parseAmount(allInclusiveAmount);
      if (pack <= 0) return t('leaseForm.errorAllInclusive');
      return null;
    }
    const base = parseAmount(baseRentText);
    if (base <= 0) return t('leaseForm.errorBaseRent');
    return null;
  }

  function submit() {
    const err = validate();
    if (err) {
      Alert.alert(t('common.missingInfo'), err);
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
      Alert.alert(t('common.success'), t('leaseForm.created'), [
        {text: 'OK', onPress: () => navigation.replace('LeaseDetail', {leaseId})},
      ]);
    } catch (e: any) {
      Alert.alert(t('common.error'), String(e?.message || e));
    }
  }

  return (
    <View style={{flex: 1, backgroundColor: 'transparent'}}>
      <ScrollView contentContainerStyle={{padding: 12, gap: 12}}>
        {/* Khách thuê */}
        <Card style={{gap: 8}}>
          <TextInput
            placeholder={t('leaseForm.tenantName')}
            placeholderTextColor={c.subtext}
            value={fullName}
            onChangeText={setFullName}
            style={{borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card}}
          />
          <TextInput
            placeholder={t('leaseForm.idNumber')}
            placeholderTextColor={c.subtext}
            value={idNumber}
            onChangeText={setIdNumber}
            style={{borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card}}
          />
          <TextInput
            placeholder={t('leaseForm.phone')}
            placeholderTextColor={c.subtext}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            style={{borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card}}
          />
        </Card>

        {/* Loại chu kỳ & thời hạn */}
        <Card style={{gap: 10}}>
          <Text style={{color: c.text, fontWeight: '800'}}>{t('leaseForm.contractType')}</Text>
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
                  {k === 'monthly' ? t('leaseForm.monthly') : t('leaseForm.daily')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={{color: c.subtext, marginTop: 6}}>{t('leaseForm.startDate')}</Text>
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
              <Text style={{color: c.subtext, marginTop: 6}}>{t('leaseForm.monthCount')}</Text>
              <TextInput
                keyboardType="numeric"
                value={months}
                onChangeText={setMonths}
                style={{borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card}}
              />
            </>
          ) : (
            <>
              <Text style={{color: c.subtext, marginTop: 6}}>{t('leaseForm.dayCount')}</Text>
              <TextInput
                keyboardType="numeric"
                value={days}
                onChangeText={setDays}
                style={{borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card}}
              />
            </>
          )}

          <Text style={{color: c.subtext}}>
            {t('leaseForm.duration')}: {durationHint}
          </Text>
        </Card>

        {/* Thu tiền nhà */}
        <Card>
          <Text style={{color: c.text, fontWeight: '800', marginBottom: 8}}>{t('leaseForm.collectRent')}</Text>
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
                  {k === 'start' ? t('leaseForm.collectStart') : t('leaseForm.collectEnd')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* PHÍ TRỌN GÓI */}
        <Card style={{gap: 8}}>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
            <Text style={{color: c.text, fontWeight: '800'}}>{t('leaseForm.allInclusive')}</Text>
            <TouchableOpacity
              onPress={() => setAllInclusive(v => !v)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: allInclusive ? '#0ea5e9' : c.card,
              }}>
              <Text style={{color: allInclusive ? 'white' : c.text}}>
                {allInclusive ? t('leaseForm.on') : t('leaseForm.off')}
              </Text>
            </TouchableOpacity>
          </View>

          {allInclusive ? (
            <>
              <Text style={{color: c.subtext}}>{t('leaseForm.allInclusiveAmountHint')}</Text>
              <TextInput
                keyboardType="numeric"
                value={allInclusiveAmount}
                onChangeText={ttext => setAllInclusiveAmount(formatTyping(ttext))}
                placeholder={t('leaseForm.amountPlaceholder')}
                placeholderTextColor={c.subtext}
                style={{borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card}}
              />
            </>
          ) : (
            <>
              <Text style={{color: c.subtext}}>{t('leaseForm.baseRent')}</Text>
              <TextInput
                keyboardType="numeric"
                value={baseRentText}
                onChangeText={ttext => setBaseRentText(formatTyping(ttext))}
                placeholder={t('leaseForm.amountPlaceholder')}
                placeholderTextColor={c.subtext}
                style={{borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card}}
              />
            </>
          )}

          <Text style={{color: c.subtext, marginTop: 6}}>{t('leaseForm.deposit')}</Text>
          <TextInput
            keyboardType="numeric"
            value={depositText}
            onChangeText={ttext => setDepositText(formatTyping(ttext))}
            placeholder="0"
            placeholderTextColor={c.subtext}
            style={{borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card}}
          />
        </Card>

        {/* CHARGES */}
        {!allInclusive && (
          <Card style={{gap: 10}}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
              <Text style={{color: c.text, fontWeight: '800'}}>{t('leaseForm.chooseCharges')}</Text>
              <Button title={t('common.add')} onPress={addCharge} />
            </View>

            {charges.map((ch, idx) => (
              <View key={idx} style={{borderRadius: 10, padding: 10, gap: 8}}>
                <TextInput
                  placeholder={t('leaseForm.chargeNamePlaceholder')}
                  placeholderTextColor={c.subtext}
                  value={ch.name}
                  onChangeText={ttext => updCharge(idx, {name: ttext})}
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
                    <Text style={{color: ch.isVariable ? c.text : 'white'}}>{t('leaseForm.fixed')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => updCharge(idx, {isVariable: true, unit: 'đv'})}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 10,
                      backgroundColor: ch.isVariable ? '#10b981' : c.card,
                    }}>
                    <Text style={{color: ch.isVariable ? 'white' : c.text}}>{t('leaseForm.variable')}</Text>
                  </TouchableOpacity>
                </View>

                <Text style={{color: c.subtext}}>
                  {ch.isVariable ? t('leaseForm.unitPricePerUnit') : t('leaseForm.unitPricePerPeriod')}
                </Text>
                <TextInput
                  keyboardType="numeric"
                  value={ch.price}
                  onChangeText={ttext => updCharge(idx, {price: formatTyping(ttext)})}
                  style={{borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card}}
                />

                {ch.isVariable && (
                  <>
                    <Text style={{color: c.subtext}}>{t('leaseForm.initialMeter')}</Text>
                    <TextInput
                      keyboardType="numeric"
                      value={ch.meterStart}
                      onChangeText={ttext => updCharge(idx, {meterStart: formatTyping(ttext)})}
                      style={{borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card}}
                    />
                  </>
                )}

                <Button title={t('common.delete')} variant="ghost" onPress={() => delCharge(idx)} />
              </View>
            ))}
          </Card>
        )}

        {/* ACTIONS */}
        <View style={{flexDirection: 'row', justifyContent: 'flex-end', gap: 12}}>
          <Button title={t('common.cancel')} variant="ghost" onPress={() => navigation.goBack()} />
          <Button title={t('leaseForm.createLease')} onPress={submit} />
        </View>
      </ScrollView>
    </View>
  );
}
