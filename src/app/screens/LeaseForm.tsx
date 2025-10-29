// src/app/screens/LeaseForm.tsx
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Alert,
  TouchableOpacity,
  Platform,
  KeyboardAvoidingView,
  Modal,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import Card from '../components/Card';
import Button from '../components/Button';
import FormInput from '../components/FormInput';
import { useThemeColors } from '../theme';
import { useCurrency } from '../../utils/currency';
import { startLeaseAdvanced } from '../../services/rent';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSettings } from '../state/SettingsContext';
import { formatDateISO } from '../../utils/date';
import { useTranslation } from 'react-i18next';
import {
  formatIntTyping,
  parseIntSafe,
  parseDecimalCommaStrict,
  formatDecimalTypingVNStrict,
} from '../../utils/number';
import { scheduleReminder } from '../../services/notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ⬇️ DB để đọc catalog theo tòa
import { query } from '../../db';

type Props = NativeStackScreenProps<RootStackParamList, 'LeaseForm'>;

type ChargeDraft = {
  name: string;
  isVariable: boolean;
  unit?: string;
  price?: string;
  meterStart?: string;
};

// format số nguyên khi gõ (tách nghìn vi-VN)
function formatTyping(s: string) {
  const digits = s.replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('vi-VN');
}

// parse số nguyên từ chuỗi đã format
function parseAmount(s: string) {
  const digits = (s || '').replace(/\D/g, '');
  return digits ? Number(digits) : 0;
}

// format thập phân theo vi-VN để đổ vào input (phù hợp parseDecimalCommaStrict)
function formatDecimalVN(n: number) {
  try {
    return Number(n || 0).toLocaleString('vi-VN', { maximumFractionDigits: 3 });
  } catch {
    return String(n ?? 0);
  }
}

