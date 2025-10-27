// src/app/screens/LeaseDetail.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Alert,
  Modal,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/RootNavigator';
import Card from '../components/Card';
import Button from '../components/Button';
import FormInput from '../components/FormInput';
import { useThemeColors } from '../theme';
import { useCurrency } from '../../utils/currency';
import {
  formatNumber as groupVN,
  formatDecimalTypingVNStrict,
  parseDecimalCommaStrict,
} from '../../utils/number';
import {
  getLease,
  getTenant,
  listChargesForLease,
  updateRecurringChargePrice,
  addOrUpdateRecurringCharges,
  updateLeaseBaseRent,
  listCycles,
  endLeaseWithSettlement,
  getRoom,
} from '../../services/rent';
import { useSettings } from '../state/SettingsContext';
import { formatDateISO } from '../../utils/date';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Share from 'react-native-share';
import SignaturePadModal from '../components/SignaturePadModal';
import { createLeasePdfFile } from '../../services/leasePdf';
import { loadPaymentProfile } from '../../services/paymentProfile';
import {
  loadLeaseSignatures,
  saveLeaseSignatures,
} from '../../services/leaseSignatures';
type Props = NativeStackScreenProps<RootStackParamList, 'LeaseDetail'>;

type NewItem = {
  name: string;
  isVariable: boolean;
  unit?: string;
  price?: string;
  meterStart?: string;
};