export default function LeaseForm({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { dateFormat, language } = useSettings();
  const { t } = useTranslation();
  const roomId = (route.params as any)?.roomId;
  const c = useThemeColors();
  const { format } = useCurrency();

  const [fullName, setFullName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [phone, setPhone] = useState('');

  // Chu kỳ
  const [mode, setMode] = useState<'monthly' | 'daily'>('monthly');

  // Kỳ hạn
  const [term, setTerm] = useState<'fixed' | 'open'>('fixed');

  const [startISO, setStartISO] = useState(new Date().toISOString().slice(0, 10));

  // Picker state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [iosShow, setIosShow] = useState(false);
  const [iosTemp, setIosTemp] = useState<Date | null>(null);

  const [months, setMonths] = useState('12');
  const [days, setDays] = useState('');

  const [collect, setCollect] = useState<'start' | 'end'>('start');

  const [baseRentText, setBaseRentText] = useState('');
  const [depositText, setDepositText] = useState('');

  const [allInclusive, setAllInclusive] = useState(false);
  const [allInclusiveAmount, setAllInclusiveAmount] = useState('');

  const [charges, setCharges] = useState<ChargeDraft[]>([]);
  const addCharge = () =>
    setCharges(p => [...p, { name: '', isVariable: false, unit: t('rent.month') || 'tháng', price: '' }]);
  const updCharge = (i: number, patch: Partial<ChargeDraft>) =>
    setCharges(p => p.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const delCharge = (i: number) => setCharges(p => p.filter((_, idx) => idx !== i));

  // Áp bảng giá theo tòa
  const [applyingCatalog, setApplyingCatalog] = useState(false);
  const applyCatalogForApartment = async () => {
    if (!roomId) {
      Alert.alert(t('common.error'), t('leaseForm.errorMissingRoomId'));
      return;
    }
    try {
      setApplyingCatalog(true);

      // 1) Lấy apartment_id từ room
      const room = query<{ apartment_id: string }>(
        `SELECT apartment_id FROM rooms WHERE id=? LIMIT 1`,
        [roomId]
      )[0];
      const aptId = room?.apartment_id;

      // 2) Lấy catalog theo tòa; nếu trống → fallback global
      let items = aptId
        ? query<any>(
            `SELECT name, unit, is_variable, unit_price, COALESCE(config_json,'{}') AS config_json
             FROM catalog_charges WHERE apartment_id=? ORDER BY name`, [aptId]
          )
        : [];

      if (!items || items.length === 0) {
        items = query<any>(
          `SELECT name, unit, is_variable, unit_price, COALESCE(config_json,'{}') AS config_json
           FROM catalog_charges
           WHERE apartment_id IS NULL OR apartment_id=''
           ORDER BY name`
        );
      }

      if (!items || items.length === 0) {
        Alert.alert(t('catalog.notice') || 'Thông báo', t('catalog.noCatalogForApartment') || 'Chưa có “Bảng giá” cho tòa này.');
        return;
      }

      // 3) Map sang ChargeDraft và đổ vào form (replace danh sách hiện tại)
      const mapped: ChargeDraft[] = items.map((it: any) => {
        const isVar = Number(it.is_variable) === 1;
        return {
          name: String(it.name || ''),
          isVariable: isVar,
          unit: it.unit || (isVar ? (t('rent.unit') || 'đơn vị') : (t('rent.month') || 'tháng')),
          price: formatDecimalVN(Number(it.unit_price) || 0),
          meterStart: isVar ? '0' : undefined,
        };
      });

      setCharges(mapped);
      Alert.alert(t('common.success'), t('catalog.catalogApplied') || 'Đã áp dụng Bảng giá.');
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('common.tryAgain'));
    } finally {
      setApplyingCatalog(false);
    }
  };

  // ⬇️ Modal xác nhận
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmData, setConfirmData] = useState<any>(null);

  const durationHint = useMemo(() => {
    if (term === 'open') return t('leaseForm.noTerm') ?? 'Không kỳ hạn';
    if (mode === 'daily') {
      const n = parseAmount(days);
      return n > 0 ? `${n} ${t('leaseForm.days')}` : '—';
    }
    const m = parseAmount(months);
    return m > 0 ? `${m} ${t('leaseForm.months')}` : '—';
  }, [term, mode, days, months, t]);

  function validate(): string | null {
    if (!roomId) return t('leaseForm.errorMissingRoomId');
    if (!startISO) return t('leaseForm.errorMissingStart');

    if (!fullName.trim()) return t('leaseForm.errorTenantName') || 'Vui lòng nhập tên người thuê';

    if (term === 'fixed') {
      if (mode === 'monthly') {
        const m = parseAmount(months);
        if (m <= 0) return t('leaseForm.errorMonths');
      } else {
        const d = parseAmount(days);
        if (d <= 0) return t('leaseForm.errorDays');
      }
    }

    if (allInclusive) {
      const pack = parseAmount(allInclusiveAmount);
      if (pack <= 0) return t('leaseForm.errorAllInclusive') || 'Vui lòng nhập số tiền trọn gói';
      return null;
    }

    const base = parseAmount(baseRentText);
    if (base <= 0) return t('leaseForm.errorBaseRent') || 'Vui lòng nhập giá thuê cơ bản';
    return null;
  }

  // Mở popup xác nhận
  function openConfirm() {
    const err = validate();
    if (err) {
      Alert.alert(t('common.missingInfo'), err);
      return;
    }

    const baseRent = allInclusive ? parseAmount(allInclusiveAmount) : parseAmount(baseRentText);
    const deposit = parseAmount(depositText);

    const outCharges =
      !allInclusive
        ? charges
            .filter(ch => ch.name.trim() && parseAmount(ch.price || '') > 0)
            .map(ch => ({
              name: ch.name.trim(),
              unit: ch.unit || (ch.isVariable ? t('rent.unit') : t('rent.month')),
              unitPrice: parseDecimalCommaStrict(ch.price || ''),
              isVariable: !!ch.isVariable,
            }))
        : [];

    const endDateISO =
      term === 'fixed' && mode === 'monthly'
        ? (() => {
            const s = new Date(startISO);
            const m = parseAmount(months);
            const end = new Date(s);
            end.setMonth(end.getMonth() + m);
            end.setDate(end.getDate() - 1);
            return end.toISOString().slice(0, 10);
          })()
        : undefined;

    const durationDaysCalc = term === 'fixed' && mode === 'daily' ? parseAmount(days) || 1 : undefined;

    setConfirmData({
      tenant: { fullName: fullName.trim(), phone: phone.trim(), idNumber: idNumber.trim() },
      mode,
      term,
      startISO,
      endDateISO,
      durationDays: durationDaysCalc,
      collect,
      baseRent,
      deposit,
      allInclusive,
      charges: outCharges,
      totalDueNow: deposit + (collect === 'start' ? baseRent : 0),
    });
    setConfirmVisible(true);
  }

  function submit() {
    const err = validate();
    if (err) {
      Alert.alert(t('common.missingInfo'), err);
      return;
    }

    const baseRent = allInclusive ? parseAmount(allInclusiveAmount) : parseAmount(baseRentText);
    const deposit = parseAmount(depositText);

    const outCharges: NonNullable<Parameters<typeof startLeaseAdvanced>[0]>['charges'] =
      !allInclusive
        ? charges
            .filter(ch => ch.name.trim() && parseAmount(ch.price || '') > 0)
            .map(ch => ({
              name: ch.name.trim(),
              type: ch.isVariable ? 'variable' : 'fixed',
              unit: ch.unit || (ch.isVariable ? t('rent.unit') : t('rent.month')),
              unitPrice: parseDecimalCommaStrict(ch.price || ''),
              meterStart: ch.isVariable ? parseIntSafe(ch.meterStart || '') : undefined,
            }))
        : undefined;

    const endDateISO =
      term === 'fixed' && mode === 'monthly'
        ? (() => {
            const s = new Date(startISO);
            const m = parseAmount(months);
            const end = new Date(s);
            end.setMonth(end.getMonth() + m);
            end.setDate(end.getDate() - 1);
            return end.toISOString().slice(0, 10);
          })()
        : undefined;

    const durationDays = term === 'fixed' && mode === 'daily' ? parseAmount(days) || 1 : undefined;

    const payload = {
      roomId,
      leaseType: 'long_term' as const,
      billing: mode,
      startDateISO: startISO,
      baseRent,
      baseRentCollect: collect,
      deposit,
      durationDays,
      endDateISO,
      tenant: {
        full_name: fullName.trim(),
        id_number: idNumber.trim(),
        phone: phone.trim(),
      },
      charges: outCharges,
      isAllInclusive: allInclusive,
    };

    try {
      const leaseId = startLeaseAdvanced(payload as any);

      // Reminders
      if (endDateISO) {
        scheduleReminder(
          `lease_end_${leaseId}`,
          t('notify.leaseEndTitle') || 'Kết thúc hợp đồng',
          t('notify.leaseEndMsg') || 'Hợp đồng kết thúc hôm nay. Vui lòng kiểm tra & tất toán.',
          endDateISO
        );
      }

      const firstSettleISO = (() => {
        if (mode === 'monthly') {
          const s = new Date(startISO);
          const e = new Date(s);
          e.setMonth(e.getMonth() + 1);
          e.setDate(e.getDate() - 1);
          return e.toISOString().slice(0, 10);
        } else {
          const s = new Date(startISO);
          const n = Math.max(1, durationDays || 1);
          s.setDate(s.getDate() + n - 1);
          return s.toISOString().slice(0, 10);
        }
      })();

      scheduleReminder(
        `lease_settle_${leaseId}_1`,
        t('notify.settleTitle') || 'Tất toán kỳ',
        t('notify.settleMsg') || 'Hôm nay đến ngày tất toán kỳ. Vui lòng xử lý.',
        firstSettleISO
      );

      const depositAmt = deposit;
      const firstRent = collect === 'start' ? baseRent : 0;
      const totalDueNow = depositAmt + firstRent;

      const title = t('leaseForm.created');
      const msg =
        collect === 'start'
          ? `${t('leaseForm.collectNow')}:\n• ${t('leaseForm.deposit')}: ${format(depositAmt)}\n• ${t(
              'leaseForm.firstPeriodRent',
            )}: ${format(firstRent)}\n= ${t('leaseForm.total')}: ${format(totalDueNow)}`
          : `${t('leaseForm.collectNow')}:\n• ${t('leaseForm.deposit')}: ${format(depositAmt)}`;

      Alert.alert(title, msg, [
        { text: t('common.ok') || 'OK', onPress: () => navigation.replace('LeaseDetail', { leaseId }) },
      ]);
    } catch (e: any) {
      Alert.alert(t('common.error'), String(e?.message || e));
    }
  }

  const openStartPicker = () => {
    if (Platform.OS === 'ios') {
      setIosTemp(new Date(startISO));
      setIosShow(true);
    } else {
      setShowDatePicker(true);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 100, gap: 12 }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        {/* Khách thuê */}
        <Card style={{ gap: 8 }}>
          <FormInput placeholder={t('leaseForm.tenantName')} value={fullName} onChangeText={setFullName} />
          <FormInput placeholder={t('leaseForm.idNumber')} value={idNumber} onChangeText={setIdNumber} />
          <FormInput
            placeholder={t('leaseForm.phone')}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
        </Card>

        {/* Loại chu kỳ & kỳ hạn */}
        <Card style={{ gap: 10 }}>
          <Text style={{ color: c.text, fontWeight: '800' }}>{t('leaseForm.contractType')}</Text>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['monthly', 'daily'] as const).map(k => (
              <TouchableOpacity
                key={k}
                onPress={() => setMode(k)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                  backgroundColor: mode === k ? '#1f6feb' : c.card,
                }}
              >
                <Text style={{ color: mode === k ? 'white' : c.text }}>
                  {k === 'monthly' ? t('leaseForm.monthly') : t('leaseForm.daily')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['fixed', 'open'] as const).map(k => (
              <TouchableOpacity
                key={k}
                onPress={() => setTerm(k)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                  backgroundColor: term === k ? '#0ea5e9' : c.card,
                }}
              >
                <Text style={{ color: term === k ? 'white' : c.text }}>
                  {k === 'fixed' ? t('leaseForm.fixedTerm') || 'Có kỳ hạn' : t('leaseForm.openTerm') || 'Không kỳ hạn'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Ngày bắt đầu */}
          <Text style={{ color: c.subtext, marginTop: 6 }}>{t('leaseForm.startDate')}</Text>
          <TouchableOpacity
            onPress={openStartPicker}
            style={{ borderRadius: 10, padding: 10, backgroundColor: c.card }}
          >
            <Text style={{ color: c.text }}>{formatDateISO(startISO, dateFormat, language)}</Text>
          </TouchableOpacity>

          {/* iOS modal */}
          {Platform.OS === 'ios' && (
            <Modal
              visible={iosShow}
              transparent
              animationType="slide"
              onRequestClose={() => setIosShow(false)}
            >
              <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.25)' }}>
                <View
                  style={{
                    backgroundColor: (c as any).bg || c.card,
                    borderTopLeftRadius: 16,
                    borderTopRightRadius: 16,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 12 }}>
                    <TouchableOpacity onPress={() => setIosShow(false)}>
                      <Text style={{ color: c.subtext }}>{t('common.cancel') || 'Cancel'}</Text>
                    </TouchableOpacity>
                    <Text style={{ color: c.text, fontWeight: '700' }}>
                      {t('leaseForm.startDate') || 'Start date'}
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        if (iosTemp) setStartISO(iosTemp.toISOString().slice(0, 10));
                        setIosShow(false);
                      }}
                    >
                      <Text style={{ color: (c as any).primary || '#10b981', fontWeight: '700' }}>
                        {t('common.done') || 'Done'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={iosTemp ?? new Date(startISO)}
                    mode="date"
                    display="spinner"
                    onChange={(_, d) => d && setIosTemp(d)}
                  />
                </View>
              </View>
            </Modal>
          )}

          {/* Android picker */}
          {Platform.OS !== 'ios' && showDatePicker && (
            <DateTimePicker
              value={new Date(startISO)}
              mode="date"
              display="default"
              onChange={(event, date) => {
                setShowDatePicker(false);
                if (event.type === 'set' && date) setStartISO(date.toISOString().slice(0, 10));
              }}
            />
          )}

          {term === 'fixed' &&
            (mode === 'monthly' ? (
              <>
                <Text style={{ color: c.subtext, marginTop: 6 }}>{t('leaseForm.monthCount')}</Text>
                <FormInput keyboardType="numeric" value={months} onChangeText={setMonths} />
              </>
            ) : (
              <>
                <Text style={{ color: c.subtext, marginTop: 6 }}>{t('leaseForm.dayCount')}</Text>
                <FormInput keyboardType="numeric" value={days} onChangeText={setDays} />
              </>
            ))}

          <Text style={{ color: c.subtext }}>{t('leaseForm.duration')}: {durationHint}</Text>
        </Card>

        {/* Thu tiền nhà */}
        <Card>
          <Text style={{ color: c.text, fontWeight: '800', marginBottom: 8 }}>{t('leaseForm.collectRent')}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['start', 'end'] as const).map(k => (
              <TouchableOpacity
                key={k}
                onPress={() => setCollect(k)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                  backgroundColor: collect === k ? '#10b981' : c.card,
                }}
              >
                <Text style={{ color: collect === k ? 'white' : c.text }}>
                  {k === 'start' ? t('leaseForm.collectStart') : t('leaseForm.collectEnd')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Phí trọn gói / Giá cơ bản + Cọc */}
        <Card style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: c.text, fontWeight: '800' }}>{t('leaseForm.allInclusive')}</Text>
            <TouchableOpacity
              onPress={() => setAllInclusive(v => !v)}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: allInclusive ? '#0ea5e9' : c.card }}
            >
              <Text style={{ color: allInclusive ? 'white' : c.text }}>
                {allInclusive ? t('leaseForm.on') : t('leaseForm.off')}
              </Text>
            </TouchableOpacity>
          </View>

          {allInclusive ? (
            <>
              <Text style={{ color: c.subtext }}>{t('leaseForm.allInclusiveAmountHint')}</Text>
              <FormInput
                keyboardType="numeric"
                value={allInclusiveAmount}
                onChangeText={txt => setAllInclusiveAmount(formatTyping(txt))}
                placeholder={t('leaseForm.amountPlaceholder')}
              />
            </>
          ) : (
            <>
              <Text style={{ color: c.subtext }}>{t('leaseForm.baseRent')}</Text>
              <FormInput
                keyboardType="numeric"
                value={baseRentText}
                onChangeText={txt => setBaseRentText(formatIntTyping(txt))}
                placeholder={t('leaseForm.amountPlaceholder')}
              />
            </>
          )}

          <Text style={{ color: c.subtext, marginTop: 6 }}>{t('leaseForm.deposit')}</Text>
          <FormInput
            keyboardType="numeric"
            value={depositText}
            onChangeText={txt => setDepositText(formatIntTyping(txt))}
            placeholder="0"
          />
        </Card>

        {/* Charges */}
        {!allInclusive && (
          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: c.text, fontWeight: '800' }}>{t('leaseForm.chooseCharges')}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title={t('common.add')} onPress={addCharge} />
                <Button
                  title={t('catalog.applyCatalog') || 'Áp dụng bảng giá'}
                  variant=""
                  onPress={applyCatalogForApartment}
                  disabled={applyingCatalog}
                />
              </View>
            </View>

            {charges.map((ch, idx) => (
              <View key={idx} style={{ borderRadius: 10, padding: 10, gap: 8 }}>
                <FormInput
                  placeholder={t('leaseForm.chargeNamePlaceholder')}
                  value={ch.name}
                  onChangeText={txt => updCharge(idx, { name: txt })}
                />

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => updCharge(idx, { isVariable: false, unit: t('rent.month') })}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: ch.isVariable ? c.card : '#10b981' }}
                  >
                    <Text style={{ color: ch.isVariable ? c.text : 'white' }}>{t('leaseForm.fixed')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => updCharge(idx, { isVariable: true, unit: t('rent.unit') })}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: ch.isVariable ? '#10b981' : c.card }}
                  >
                    <Text style={{ color: ch.isVariable ? 'white' : c.text }}>{t('leaseForm.variable')}</Text>
                  </TouchableOpacity>
                </View>

                <Text style={{ color: c.subtext }}>
                  {ch.isVariable ? t('leaseForm.unitPricePerUnit') : t('leaseForm.unitPricePerPeriod')}
                </Text>
                <FormInput
                  keyboardType="decimal-pad"
                  value={ch.price}
                  onChangeText={txt => updCharge(idx, { price: formatDecimalTypingVNStrict(txt) })}
                />

                {ch.isVariable && (
                  <>
                    <Text style={{ color: c.subtext }}>{t('leaseForm.initialMeter')}</Text>
                    <FormInput
                      keyboardType="numeric"
                      value={ch.meterStart}
                      onChangeText={txt => updCharge(idx, { meterStart: formatIntTyping(txt) })}
                    />
                  </>
                )}

                <Button title={t('common.delete')} variant="ghost" onPress={() => delCharge(idx)} />
              </View>
            ))}
          </Card>
        )}

        {/* Actions */}
        <View
          style={{
            justifyContent: 'flex-end',
            position: 'absolute',
            left: 12,
            right: 12,
            bottom: insets.bottom + 12,
            flexDirection: 'row',
            gap: 12,
          }}
        >
          <Button title={t('common.cancel')} variant="ghost" onPress={() => navigation.goBack()} />
          <Button title={t('leaseForm.createLease')} onPress={openConfirm} />
        </View>
      </ScrollView>

      {/* Modal xác nhận tạo hợp đồng */}
      <Modal
        visible={confirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 20 }}>
          <View
            style={{
              backgroundColor: (c as any).bg || 'white',
              borderRadius: 14,
              padding: 16,
              maxHeight: '85%',
            }}
          >
            <Text style={{ color: c.text, fontWeight: '800', fontSize: 18, marginBottom: 8 }}>
              {t('common.confirm') || 'Xác nhận tạo hợp đồng'}
            </Text>

            <ScrollView style={{ maxHeight: 420 }}>
              <Text style={{ color: c.text, marginBottom: 4 }}>
                {t('leaseForm.tenantName')}: <Text style={{ fontWeight: '700' }}>{confirmData?.tenant?.fullName}</Text>
              </Text>
              {!!confirmData?.tenant?.phone && (
                <Text style={{ color: c.subtext, marginBottom: 8 }}>{confirmData.tenant.phone}</Text>
              )}

              <Text style={{ color: c.text }}>
                {t('leaseForm.startDate')}: {formatDateISO(confirmData?.startISO, dateFormat, language)}
              </Text>
              <Text style={{ color: c.text }}>
                {t('leaseForm.contractType')}:{' '}
                {confirmData?.mode === 'monthly' ? (t('leaseForm.monthly') || 'Theo tháng') : (t('leaseForm.daily') || 'Theo ngày')}
              </Text>
              <Text style={{ color: c.text }}>
                {t('leaseForm.duration')}: {durationHint}
              </Text>
              {!!confirmData?.endDateISO && (
                <Text style={{ color: c.text }}>
                  {t('leaseHistoryDetail.end') || 'Kết thúc'}: {formatDateISO(confirmData.endDateISO, dateFormat, language)}
                </Text>
              )}
              <Text style={{ color: c.text }}>
                {t('leaseForm.collectRent')}: {confirmData?.collect === 'start'
                  ? (t('leaseForm.collectStart') || 'Thu đầu kỳ')
                  : (t('leaseForm.collectEnd') || 'Thu cuối kỳ')}
              </Text>

              <View style={{ height: 8 }} />

              <Text style={{ color: c.text }}>
                {(confirmData?.allInclusive ? (t('leaseForm.allInclusiveAmount') || 'Gói trọn gói') : (t('leaseForm.baseRent') || 'Giá thuê cơ bản')) + ': '}
                <Text style={{ fontWeight: '700' }}>{format(confirmData?.baseRent || 0)}</Text>
              </Text>
              <Text style={{ color: c.text }}>
                {t('leaseForm.deposit')}: <Text style={{ fontWeight: '700' }}>{format(confirmData?.deposit || 0)}</Text>
              </Text>

              {!!confirmData?.charges?.length && (
                <View style={{ marginTop: 8 }}>
                  <Text style={{ color: c.text, fontWeight: '600', marginBottom: 4 }}>
                    {t('leaseHistoryDetail.adjustments') || 'Các khoản phí'}
                  </Text>
                  {confirmData.charges.map((ch: any, idx: number) => (
                    <Text key={idx} style={{ color: c.text }}>
                      • {ch.name} — {format(Number(ch.unitPrice || 0))}{ch.unit ? `/${ch.unit}` : ''}
                    </Text>
                  ))}
                </View>
              )}

              <View style={{ borderTopWidth: 1, borderColor: c.card, marginTop: 12, paddingTop: 8 }}>
                <Text style={{ color: c.text, fontWeight: '800' }}>
                  {(t('leaseForm.collectNow') || 'Thu ngay khi tạo') + ': '}
                  {format(confirmData?.totalDueNow || 0)}
                </Text>
              </View>
            </ScrollView>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 12 }}>
              <Button title={t('common.edit') || 'Chỉnh sửa'} variant="ghost" onPress={() => setConfirmVisible(false)} />
              <Button
                title={t('common.confirm') || 'Xác nhận'}
                onPress={() => {
                  setConfirmVisible(false);
                  submit();
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