// nhóm nghìn khi gõ số nguyên
function formatTypingInt(s: string) {
  const digits = (s || '').replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('vi-VN');
}
// parse số nguyên an toàn
function parseAmount(s: string) {
  const digits = (s || '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}
// chuẩn hoá chuỗi chữ ký thành URI ảnh
function toImgUri(s?: string) {
  if (!s) return '';
  const v = String(s).trim();
  if (!v) return '';
  if (/^data:image\//i.test(v)) return v;
  if (/^file:\/\//i.test(v) || /^content:\/\//i.test(v)) return v;
  return `data:image/png;base64,${v.replace(/^base64,?/i, '')}`;
}

export default function LeaseDetail({ route, navigation }: Props) {
  // ----- E-sign + PDF -----
  const [showSignModal, setShowSignModal] = useState<
    null | 'tenant' | 'landlord'
  >(null);
  const [tenantSig, setTenantSig] = useState<string | undefined>(undefined); // base64 / data-uri
  const [landlordSig, setLandlordSig] = useState<string | undefined>(undefined); // base64 / data-uri

  const insets = useSafeAreaInsets();
  const { dateFormat, language } = useSettings();
  const { leaseId } = route.params as any;
  const c = useThemeColors();
  const { format } = useCurrency();
  const { t } = useTranslation();

  const [lease, setLease] = useState<any>();
  const [tenant, setTenant] = useState<any | null>(null);
  const [charges, setCharges] = useState<any[]>([]);
  const [cycles, setCycles] = useState<any[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [roomCode, setRoomCode] = useState<string>('');
  const toImgUri = (s?: string) =>
    !s
      ? ''
      : /^data:image\//i.test(s) ||
        /^file:\/\//i.test(s) ||
        /^content:\/\//i.test(s)
      ? s
      : `data:image/png;base64,${String(s).replace(/^base64,?/i, '')}`;
  // fixed: { charge_type_id: "1.000,25" }
  const [fixed, setFixed] = useState<Record<string, string>>({});
  // vars: { charge_type_id: { price: "0,26", meter: "1.000" } }
  const [vars, setVars] = useState<
    Record<string, { price: string; meter: string }>
  >({});
  const [baseRentText, setBaseRentText] = useState('');

  const [newItems, setNewItems] = useState<NewItem[]>([]);
  const addEmptyItem = () =>
    setNewItems(prev => [
      ...prev,
      { name: '', isVariable: false, unit: '', price: '', meterStart: '' },
    ]);
  const updateItem = (idx: number, patch: Partial<NewItem>) =>
    setNewItems(prev =>
      prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    );
  const removeItem = (idx: number) =>
    setNewItems(prev => prev.filter((_, i) => i !== idx));

  // Đánh dấu xóa phí đang có
  const [removed, setRemoved] = useState<Record<string, boolean>>({});

  // ----- Modal kết thúc trước hạn -----
  const [showEndModal, setShowEndModal] = useState(false);
  const [endExtras, setEndExtras] = useState<
    Array<{ name: string; amount: string }>
  >([]);
  const addEndExtra = () => setEndExtras(p => [...p, { name: '', amount: '' }]);
  const updEndExtra = (
    i: number,
    patch: Partial<{ name: string; amount: string }>,
  ) =>
    setEndExtras(p => p.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const delEndExtra = (i: number) =>
    setEndExtras(p => p.filter((_, idx) => idx !== i));

  const endExtrasSum = useMemo(
    () => endExtras.reduce((s, it) => s + parseAmount(it.amount || ''), 0),
    [endExtras],
  );
  const deposit = Number(lease?.deposit_amount || 0);
  const finalBalance = deposit - endExtrasSum;

  const reload = () => {
    const l = getLease(leaseId);
    setLease(l);
    setBaseRentText(groupVN(String(l?.base_rent || 0)));
    setTenant(l?.tenant_id ? getTenant(l.tenant_id) : null);
    try {
      const r = l?.room_id ? getRoom(l.room_id) : null;
      setRoomCode(r?.code || '');
    } catch {}

    const list = listChargesForLease(leaseId) as any[];
    setCharges(list);

    const f: Record<string, string> = {};
    const v: Record<string, { price: string; meter: string }> = {};
    const rem: Record<string, boolean> = {};
    for (const it of list) {
      const ctId = it.charge_type_id;
      const isVar = Number(it.is_variable) === 1;
      if (isVar) {
        v[ctId] = {
          price: groupVN(String(it.unit_price || 0)),
          meter: groupVN(String(it.meter_start || 0)),
        };
      } else {
        f[ctId] = groupVN(String(it.unit_price || 0));
      }
      rem[ctId] = false;
    }
    setFixed(f);
    setVars(v);
    setRemoved(rem);

    try {
      setCycles(listCycles(leaseId) || []);
    } catch {}
    loadLeaseSignatures(leaseId).then(sig => {
      setTenantSig(sig.tenant);
      setLandlordSig(sig.landlord);
    });
  };

  const sharePlainText = async () => {
    try {
      if (!lease) return;

      const lines: string[] = [];
      const titleRoom = roomCode
        ? `${t('common.room')} ${roomCode}`
        : t('leaseDetail.title') || 'Hợp đồng';

      // Tiêu đề + người thuê
      lines.push(`🧾 ${titleRoom}`);
      if (tenant?.full_name) {
        const phone = tenant.phone ? ` — ${tenant.phone}` : '';
        lines.push(`👤 ${tenant.full_name}${phone}`);
      }

      // Thông tin HĐ
      lines.push(
        `📅 ${t('leaseDetail.start')}: ${formatDateISO(
          lease.start_date,
          dateFormat,
          language,
        )}`,
      );
      if (lease.end_date) {
        lines.push(
          `🏁 ${t('leaseDetail.end')}: ${formatDateISO(
            lease.end_date,
            dateFormat,
            language,
          )}`,
        );
      }
      lines.push(
        `${t('leaseDetail.cycle')}: ${
          lease.billing_cycle === 'monthly'
            ? t('common.monthly')
            : t('leaseDetail.daily')
        }`,
      );
      lines.push(
        `${t('leaseDetail.baseRent')}: ${format(lease.base_rent || 0)} ${
          lease.base_rent_collect === 'start'
            ? `(${t('leaseForm.collectStart')})`
            : `(${t('leaseForm.collectEnd')})`
        }`,
      );
      lines.push(
        `${t('leaseDetail.deposit')}: ${format(lease.deposit_amount || 0)}`,
      );
      lines.push('');

      // Các khoản phí áp dụng
      lines.push(`${t('leaseDetail.activeCharges')}:`);
      for (const it of charges) {
        const isVar = Number(it.is_variable) === 1;
        const unitLabel = isVar
          ? it.unit || t('units.unitShort')
          : t('units.month');
        const priceStr = format(Number(it.unit_price) || 0);

        if (isVar) {
          lines.push(
            `• ${it.name}: ${priceStr}/${unitLabel} — ${t(
              'leaseDetail.meterStart',
            )}: ${groupVN(String(it.meter_start || 0))}`,
          );
        } else {
          lines.push(`• ${it.name}: ${priceStr}/${unitLabel}`);
        }
      }

      lines.push('');
      lines.push(t('cycleDetail.thank'));

      await Share.open({
        message: lines.join('\n'),
        subject: `${t('invoice.title') || 'Hóa đơn'} ${titleRoom}`,
        failOnCancel: false,
      });
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('common.tryAgain'));
    }
  };

  const onExportPdf = async () => {
    try {
      if (!lease) return;
      const branding = await loadPaymentProfile();
      const path = await createLeasePdfFile({
        lease,
        tenant,
        room: { code: roomCode },
        charges,
        signatures: { tenant: tenantSig, landlord: landlordSig },
        branding,
        t,
        lang: language,
      });

      if (path) {
        await Share.open({
          url: `file://${path}`,
          type: 'application/pdf',
          failOnCancel: false,
        });
      } else {
        Alert.alert(
          t('leasePdf.systemPrintOpened') || 'Đã mở hộp thoại In',
          t('leasePdf.systemPrintHint') ||
            'Chọn "Save as PDF" để lưu hợp đồng.',
        );
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || 'Export failed');
    }
  };

  useEffect(reload, [leaseId]);
  useFocusEffect(
    React.useCallback(() => {
      reload();
    }, [leaseId]),
  );

  // Helpers
  const addMonths = (d: Date, n: number) => {
    const x = new Date(d);
    x.setMonth(x.getMonth() + n);
    return x;
  };
  const addDays = (d: Date, n: number) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };
  const toYMD = (d: Date) => d.toISOString().slice(0, 10);

  // Kết thúc dự kiến & số kỳ còn lại (monthly)
  const { endProjected, cyclesLeft } = useMemo(() => {
    if (!lease) return { endProjected: '—', cyclesLeft: '—' as any };
    const s = new Date(lease.start_date);
    const billing = String(lease.billing_cycle);
    const totalPlanned: number = Number(lease.duration_days || 0);

    let projected = '—';
    if (lease.end_date) {
      projected = lease.end_date;
    } else if (billing === 'monthly') {
      const months = totalPlanned > 0 ? totalPlanned : 1;
      projected = toYMD(addDays(addMonths(s, months), -1));
    } else if (billing === 'daily') {
      const days = Number(lease.duration_days || 1);
      projected = toYMD(addDays(s, Math.max(1, days) - 1));
    } else {
      projected = toYMD(
        addDays(new Date(s.getFullYear() + 1, s.getMonth(), s.getDate()), -1),
      );
    }

    if (billing !== 'monthly' || totalPlanned <= 0)
      return { endProjected: projected, cyclesLeft: '—' };
    const settled = cycles.filter(
      (c: any) => String(c.status) === 'settled',
    ).length;
    const hasOpen = cycles.some((c: any) => String(c.status) !== 'settled');
    const used = settled + (hasOpen ? 1 : 0);
    const left = Math.max(0, totalPlanned - used);
    return { endProjected: projected, cyclesLeft: left };
  }, [lease, cycles]);

  function saveApplyNext() {
    // Base rent
    const newBase = parseDecimalCommaStrict(baseRentText);
    if (newBase !== lease?.base_rent) updateLeaseBaseRent(leaseId, newBase);

    // Fixed charges
    for (const [ctId, text] of Object.entries(fixed)) {
      if (removed[ctId]) {
        updateRecurringChargePrice(leaseId, ctId, 0);
      } else {
        updateRecurringChargePrice(
          leaseId,
          ctId,
          parseDecimalCommaStrict(text),
        );
      }
    }

    // Variable charges (chỉ update price ở đây; meterStart sẽ roll khi settle)
    for (const [ctId, val] of Object.entries(vars)) {
      if (removed[ctId]) {
        updateRecurringChargePrice(leaseId, ctId, 0);
      } else {
        updateRecurringChargePrice(
          leaseId,
          ctId,
          parseDecimalCommaStrict(val.price),
        );
      }
    }

    // New items → upsert
    const toCreate = newItems
      .filter(
        it => it.name.trim() && parseDecimalCommaStrict(it.price || '') > 0,
      )
      .map(it => ({
        name: it.name.trim(),
        isVariable: !!it.isVariable,
        unit:
          (it.unit || '').trim() ||
          (it.isVariable ? t('units.unitShort') : t('units.month')),
        price: parseDecimalCommaStrict(it.price || ''),
        meterStart: it.isVariable
          ? parseAmount(it.meterStart || '')
          : undefined,
      }));
    if (toCreate.length) addOrUpdateRecurringCharges(leaseId, toCreate);

    setEditMode(false);
    setNewItems([]);
    reload();
    Alert.alert(t('leaseDetail.saved'), t('leaseDetail.appliedNextCycles'));
  }

  const attemptEndEarly = () => {
    const today = toYMD(new Date());
    const openCycles = (cycles || []).filter(
      (c: any) => String(c.status) !== 'settled',
    );
    const blocking = openCycles.find(
      (c: any) => today >= c.period_start && today <= c.period_end,
    );
    if (blocking) {
      Alert.alert(
        t('leaseDetail.cannotEnd'),
        t('leaseDetail.mustSettleCurrent'),
      );
      return;
    }
    Alert.alert(t('leaseDetail.confirm'), t('leaseDetail.endNowConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.ok'), onPress: () => setShowEndModal(true) },
    ]);
  };

  const SegBtn = ({
    active,
    title,
    onPress,
  }: {
    active: boolean;
    title: string;
    onPress: () => void;
  }) => (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: active ? c.primary : c.card,
      }}
    >
      <Text style={{ color: c.text, fontWeight: active ? '800' : '600' }}>
        {title}
      </Text>
    </TouchableOpacity>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {!editMode ? (
        <ScrollView
          contentContainerStyle={{
            padding: 12,
            paddingBottom: insets.bottom + 160,
            gap: 12,
          }}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
        >
          <Card>
            <Text style={{ color: c.text, fontWeight: '800', marginBottom: 8 }}>
              {t('leaseDetail.tenant')}
            </Text>
            {tenant ? (
              <>
                <Text style={{ color: c.text }}>
                  {t('leaseDetail.name')}: {tenant.full_name}
                </Text>
                <Text style={{ color: c.text }}>
                  {t('leaseDetail.idNumber')}: {tenant.id_number || '—'}
                </Text>
                <Text style={{ color: c.text }}>
                  {t('leaseDetail.phone')}: {tenant.phone || '—'}
                </Text>
              </>
            ) : (
              <Text style={{ color: c.subtext }}>—</Text>
            )}
          </Card>

          <Card>
            <Text style={{ color: c.text }}>
              {t('leaseDetail.start')}:{' '}
              {lease?.start_date
                ? formatDateISO(lease?.start_date, dateFormat, language)
                : '—'}
            </Text>
            <Text style={{ color: c.text }}>
              {t('leaseDetail.end')}:{' '}
              {lease?.end_date
                ? formatDateISO(lease?.end_date, dateFormat, language)
                : '—'}
            </Text>
            <Text style={{ color: c.text }}>
              {t('leaseDetail.cycle')}:{' '}
              {lease?.billing_cycle === 'monthly'
                ? t('common.monthly')
                : t('leaseDetail.daily')}
            </Text>
            <Text style={{ color: c.text }}>
              {t('leaseDetail.baseRent')}: {format(lease?.base_rent || 0)}
            </Text>
            <Text style={{ color: c.text }}>
              {t('leaseDetail.deposit')}: {format(lease?.deposit_amount || 0)}
            </Text>
            <Text style={{ color: c.text }}>
              {t('leaseDetail.status')}:{' '}
              {lease?.status === 'active'
                ? t('common.active')
                : t('leaseDetail.ended')}{' '}
            </Text>
          </Card>

          <Card style={{ gap: 8 }}>
            <Text style={{ color: c.text, fontWeight: '800' }}>
              {t('leaseDetail.activeCharges')}
            </Text>
            {charges.map(it => (
              <View key={it.id} style={{ borderRadius: 10, padding: 10 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                  }}
                >
                  <Text style={{ color: c.text, fontWeight: '700' }}>
                    {it.name}
                  </Text>
                  <Text style={{ color: c.subtext }}>
                    {Number(it.is_variable) === 1
                      ? `${t('leaseDetail.variable')} (${t('units.unitShort')})`
                      : t('leaseDetail.fixed')}
                  </Text>
                </View>
                <Text style={{ color: c.subtext }}>
                  {t('leaseDetail.unitPrice')}:{' '}
                  <Text style={{ color: c.text }}>
                    {format(it.unit_price || 0)}
                  </Text>
                  {Number(it.is_variable) === 1 && ` / ${t('units.unitShort')}`}
                </Text>
                {Number(it.is_variable) === 1 && (
                  <Text style={{ color: c.subtext }}>
                    {t('leaseDetail.meterStart')}:{' '}
                    <Text style={{ color: c.text }}>
                      {groupVN(String(it.meter_start || 0))}
                    </Text>
                  </Text>
                )}
              </View>
            ))}
          </Card>

          {/* --- CHỮ KÝ + XUẤT PDF --- */}
          <Card style={{ gap: 10 }}>
            <Text style={{ color: c.text, fontWeight: '800' }}>
              {t('leasePdf.signatures') || 'Chữ ký'}
            </Text>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Button
                  title={t('leasePdf.signTenantBtn') || 'Ký (Bên thuê)'}
                  onPress={() => setShowSignModal('tenant')}
                />
                {tenantSig ? (
                  <Image
                    source={{ uri: toImgUri(tenantSig) }}
                    style={{
                      width: '100%',
                      height: 100,
                      marginTop: 8,
                      borderRadius: 8,
                      backgroundColor: c.card,
                    }}
                    resizeMode="contain"
                  />
                ) : (
                  <Text style={{ color: c.subtext, marginTop: 8 }}>
                    {t('leasePdf.noSignature') || 'Chưa ký'}
                  </Text>
                )}
              </View>

              <View style={{ flex: 1, alignItems: 'center' }}>
                <Button
                  title={t('leasePdf.signLandlordBtn') || 'Ký (Bên cho thuê)'}
                  onPress={() => setShowSignModal('landlord')}
                />
                {landlordSig ? (
                  <Image
                    source={{ uri: toImgUri(landlordSig) }}
                    style={{
                      width: '100%',
                      height: 100,
                      marginTop: 8,
                      borderRadius: 8,
                      backgroundColor: c.card,
                    }}
                    resizeMode="contain"
                  />
                ) : (
                  <Text style={{ color: c.subtext, marginTop: 8 }}>
                    {t('leasePdf.noSignature') || 'Chưa ký'}
                  </Text>
                )}
              </View>
            </View>

            <View style={{ marginTop: 6 }}>
              <Button
                title={t('leasePdf.exportPdf') || 'Xuất hợp đồng (PDF)'}
                onPress={onExportPdf}
              />
            </View>
          </Card>

          {/* Bottom action bar – 3 nút */}
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
            <Button
              title={t('cycleDetail.shareText') || 'Chia sẻ (tin nhắn)'}
              onPress={sharePlainText}
            />
            <Button
              title={t('leaseDetail.endEarly')}
              onPress={attemptEndEarly}
            />
            <Button
              title={t('common.edit')}
              onPress={() => setEditMode(true)}
            />
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: 12,
            paddingBottom: insets.bottom + 100,
            gap: 12,
          }}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
        >
          <Card>
            <Text style={{ color: c.text, fontWeight: '800', marginBottom: 8 }}>
              {t('leaseDetail.baseRentNext')}
            </Text>
            <FormInput
              keyboardType="decimal-pad"
              value={baseRentText}
              onChangeText={txt =>
                setBaseRentText(formatDecimalTypingVNStrict(txt))
              }
            />
          </Card>

          <Card style={{ gap: 8 }}>
            <Text style={{ color: c.text, fontWeight: '800' }}>
              {t('leaseDetail.fixedCharges')}
            </Text>
            {charges
              .filter(i => Number(i.is_variable) !== 1)
              .map(it => {
                const ctId = it.charge_type_id;
                const isRemoved = !!removed[ctId];
                return (
                  <View key={it.id} style={{ gap: 6 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Text
                        style={{
                          color: isRemoved ? c.subtext : c.text,
                          fontWeight: '700',
                        }}
                      >
                        {it.name}
                      </Text>
                      <TouchableOpacity
                        onPress={() =>
                          setRemoved(s => ({ ...s, [ctId]: !s[ctId] }))
                        }
                      >
                        <Text
                          style={{
                            color: isRemoved ? '#ef4444' : '#f43f5e',
                            fontWeight: '700',
                          }}
                        >
                          {isRemoved ? t('common.undo') : t('common.delete')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <FormInput
                      editable={!isRemoved}
                      keyboardType="decimal-pad"
                      value={fixed[ctId] ?? ''}
                      onChangeText={txt =>
                        setFixed(s => ({
                          ...s,
                          [ctId]: formatDecimalTypingVNStrict(txt),
                        }))
                      }
                    />
                  </View>
                );
              })}
          </Card>

          <Card style={{ gap: 8 }}>
            <Text style={{ color: c.text, fontWeight: '800' }}>
              {t('leaseDetail.variableCharges')}
            </Text>
            {charges
              .filter(i => Number(i.is_variable) === 1)
              .map(it => {
                const ctId = it.charge_type_id;
                const isRemoved = !!removed[ctId];
                return (
                  <View key={it.id} style={{ gap: 6 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Text
                        style={{
                          color: isRemoved ? c.subtext : c.text,
                          fontWeight: '700',
                        }}
                      >
                        {it.name} ({it.unit || t('units.unitShort')})
                      </Text>
                      <TouchableOpacity
                        onPress={() =>
                          setRemoved(s => ({ ...s, [ctId]: !s[ctId] }))
                        }
                      >
                        <Text
                          style={{
                            color: isRemoved ? '#ef4444' : '#f43f5e',
                            fontWeight: '700',
                          }}
                        >
                          {isRemoved ? t('common.undo') : t('common.delete')}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Đơn giá */}
                    <FormInput
                      editable={!isRemoved}
                      keyboardType="decimal-pad"
                      value={vars[ctId]?.price ?? ''}
                      onChangeText={txt =>
                        setVars(s => ({
                          ...s,
                          [ctId]: {
                            ...(s[ctId] || { meter: '0' }),
                            price: formatDecimalTypingVNStrict(txt),
                          },
                        }))
                      }
                      placeholder="0,00"
                    />

                    {/* Meter start */}
                    <Text style={{ color: c.subtext }}>
                      {t('leaseDetail.meterStart')}
                    </Text>
                    <FormInput
                      editable={!isRemoved}
                      keyboardType="numeric"
                      value={vars[ctId]?.meter ?? ''}
                      onChangeText={txt =>
                        setVars(s => ({
                          ...s,
                          [ctId]: {
                            ...(s[ctId] || { price: '' }),
                            meter: formatTypingInt(txt),
                          },
                        }))
                      }
                      placeholder="0"
                    />
                  </View>
                );
              })}
          </Card>

          {/* ==== Thêm khoản phí khác ==== */}
          <Card style={{ gap: 10 }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text style={{ color: c.text, fontWeight: '800' }}>
                {t('leaseDetail.addOtherCharge')}
              </Text>
              <Button title={t('common.add')} onPress={addEmptyItem} />
            </View>

            {newItems.map((it, idx) => (
              <View
                key={idx}
                style={{ borderRadius: 10, padding: 10, gap: 10 }}
              >
                <FormInput
                  placeholder={t('leaseDetail.chargeNamePh')}
                  value={it.name}
                  onChangeText={t_ => updateItem(idx, { name: t_ })}
                />

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <SegBtn
                    title={t('leaseDetail.fixed')}
                    active={!it.isVariable}
                    onPress={() => updateItem(idx, { isVariable: false })}
                  />
                  <SegBtn
                    title={t('leaseDetail.variable')}
                    active={!!it.isVariable}
                    onPress={() => updateItem(idx, { isVariable: true })}
                  />
                </View>

                <FormInput
                  placeholder={t('leaseDetail.unitPh')}
                  value={it.unit}
                  onChangeText={t_ => updateItem(idx, { unit: t_ })}
                />

                <FormInput
                  placeholder={
                    it.isVariable
                      ? t('leaseDetail.pricePerUnitPh')
                      : t('leaseDetail.pricePerCyclePh')
                  }
                  keyboardType="decimal-pad"
                  value={it.price}
                  onChangeText={t_ =>
                    updateItem(idx, { price: formatDecimalTypingVNStrict(t_) })
                  }
                />

                {it.isVariable && (
                  <FormInput
                    placeholder={t('leaseDetail.meterStartPh')}
                    keyboardType="numeric"
                    value={it.meterStart}
                    onChangeText={t_ =>
                      updateItem(idx, { meterStart: formatTypingInt(t_) })
                    }
                  />
                )}

                <Button
                  title={t('common.remove')}
                  variant="ghost"
                  onPress={() => removeItem(idx)}
                />
              </View>
            ))}
          </Card>

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
            <Button
              title={t('common.cancel')}
              variant="ghost"
              onPress={() => {
                setEditMode(false);
                setNewItems([]);
                setRemoved({});
                reload();
              }}
            />
            <Button title={t('common.save')} onPress={saveApplyNext} />
          </View>
        </ScrollView>
      )}

      {/* MODALS: Signature */}
      <SignaturePadModal
        visible={showSignModal === 'tenant'}
        title={t('leasePdf.signTenant') || 'Ký – Bên thuê'}
        onOK={async b64 => {
          setTenantSig(b64);
          await saveLeaseSignatures(leaseId, { tenant: b64 }); // ⬅️ LƯU
          setShowSignModal(null);
        }}
        onCancel={() => setShowSignModal(null)}
      />

      <SignaturePadModal
        visible={showSignModal === 'landlord'}
        title={t('leasePdf.signLandlord') || 'Ký – Bên cho thuê'}
        onOK={async b64 => {
          setLandlordSig(b64);
          await saveLeaseSignatures(leaseId, { landlord: b64 }); // ⬅️ LƯU
          setShowSignModal(null);
        }}
        onCancel={() => setShowSignModal(null)}
      />

      {/* MODAL: Kết thúc hợp đồng trước hạn */}
      <Modal
        visible={showEndModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEndModal(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={insets.top + 8}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: 'rgba(0,0,0,0.35)',
              justifyContent: 'flex-end',
            }}
          >
            <View
              style={{
                backgroundColor: c.bg,
                paddingTop: 16,
                paddingHorizontal: 16,
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                maxHeight: '90%',
              }}
            >
              <Text
                style={{
                  color: c.text,
                  fontWeight: '800',
                  fontSize: 16,
                  marginBottom: 8,
                }}
              >
                {t('leaseDetail.endEarly')}
              </Text>
              <Text style={{ color: c.text, marginBottom: 8 }}>
                {t('leaseDetail.depositNow')}: {format(deposit)}
              </Text>

              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentInsetAdjustmentBehavior="automatic"
                contentContainerStyle={{
                  gap: 10,
                  paddingBottom: insets.bottom + 84,
                }}
              >
                <Card style={{ gap: 8 }}>
                  <Text style={{ color: c.text, fontWeight: '700' }}>
                    {t('leaseDetail.arisingCharges')}
                  </Text>
                  {endExtras.map((ex, idx) => (
                    <View key={idx} style={{ gap: 6 }}>
                      <FormInput
                        placeholder={t('leaseDetail.itemNamePh')}
                        value={ex.name}
                        onChangeText={t_ => updEndExtra(idx, { name: t_ })}
                      />
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <FormInput
                          style={{ flex: 1 }}
                          placeholder={t('leaseDetail.amountPlusPh')}
                          keyboardType="decimal-pad"
                          value={ex.amount}
                          onChangeText={t_ =>
                            updEndExtra(idx, {
                              amount: formatDecimalTypingVNStrict(t_),
                            })
                          }
                        />
                        <Button
                          title={t('common.remove')}
                          variant="ghost"
                          onPress={() => delEndExtra(idx)}
                        />
                      </View>
                    </View>
                  ))}
                  <Button
                    title={t('common.addItem')}
                    variant="ghost"
                    onPress={addEndExtra}
                  />
                </Card>

                <Card>
                  <Text style={{ color: c.text }}>
                    {t('leaseDetail.totalArising')}: {format(endExtrasSum)}
                  </Text>
                  {finalBalance > 0 && (
                    <Text style={{ color: c.text }}>
                      {t('leaseDetail.refundToTenant')}: {format(finalBalance)}
                    </Text>
                  )}
                  {finalBalance < 0 && (
                    <Text style={{ color: c.text }}>
                      {t('leaseDetail.collectMore')}:{' '}
                      {format(Math.abs(finalBalance))}
                    </Text>
                  )}
                  {finalBalance === 0 && (
                    <Text style={{ color: c.text }}>
                      {t('leaseDetail.noFurther')}
                    </Text>
                  )}
                </Card>
              </ScrollView>

              {/* Action bar nổi lên trên bàn phím */}
              <View
                style={{
                  position: 'absolute',
                  left: 16,
                  right: 16,
                  bottom: insets.bottom + 8,
                  flexDirection: 'row',
                  justifyContent: 'flex-end',
                  gap: 10,
                }}
              >
                <Button
                  title={t('common.cancel')}
                  variant="ghost"
                  onPress={() => setShowEndModal(false)}
                />
                <Button
                  title={t('leaseDetail.finish')}
                  onPress={() => {
                    const payload = endExtras
                      .filter(it => it.name.trim())
                      .map(it => ({
                        name: it.name.trim(),
                        amount: parseAmount(it.amount || ''),
                      }));
                    const res = endLeaseWithSettlement(leaseId, payload);
                    setShowEndModal(false);
                    const msg =
                      res.finalBalance > 0
                        ? `${t('leaseDetail.refundToTenant')} ${format(
                            res.finalBalance,
                          )}`
                        : res.finalBalance < 0
                        ? `${t('leaseDetail.collectMore')} ${format(
                            Math.abs(res.finalBalance),
                          )}`
                        : t('leaseDetail.noFurther');
                    Alert.alert(t('leaseDetail.ended'), msg, [
                      {
                        text: t('common.ok'),
                        onPress: () => navigation.goBack(),
                      },
                    ]);
                  }}
                />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}
