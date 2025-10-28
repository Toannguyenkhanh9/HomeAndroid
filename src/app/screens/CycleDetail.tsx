// src/app/screens/CycleDetail.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Alert,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import Card from '../components/Card';
import Button from '../components/Button';
import FormInput from '../components/FormInput';
import { useThemeColors } from '../theme';
import {
  getCycle,
  getLease,
  getInvoice,
  getInvoiceItems,
  listChargesForLease,
  settleCycleWithInputs,
  updateRecurringChargePrice,
  getRoom,
  getTenant,
  isLastCycle,
  endLeaseWithSettlement,
  extendLeaseAndAddCycles,
  addSupplementChargesToCycle,
  recordPayment,
  queryPaymentsOfInvoice,
  updateInvoiceQrPath,
  getEffectiveLateFeeConfig, calcDaysLate, computeLateFeePreview 
} from '../../services/rent';
import { useCurrency } from '../../utils/currency';
import {
  formatNumber as groupVN,
  formatIntTyping,
  formatDecimalTypingVNStrict,
  parseDecimalCommaStrict,
} from '../../utils/number';
import ViewShot from 'react-native-view-shot';
import { useSettings } from '../state/SettingsContext';
import { formatDateISO } from '../../utils/date';
import { useTranslation } from 'react-i18next';
import Share from 'react-native-share';
import { scheduleReminder, cancelReminder } from '../../services/notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createInvoiceHtmlFile } from '../../services/invoiceHtml';
import { createPdfFromImageFile } from '../../services/pdfFromImage';
import { loadPaymentProfile } from '../../services/paymentProfile';
import { markHappyEvent, maybeAskForReview } from '../../services/rateApp';
import HiddenVietQR from '../components/HiddenVietQR';
import { buildVietQRPayload } from '../../services/vietqr';
// import { pickMeterImage, ocrDigitsFromImage } from '../../services/ocr';

type Props = NativeStackScreenProps<RootStackParamList, 'CycleDetail'> & {
  route: {
    params: { cycleId: string; onSettled?: () => void; openCollect?: boolean };
  };
};

type ChargeRow = {
  charge_type_id: string;
  name: string;
  unit?: string | null;
  is_variable: number;
  unit_price: number;
  meter_start?: number;
  value: string;
};

type ExtraItem = { name: string; amount: string };

// Helpers
function parseAmountInt(s: string) {
  const digits = (s || '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}
function formatVNMoneyTyping(input: string) {
  if (!input) return '';
  let s = input.replace(/[^\d,]/g, '');
  const [rawInt = '', ...rest] = s.split(',');
  const rawDec = rest.join('').replace(/,/g, '');
  const int = rawInt.replace(/^0+(?=\d)/, '');
  const groupedInt = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return rawDec ? `${groupedInt},${rawDec}` : groupedInt;
}

export default function CycleDetail({ route, navigation }: Props) {
  const [qrPayload, setQrPayload] = useState<string | null>(null);
  const [qrTarget, setQrTarget] = useState<{ invId: string } | null>(null);

  const [showConfirmSettle, setShowConfirmSettle] = useState(false);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { dateFormat, language } = useSettings();
  const { cycleId, onSettled, openCollect } = route.params as any;
  const c = useThemeColors();
  const { format } = useCurrency();

  const shotRef = useRef<ViewShot>(null);
  const [contentH, setContentH] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const [leaseId, setLeaseId] = useState<string>('');
  const [leaseInfo, setLeaseInfo] = useState<any>(null);
  const [rows, setRows] = useState<ChargeRow[]>([]);
  const [invId, setInvId] = useState<string | undefined>();
  const [invTotal, setInvTotal] = useState<number>(0);
  const [status, setStatus] = useState<'open' | 'settled'>('open');
  const [period, setPeriod] = useState<{ s: string; e: string }>({
    s: '',
    e: '',
  });

  const [roomCode, setRoomCode] = useState<string>('');
  const [tenantName, setTenantName] = useState<string>('');
  const [tenantPhone, setTenantPhone] = useState<string>('');

  const [settledItems, setSettledItems] = useState<any[]>([]);
  const [currentReadings, setCurrentReadings] = useState<
    Record<string, number>
  >({});

  const [editMode, setEditMode] = useState(false);
  const [extras, setExtras] = useState<ExtraItem[]>([]);
  const addExtra = () => setExtras(prev => [...prev, { name: '', amount: '' }]);
  const updateExtra = (i: number, patch: Partial<ExtraItem>) =>
    setExtras(prev =>
      prev.map((x, idx) => (idx === i ? { ...x, ...patch } : x)),
    );
  const removeExtra = (i: number) =>
    setExtras(prev => prev.filter((_, idx) => idx !== i));

  // Thu bổ sung (sau settle)
  const [showAddModal, setShowAddModal] = useState(false);
  const [suppItems, setSuppItems] = useState<ExtraItem[]>([]);
  const addSupp = () => setSuppItems(p => [...p, { name: '', amount: '' }]);
  const updSupp = (i: number, patch: Partial<ExtraItem>) =>
    setSuppItems(p => p.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const delSupp = (i: number) =>
    setSuppItems(p => p.filter((_, idx) => idx !== i));
  const suppTotal = useMemo(
    () => suppItems.reduce((s, it) => s + parseAmountInt(it.amount), 0),
    [suppItems],
  );

  const [showEndModal, setShowEndModal] = useState(false);
  const [endExtras, setEndExtras] = useState<ExtraItem[]>([]);
  const addEndExtra = () => setEndExtras(p => [...p, { name: '', amount: '' }]);
  const updEndExtra = (i: number, patch: Partial<ExtraItem>) =>
    setEndExtras(p => p.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const delEndExtra = (i: number) =>
    setEndExtras(p => p.filter((_, idx) => idx !== i));
  const endExtrasTotal = useMemo(
    () => endExtras.reduce((s, it) => s + parseAmountInt(it.amount), 0),
    [endExtras],
  );
  const [depositPreview, setDepositPreview] = useState<number>(0);

  const [showExtendModal, setShowExtendModal] = useState(false);
  const [extendCount, setExtendCount] = useState<string>('');

  // ====== NEW: Thu tiền nhiều lần ======
  const [showPay, setShowPay] = useState(false);
  const [payAmt, setPayAmt] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [payments, setPayments] = useState<any[]>([]);
  const loadPayments = () => {
    if (!invId) return;
    try {
      const p = queryPaymentsOfInvoice ? queryPaymentsOfInvoice(invId) : [];
      setPayments(p || []);
    } catch {}
  };
  const openCollectPopup = () => {
    if (!invId) return;
    const paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const bal = Math.max((invTotal || 0) - paid, 0);
    setPayAmt(formatDecimalTypingVNStrict(String(bal))); // <-- format khi set
    setPayMethod('cash');
    setShowPay(true);
  };

  // Helper: tính tổng đã thu & còn lại
  const getPaidAndBalance = React.useCallback(() => {
    const total = Number(invTotal || 0);
    let paid = 0;
    try {
      const p = invId ? queryPaymentsOfInvoice?.(invId) ?? [] : [];
      paid = p.reduce((s: number, it: any) => s + (Number(it.amount) || 0), 0);
    } catch {}
    const balance = Math.max(total - paid, 0);
    return { total, paid, balance };
  }, [invId, invTotal]);

  // Mở popup thu và tự điền số tiền cần thu
  const openPay = React.useCallback(() => {
    const { total, balance } = getPaidAndBalance();
    const defaultAmt = balance > 0 ? balance : total;
    setPayAmt(formatVNMoneyTyping(String(defaultAmt)));
    setPayMethod('cash');
    setShowPay(true);
  }, [getPaidAndBalance]);
  // =====================================

  const isFixedTerm = useMemo(() => {
    if (!leaseInfo) return false;
    const billing = String(leaseInfo.billing_cycle);
    if (billing === 'monthly') return !!leaseInfo.end_date;
    if (billing === 'daily') return Number(leaseInfo.duration_days || 0) > 0;
    return false;
  }, [leaseInfo]);

  const reload = () => {
    const cyc = getCycle(cycleId);
    if (!cyc) return;
    setStatus(String(cyc.status) as any);
    setPeriod({ s: cyc.period_start, e: cyc.period_end });

    const lease = getLease(cyc.lease_id);
    setLeaseId(lease.id);
    setLeaseInfo(lease);
    setDepositPreview(Number(lease.deposit_amount || 0));

    try {
      const r = lease?.room_id ? getRoom(lease.room_id) : null;
      setRoomCode(r?.code || '');
    } catch {}
    try {
      const tnt = lease?.tenant_id ? getTenant(lease.tenant_id) : null;
      setTenantName(tnt?.full_name || '');
      setTenantPhone(tnt?.phone || '');
    } catch {}

    if (cyc.invoice_id) {
      setInvId(cyc.invoice_id);
      const inv = getInvoice(cyc.invoice_id);
      setInvTotal(inv?.total || 0);

      const items = getInvoiceItems(cyc.invoice_id) as any[];
      setSettledItems(items || []);

      const map: Record<string, number> = {};
      for (const it of items) {
        if (it.charge_type_id && it.meta_json) {
          try {
            const m = JSON.parse(it.meta_json);
            if (typeof m?.meter_end === 'number')
              map[it.charge_type_id] = m.meter_end;
          } catch {}
        }
      }
      setCurrentReadings(map);

      if (String(cyc.status) === 'settled') {
        setRows([]);
      } else {
        const list = listChargesForLease(lease.id) as any[];
        const normalized: ChargeRow[] = list.map(it => ({
          charge_type_id: it.charge_type_id,
          name: it.name,
          unit: it.unit,
          is_variable: Number(it.is_variable),
          unit_price: Number(it.unit_price) || 0,
          meter_start: Number(it.meter_start) || 0,
          value: it.is_variable
            ? ''
            : formatVNMoneyTyping(String(it.unit_price ?? '')),
        }));
        setRows(normalized);
      }
    } else {
      const list = listChargesForLease(lease.id) as any[];
      const normalized: ChargeRow[] = list.map(it => ({
        charge_type_id: it.charge_type_id,
        name: it.name,
        unit: it.unit,
        is_variable: Number(it.is_variable),
        unit_price: Number(it.unit_price) || 0,
        meter_start: Number(it.meter_start) || 0,
        value: it.is_variable
          ? ''
          : formatVNMoneyTyping(String(it.unit_price ?? '')),
      }));
      setRows(normalized);
      setInvId(undefined);
      setInvTotal(0);
      setCurrentReadings({});
      setSettledItems([]);
    }
  };

  useEffect(reload, [cycleId]);
  useEffect(() => {
    if (invId) loadPayments();
  }, [invId, status]);

  // Nếu mở từ danh sách Unpaid với openCollect=true => tự mở popup thu (sau khi có inv)
  useEffect(() => {
    if (openCollect && invId) {
      openPay();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openCollect, invId]);

  const previewTotal = useMemo(() => {
    let sum = 0;
    for (const r of rows) {
      if (r.is_variable === 1) {
        const current = parseAmountInt(r.value);
        const consumed = Math.max(0, current - (r.meter_start || 0));
        sum += consumed * (r.unit_price || 0);
      } else {
        sum += parseDecimalCommaStrict(r.value);
      }
    }
    for (const ex of extras) sum += parseAmountInt(ex.amount);
    return sum;
  }, [rows, extras]);
  useEffect(() => {
    const p: any = route?.params || {};
    if (p?.openCollect && invId) {
      openCollectPopup();
      // Xóa cờ để không mở lại lần sau
      try {
        navigation.setParams({ ...p, openCollect: undefined });
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params, invId, invTotal, payments]);

  const { elecTotal, waterTotal, previewElecTotal, previewWaterTotal } =
    useMemo(() => {
      const isWater = (u?: string | null) =>
        (u || '').toLowerCase().includes('m3') || (u || '').includes('m³');
      const isElec = (u?: string | null) =>
        (u || '').toLowerCase().includes('kwh');
      let _elec = 0,
        _water = 0,
        _pElec = 0,
        _pWater = 0;

      if (status === 'settled' && invId) {
        const items = getInvoiceItems(invId) as any[];
        for (const it of items) {
          const unit = (it.unit || '').toLowerCase();
          if (unit.includes('kwh')) _elec += Number(it.amount) || 0;
          if (unit.includes('m3') || unit.includes('m³'))
            _water += Number(it.amount) || 0;
        }
      } else {
        for (const r of rows) {
          if (r.is_variable !== 1) continue;
          const current = parseAmountInt(r.value);
          const consumed = Math.max(0, current - (r.meter_start || 0));
          const money = consumed * (r.unit_price || 0);
          if (isElec(r.unit)) _pElec += money;
          if (isWater(r.unit)) _pWater += money;
        }
      }
      return {
        elecTotal: _elec,
        waterTotal: _water,
        previewElecTotal: _pElec,
        previewWaterTotal: _pWater,
      };
    }, [rows, status, invId]);

  const onChangeVarValue = (id: string, text: string) => {
    setRows(prev =>
      prev.map(r =>
        r.charge_type_id === id ? { ...r, value: formatIntTyping(text) } : r,
      ),
    );
  };
  const onChangeFixedValue = (id: string, text: string) => {
    const formatted = formatVNMoneyTyping(text);
    setRows(prev =>
      prev.map(r => (r.charge_type_id === id ? { ...r, value: formatted } : r)),
    );
  };

  function validateBeforeSettle(): string | null {
    for (const r of rows) {
      if (r.is_variable === 1) {
        const raw = (r.value || '').replace(/[^\d]/g, '');
        if (!raw) return t('cycleDetail.errVarRequired', { name: r.name });
        const cur = Number(raw);
        const start = Number(r.meter_start || 0);
        if (cur < start)
          return t('cycleDetail.errVarLessThanStart', { name: r.name, start });
      } else {
        if ((r.value || '').trim() === '')
          return t('cycleDetail.errFixedRequired', { name: r.name });
      }
    }
    for (let i = 0; i < extras.length; i++) {
      const ex = extras[i];
      const hasName = ex.name.trim().length > 0;
      const hasAmt = (ex.amount || '').replace(/[^\d,]/g, '').trim().length > 0;
      if (hasName !== hasAmt)
        return t('cycleDetail.errExtraIncomplete', { index: i + 1 });
    }
    return null;
  }

  function saveEdits(scope: 'cycle' | 'lease') {
    if (scope === 'lease') {
      for (const r of rows) {
        if (r.is_variable === 0) {
          const newPrice = parseDecimalCommaStrict(r.value);
          if (newPrice !== r.unit_price)
            updateRecurringChargePrice(leaseId, r.charge_type_id, newPrice);
        }
      }
      Alert.alert(t('cycleDetail.saved'), t('cycleDetail.fixedPriceUpdated'));
      setEditMode(false);
      reload();
      return;
    }

    const variableInputs: Array<{
      charge_type_id: string;
      quantity: number;
      meter_end?: number;
    }> = [];
    const adjustments: Array<{ name: string; amount: number }> = [];

    for (const r of rows) {
      if (r.is_variable === 1) {
        const current = parseAmountInt(r.value);
        const consumed = Math.max(0, current - (r.meter_start || 0));
        variableInputs.push({
          charge_type_id: r.charge_type_id,
          quantity: consumed,
          meter_end: current,
        });
      } else {
        const newPrice = parseDecimalCommaStrict(r.value);
        const delta = newPrice - (r.unit_price || 0);
        if (delta !== 0)
          adjustments.push({
            name: `${t('cycleDetail.adjust')} ${r.name}`,
            amount: delta,
          });
      }
    }
    for (const ex of extras) {
      const amt = parseAmountInt(ex.amount);
      if (ex.name.trim() && amt > 0)
        adjustments.push({ name: ex.name.trim(), amount: amt });
    }

    const inv = settleCycleWithInputs(cycleId, variableInputs, adjustments);
    setEditMode(false);
    setStatus('settled');
    setInvId(inv.id);
    setInvTotal(inv.total || 0);
    setExtras([]);

    // Tạo payload QR động + render ẩn để lưu PNG vào invoice
    (async () => {
      try {
        const pp = await loadPaymentProfile(); // { bankBin, accountNumber, accountName, ... }
        if (pp?.bankBin && pp?.accountNumber) {
          const payload = buildVietQRPayload({
            bin: String(pp.bankBin),
            accountNumber: String(pp.accountNumber),
            accountName: pp.accountName,
            amount: Number(inv.total || 0),
            addInfo: inv.code || inv.id, // nội dung CK = mã hóa đơn
            isDynamic: true,
          });
          setQrPayload(payload);
          setQrTarget({ invId: inv.id });
        }
      } catch {}
    })();
    reload();
    onSettled?.();

    try {
      const isMonthly = String(leaseInfo?.billing_cycle) === 'monthly';
      const nextSettle = new Date(period.e);
      if (isMonthly) nextSettle.setMonth(nextSettle.getMonth() + 1);
      else nextSettle.setDate(nextSettle.getDate() + 1);
      const nextISO = nextSettle.toISOString().slice(0, 10);
      scheduleReminder(
        `lease_${leaseId}_cycle_settle_${nextISO}`,
        t('notify.settleTitle') || 'Tất toán kỳ',
        t('notify.settleMsg') ||
          'Hôm nay đến ngày tất toán kỳ. Vui lòng xử lý.',
        nextISO,
      );
    } catch {}

    if (isFixedTerm && isLastCycle(cycleId)) {
      Alert.alert(t('cycleDetail.lastCycle'), t('cycleDetail.lastCycleAsk'), [
        {
          text: t('cycleDetail.endLease'),
          onPress: () => setShowEndModal(true),
        },
        {
          text: t('cycleDetail.keepLease'),
          onPress: () => setShowExtendModal(true),
        },
        { text: t('common.close'), style: 'cancel' },
      ]);
    } else {
      Alert.alert(
        t('common.done'),
        t('cycleDetail.settledOkLocked') || 'Đã tất toán. Dữ liệu đã bị khóa.',
      );
      markHappyEvent();
      setTimeout(() => maybeAskForReview(), 800);
    }
  }

  async function shareInvoiceHtml() {
    if (!invId) {
      Alert.alert(
        t('common.error'),
        t('cycleDetail.noInvoiceYet') || 'Chưa có hóa đơn',
      );
      return;
    }
    const rawInv = getInvoice(invId);
    const items = (getInvoiceItems(invId) || []) as any[];
    const branding = await loadPaymentProfile();
    const invForDoc = {
      ...rawInv,
      id: rawInv?.id || invId,
      code: rawInv?.code || invId,
      room_code: roomCode || rawInv?.room_code,
      tenant_name: tenantName || rawInv?.tenant_name,
      tenant_phone: tenantPhone || rawInv?.tenant_phone,
      issue_date: rawInv?.issue_date || new Date().toISOString().slice(0, 10),
      period_start: period.s,
      period_end: period.e,
      subtotal: rawInv?.subtotal,
      discount: rawInv?.discount || 0,
      tax: rawInv?.tax || 0,
      total: rawInv?.total,
      notes: rawInv?.notes || '',
    };
    try {
      const path = await createInvoiceHtmlFile(invForDoc, items, t, format, {
        lang: language,
        dir: language === 'ar' ? 'rtl' : 'ltr',
        branding,
      });
      await Share.open({
        url: `file://${path}`,
        type: 'text/html',
        failOnCancel: false,
      });
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to create document');
    }
  }

  // Phân tách "Kỳ mở đầu"
  const { openingItems, openingMeta, openingAmount, normalItems } =
    useMemo(() => {
      const open: any[] = [];
      const rest: any[] = [];
      let meta: any = null;
      for (const it of settledItems || []) {
        try {
          const m = it.meta_json ? JSON.parse(it.meta_json) : null;
          if (m?.opening === true) {
            open.push(it);
            if (!meta) meta = m;
          } else rest.push(it);
        } catch {
          rest.push(it);
        }
      }
      const amt = open.reduce((s, x) => s + (Number(x.amount) || 0), 0);
      return {
        openingItems: open,
        openingMeta: meta,
        openingAmount: amt,
        normalItems: rest,
      };
    }, [settledItems]);

  const sharePlainText = async () => {
    try {
      let branding: any = {};
      try {
        branding = await loadPaymentProfile();
      } catch {}

      const lines: string[] = [];
      const titleRoom = roomCode
        ? t('common.room') + ` ${roomCode}`
        : t('invoice.title');
      lines.push(`🧾 ${titleRoom}`);
      if (tenantName) lines.push(`👤 ${t('tenants')}: ${tenantName}`);
      lines.push(
        `📅 ${t('cycleDetail.period')}: ${formatDateISO(
          period.s,
          dateFormat,
          language,
        )} – ${formatDateISO(period.e, dateFormat, language)}`,
      );
      lines.push('');

      if (status === 'settled' && invId) {
        if (openingItems.length > 0)
          lines.push(
            `• ${t('cycleDetail.openingCycle')}: ${format(openingAmount)}`,
          );
        for (const it of normalItems) {
          const name =
            it.description === 'rent.roomprice'
              ? t('leaseForm.baseRent') || 'Giá thuê'
              : it.description;
          lines.push(`• ${name}: ${format(it.amount)}`);
        }
        lines.push('— — —');
        lines.push(`🔢 ${t('cycleDetail.total')}: ${format(invTotal)}`);

        // Thêm lịch sử thanh toán
        try {
          const pays = queryPaymentsOfInvoice
            ? queryPaymentsOfInvoice(invId)
            : [];
          if (pays.length) {
            lines.push('');
            lines.push(`💳 ${t('invoice.payments') || 'Thanh toán'}`);
            let paidSum = 0;
            for (const p of pays) {
              const amt = Number(p.amount || 0);
              paidSum += amt;
              lines.push(
                `• ${format(amt)} — ${
                  p.method || t('invoice.cash') || 'Tiền mặt'
                } — ${formatDateISO(p.payment_date, dateFormat, language)}`,
              );
            }
            lines.push(
              `= ${t('invoice.paidTotal') || 'Đã thanh toán'}: ${format(
                paidSum,
              )}`,
            );
            const bal = (invTotal || 0) - paidSum;
            lines.push(
              `${
                bal > 0
                  ? '⚖️ ' + (t('invoice.balance') || 'Còn lại')
                  : '✅ ' + (t('invoice.fullyPaid') || 'Đã thanh toán đủ')
              }: ${format(Math.max(bal, 0))}`,
            );
          }
        } catch {}
      } else {
        for (const r of rows) {
          if (r.is_variable === 1) {
            const current = parseAmountInt(r.value);
            const consumed = Math.max(0, current - (r.meter_start || 0));
            const money = consumed * (r.unit_price || 0);
            lines.push(
              `• ${r.name}: ${format(money)} (${consumed} × ${format(
                r.unit_price,
              )})`,
            );
          } else {
            const amt = parseDecimalCommaStrict(
              r.value || String(r.unit_price),
            );
            lines.push(`• ${r.name}: ${format(amt)}`);
          }
        }
        for (const ex of extras) {
          const amt = parseAmountInt(ex.amount);
          if (ex.name.trim() && amt > 0)
            lines.push(`• ${ex.name.trim()}: ${format(amt)}`);
        }
        lines.push('— — —');
        lines.push(`🔢 ${t('invoice.subtotal')}: ${format(previewTotal)}`);
      }

      // Thông tin thanh toán (PaymentProfile)
      if (
        branding?.brandName ||
        branding?.bankName ||
        branding?.accountName ||
        branding?.accountNumber ||
        branding?.note
      ) {
        lines.push('');
        lines.push(`🏦 ${t('payment.title') || 'Thông tin thanh toán'}`);
        if (branding.brandName) lines.push(`• ${branding.brandName}`);
        if (branding.bankName)
          lines.push(
            `• ${t('payment.bankName') || 'Ngân hàng'}: ${branding.bankName}`,
          );
        if (branding.accountName)
          lines.push(
            `• ${t('payment.accountName') || 'Tên TK'}: ${
              branding.accountName
            }`,
          );
        if (branding.accountNumber)
          lines.push(
            `• ${t('payment.accountNumber') || 'Số TK'}: ${
              branding.accountNumber
            }`,
          );
        if (branding.note)
          lines.push(
            `• ${t('payment.note') || 'Nội dung CK'}: ${branding.note}`,
          );
      }

      lines.push('');
      lines.push(t('cycleDetail.thank'));

      const payload: any = {
        message: lines.join('\n'),
        subject: `${t('invoice.title')} ${titleRoom}`,
        failOnCancel: false,
      };

      // Ưu tiên QR theo hóa đơn (qr_png_path), fallback QR chung (branding.qrPath)
      try {
        if (invId) {
          const invRow = getInvoice(invId);
          if (invRow?.qr_png_path) {
            payload.url = invRow.qr_png_path;
          } else if (branding?.qrPath) {
            payload.url = branding.qrPath;
          }
        } else if (branding?.qrPath) {
          payload.url = branding.qrPath;
        }
      } catch {}

      await Share.open(payload);
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('common.tryAgain'));
    }
  };
const sendReminder = async () => {
  if (!invId) return;
  try {
    const paid = (payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const balance = Math.max((invTotal || 0) - paid, 0);

    const cfg = getEffectiveLateFeeConfig(leaseId);
    const daysLate = calcDaysLate(period.e, cfg, new Date());
    const lateFeePreview = computeLateFeePreview(balance, daysLate, cfg);

    const msg =
      [
        `⏰ ${t('invoice.reminder') || 'Payment reminder'}`,
        `${t('common.room')}: ${roomCode || '—'}`,
        `${t('cycleDetail.period')}: ${formatDateISO(period.s, dateFormat, language)} – ${formatDateISO(period.e, dateFormat, language)}`,
        `• ${t('invoice.total') || 'Total'}: ${format(invTotal)}`,
        `• ${t('invoice.paidTotal') || 'Paid'}: ${format(paid)}`,
        `• ${t('invoice.balance') || 'Balance'}: ${format(balance)}`,
        daysLate > 0
          ? `• ${t('invoice.daysLate') || 'Days late'}: ${daysLate} ${
              lateFeePreview > 0
                ? `(${t('invoice.lateFeePreview') || 'Late fee preview'}: ${format(lateFeePreview)})`
                : ''
            }`
          : '',
        '',
        t('invoice.reminderTail') ||
          'Please complete the payment at your earliest convenience. Thank you!'
      ]
        .filter(Boolean)
        .join('\n');

    await Share.open({ message: msg, failOnCancel: false });
    // Nếu muốn nút riêng gửi SMS thẳng:
    // Linking.openURL(`sms:&body=${encodeURIComponent(msg)}`).catch(()=>{});
  } catch (e: any) {
    Alert.alert(t('common.error'), e?.message || t('common.tryAgain'));
  }
};

  const saveSupplemental = () => {
    const valids = suppItems
      .map(it => ({ name: it.name.trim(), amount: parseAmountInt(it.amount) }))
      .filter(it => it.name && it.amount > 0);
    if (valids.length === 0) {
      Alert.alert(
        t('common.missingInfo'),
        t('cycleDetail.errExtraIncomplete') || 'Vui lòng nhập đủ tên & số tiền',
      );
      return;
    }
    try {
      addSupplementChargesToCycle(cycleId, valids);
      setShowAddModal(false);
      setSuppItems([]);
      reload();
      Alert.alert(
        t('common.success'),
        t('common.success') || 'Đã thêm khoản thu bổ sung',
      );
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('common.tryAgain'));
    }
  };

  // ======= RENDER =======
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {!editMode ? (
        <ViewShot
          ref={shotRef}
          options={{ format: 'png', quality: 1 }}
          collapsable={false}
          style={{ flex: 1 }}
        >
          <ScrollView
            ref={scrollRef}
            onContentSizeChange={(_, h) => setContentH(h)}
            scrollEnabled={!capturing}
            style={
              capturing
                ? {
                    height: Math.max(contentH, Dimensions.get('window').height),
                  }
                : undefined
            }
            contentContainerStyle={{
              padding: 12,
              paddingBottom: insets.bottom + 64,
              gap: 12,
            }}
            showsVerticalScrollIndicator
            contentInsetAdjustmentBehavior="automatic"
            keyboardShouldPersistTaps="handled"
          >
            {/* Room & tenant */}
            <Card>
              <Text
                style={{ color: c.text, fontWeight: '700', marginBottom: 6 }}
              >
                {t('cycleDetail.roomInfo')}
              </Text>
              <Text style={{ color: roomCode ? c.text : c.subtext }}>
                {t('common.room')}: {roomCode || '—'}
              </Text>

              <Text
                style={{
                  color: c.text,
                  fontWeight: '700',
                  marginTop: 10,
                  marginBottom: 6,
                }}
              >
                {t('cycleDetail.tenant')}
              </Text>
              {tenantName || tenantPhone ? (
                <Text style={{ color: c.text }}>
                  {tenantName || '—'}
                  {tenantPhone ? ` — ${tenantPhone}` : ''}
                </Text>
              ) : (
                <Text style={{ color: c.subtext }}>
                  {t('cycleDetail.noTenant')}
                </Text>
              )}
            </Card>

            {/* Period & invoice */}
            <Card>
              <Text style={{ color: c.text }}>
                {t('cycleDetail.period')}:{' '}
                {formatDateISO(period.s, dateFormat, language)} -{' '}
                {formatDateISO(period.e, dateFormat, language)}
              </Text>
              <Text style={{ color: c.text }}>
                {t('cycleDetail.status')}:{' '}
                {status === 'open' ? t('common.open') : t('common.close')}{' '}
              </Text>
              {invId ? (
                <Text style={{ color: c.text }}>
                  {t('cycleDetail.invoiceTotal')}: {format(invTotal)}
                </Text>
              ) : null}
            </Card>

            {/* Fees */}
            <Card style={{ gap: 10 }}>
              <Text style={{ color: c.text, fontWeight: '700' }}>
                {t('cycleDetail.fees')}
              </Text>

              {status === 'settled' && settledItems.length > 0 ? (
                <>
                  {/* Opening cycle */}
                  {openingItems.length > 0 && (
                    <View style={{ borderRadius: 10, padding: 10 }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          marginBottom: 6,
                        }}
                      >
                        <Text style={{ color: c.text, fontWeight: '700' }}>
                          {t('cycleDetail.openingCycle') || 'Kỳ mở đầu'}
                        </Text>
                      </View>
                      {openingMeta?.for_period_start &&
                      openingMeta?.for_period_end ? (
                        <Text style={{ color: c.subtext, marginBottom: 4 }}>
                          {t('cycleDetail.forPeriod')}:{' '}
                          <Text style={{ color: c.text }}>
                            {formatDateISO(
                              openingMeta.for_period_start,
                              dateFormat,
                              language,
                            )}{' '}
                            -{' '}
                            {formatDateISO(
                              openingMeta.for_period_end,
                              dateFormat,
                              language,
                            )}
                          </Text>
                        </Text>
                      ) : null}
                      <Text style={{ color: c.subtext }}>
                        {t('cycleDetail.amount')}:{' '}
                        <Text style={{ color: c.text }}>
                          {format(openingAmount)}
                        </Text>{' '}
                      </Text>
                    </View>
                  )}

                  {/* Normal items */}
                  {normalItems.map(it => {
                    let meterInfo: { start?: number; end?: number } = {};
                    let forStart: string | undefined;
                    let forEnd: string | undefined;
                    if (it.meta_json) {
                      try {
                        const m = JSON.parse(it.meta_json);
                        if (typeof m?.meter_start === 'number')
                          meterInfo.start = m.meter_start;
                        if (typeof m?.meter_end === 'number')
                          meterInfo.end = m.meter_end;
                        if (m?.for_period_start) forStart = m.for_period_start;
                        if (m?.for_period_end) forEnd = m.for_period_end;
                      } catch {}
                    }
                    return (
                      <View
                        key={it.id}
                        style={{ borderRadius: 10, padding: 10 }}
                      >
                        <View
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            marginBottom: 6,
                          }}
                        >
                          <Text style={{ color: c.text, fontWeight: '700' }}>
                            {it.description === 'rent.roomprice'
                              ? t('leaseForm.baseRent')
                              : it.description}
                          </Text>
                          <Text style={{ color: c.subtext }}>
                            {it.unit
                              ? `(${
                                  it.unit === 'rent.month'
                                    ? t('rent.month')
                                    : it.unit === 'tháng'
                                    ? t('rent.month')
                                    : t('rent.unit')
                                })`
                              : t('cycleDetail.fixed')}
                          </Text>
                        </View>

                        {forStart && forEnd ? (
                          <Text style={{ color: c.subtext, marginBottom: 4 }}>
                            {t('cycleDetail.forPeriod')}:{' '}
                            <Text style={{ color: c.text }}>
                              {formatDateISO(forStart, dateFormat, language)} -{' '}
                              {formatDateISO(forEnd, dateFormat, language)}
                            </Text>
                          </Text>
                        ) : null}

                        {!!(
                          meterInfo.start != null || meterInfo.end != null
                        ) && (
                          <Text style={{ color: c.subtext, marginBottom: 4 }}>
                            {t('cycleDetail.prevIndex')}:{' '}
                            <Text style={{ color: c.text }}>
                              {groupVN(String(meterInfo.start ?? 0))}
                            </Text>
                            {'  '}•{'  '}
                            {t('cycleDetail.currIndex')}:{' '}
                            <Text style={{ color: c.text }}>
                              {groupVN(String(meterInfo.end ?? 0))}
                            </Text>
                          </Text>
                        )}

                        <Text style={{ color: c.subtext }}>
                          {t('cycleDetail.qtyShort')}:{' '}
                          <Text style={{ color: c.text }}>
                            {it.quantity ?? 1}
                          </Text>{' '}
                          • {t('cycleDetail.unitPrice')}:{' '}
                          <Text style={{ color: c.text }}>
                            {format(it.unit_price)}
                          </Text>{' '}
                          • {t('cycleDetail.amount')}:{' '}
                          <Text style={{ color: c.text }}>
                            {format(it.amount)}
                          </Text>
                        </Text>
                      </View>
                    );
                  })}
                </>
              ) : (
                <>
                  {rows.map(r => (
                    <View
                      key={r.charge_type_id}
                      style={{ borderRadius: 10, padding: 10 }}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          marginBottom: 6,
                        }}
                      >
                        <Text style={{ color: c.text, fontWeight: '700' }}>
                          {r.name}
                        </Text>
                        <Text style={{ color: c.subtext }}>
                          {r.is_variable
                            ? `${t('cycleDetail.variable')} (${r.unit || ''})`
                            : t('cycleDetail.fixed')}
                        </Text>
                      </View>

                      {r.is_variable === 1 ? (
                        <>
                          <Text style={{ color: c.subtext }}>
                            {t('cycleDetail.unitPrice')}:{' '}
                            <Text style={{ color: c.text }}>
                              {format(r.unit_price)}
                            </Text>{' '}
                            / {r.unit || t('cycleDetail.unitShort')}
                          </Text>
                          <Text style={{ color: c.subtext }}>
                            {t('cycleDetail.startIndex')}:{' '}
                            <Text style={{ color: c.text }}>
                              {groupVN(String(r.meter_start || 0))}
                            </Text>
                          </Text>
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              marginTop: 8,
                            }}
                          >
                            <Text style={{ color: c.subtext, flex: 1 }}>
                              {t('cycleDetail.currentIndex')}
                            </Text>
                            <Text
                              style={{
                                color: r.value ? c.text : c.subtext,
                                textAlign: 'right',
                              }}
                            >
                              {r.value
                                ? groupVN(
                                    String(
                                      parseInt(
                                        (r.value || '').replace(/\D/g, ''),
                                        10,
                                      ) || 0,
                                    ),
                                  )
                                : t('cycleDetail.notEntered')}
                            </Text>
                          </View>
                        </>
                      ) : (
                        <>
                          <Text style={{ color: c.subtext }}>
                            {t('cycleDetail.contractBase')}:{' '}
                            <Text style={{ color: c.text }}>
                              {format(r.unit_price)}
                            </Text>
                          </Text>
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              marginTop: 8,
                            }}
                          >
                            <Text style={{ color: c.subtext, flex: 1 }}>
                              {t('cycleDetail.priceThisCycle')}
                            </Text>
                            <Text style={{ color: c.text, textAlign: 'right' }}>
                              {format(
                                parseDecimalCommaStrict(
                                  r.value || String(r.unit_price),
                                ),
                              )}
                            </Text>
                          </View>
                        </>
                      )}
                    </View>
                  ))}
                </>
              )}
            </Card>

            {/* Lịch sử thanh toán */}
            {invId && payments.length > 0 && (
              <Card>
                <Text
                  style={{ color: c.text, fontWeight: '700', marginBottom: 6 }}
                >
                  {t('invoice.payments') || 'Thanh toán'}
                </Text>
                {payments.map((p, i) => (
                  <Text key={i} style={{ color: c.text }}>
                    • {format(Number(p.amount) || 0)} —{' '}
                    {p.method || t('invoice.cash') || 'cash'} —{' '}
                    {formatDateISO(p.payment_date, dateFormat, language)}
                  </Text>
                ))}
                {(() => {
                  const paid = payments.reduce(
                    (s, p) => s + (Number(p.amount) || 0),
                    0,
                  );
                  const bal = Math.max((invTotal || 0) - paid, 0);
                  return (
                    <>
                      <Text style={{ color: c.text, marginTop: 4 }}>
                        {t('invoice.paidTotal') || 'Đã thanh toán'}:{' '}
                        {format(paid)}
                      </Text>
                      <Text style={{ color: c.text }}>
                        {t('invoice.balance') || 'Còn lại'}: {format(bal)}
                      </Text>
                    </>
                  );
                })()}
              </Card>
            )}

            {/* Thu bổ sung */}
            {status === 'settled' ? (
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'flex-end',
                  gap: 8,
                }}
              >
                {invId ? (
                  <Button
                    title={t('invoice.collect')}
                    variant="ghost"
                    onPress={openCollectPopup}
                  />
                ) : null}
                <Button
                  title={t('cycleDetail.collectMore') || 'Thu bổ sung'}
                  onPress={() => {
                    setSuppItems([{ name: '', amount: '' }]);
                    setShowAddModal(true);
                  }}
                />
              </View>
            ) : null}
          </ScrollView>

          {/* Bottom action bar */}
          {status === 'settled' ? (
            <View
              style={{
                justifyContent: 'flex-end',
                position: 'absolute',
                left: 12,
                right: 12,
                bottom: insets.bottom + 8,
                flexDirection: 'row',
                gap: 12,
              }}
            >
              <Button title={t('invoice.reminderBtn') || 'Send reminder'} variant="ghost" onPress={sendReminder} />
              <Button
                title={t('cycleDetail.shareText')}
                variant="ghost"
                onPress={sharePlainText}
              />
              <Button
                title={t('cycleDetail.share')}
                onPress={shareInvoiceHtml}
              />
            </View>
          ) : (
            <View
              style={{
                justifyContent: 'flex-end',
                position: 'absolute',
                left: 12,
                right: 12,
                bottom: insets.bottom + 8,
                flexDirection: 'row',
                gap: 12,
              }}
            >
              <Button
                title={t('cycleDetail.settleNow')}
                onPress={() => setEditMode(true)}
              />
            </View>
          )}
        </ViewShot>
      ) : (
        // ===== Edit mode =====
        <ScrollView
          contentContainerStyle={{
            padding: 12,
            paddingBottom: insets.bottom + 64,
            gap: 12,
          }}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
        >
          <Card style={{ gap: 10 }}>
            <Text style={{ color: c.text, fontWeight: '700' }}>
              {t('cycleDetail.fees')}
            </Text>

            {rows.map(r => {
              const isVar = r.is_variable === 1;
              const current = parseAmountInt(r.value);
              const consumed = isVar
                ? Math.max(0, current - (r.meter_start || 0))
                : 0;
              const partial = isVar
                ? consumed * (r.unit_price || 0)
                : parseDecimalCommaStrict(r.value);

              return (
                <View
                  key={r.charge_type_id}
                  style={{ borderRadius: 10, padding: 10 }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      marginBottom: 6,
                    }}
                  >
                    <Text style={{ color: c.text, fontWeight: '700' }}>
                      {r.name}
                    </Text>
                    <Text style={{ color: c.subtext }}>
                      {isVar
                        ? `${t('cycleDetail.variable')} (${r.unit || ''})`
                        : t('cycleDetail.fixed')}
                    </Text>
                  </View>

                  {isVar ? (
                    <>
                      <Text style={{ color: c.subtext }}>
                        {t('cycleDetail.unitPrice')}:{' '}
                        <Text style={{ color: c.text }}>
                          {format(r.unit_price)}
                        </Text>{' '}
                        / {r.unit || t('cycleDetail.unitShort')}
                      </Text>
                      <Text style={{ color: c.subtext }}>
                        {t('cycleDetail.prevIndex')}:{' '}
                        <Text style={{ color: c.text }}>
                          {groupVN(String(r.meter_start || 0))}
                        </Text>
                      </Text>

                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          marginTop: 8,
                        }}
                      >
                        <Text style={{ color: c.subtext, flex: 1 }}>
                          {t('cycleDetail.currentIndex')}
                        </Text>
                        <FormInput
                          style={{ flex: 1 }}
                          keyboardType="numeric"
                          value={r.value}
                          onChangeText={t2 =>
                            onChangeVarValue(r.charge_type_id, t2)
                          }
                        />
                        {/* Scan meter button (optional) */}
                      </View>

                      <Text style={{ color: c.subtext, marginTop: 6 }}>
                        {t('cycleDetail.consumed')}:{' '}
                        <Text style={{ color: c.text }}>
                          {groupVN(String(consumed))}
                        </Text>{' '}
                        {r.unit || t('cycleDetail.unitShort')} —{' '}
                        {t('cycleDetail.amount')}:{' '}
                        <Text style={{ color: c.text }}>{format(partial)}</Text>
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={{ color: c.subtext }}>
                        {t('cycleDetail.contractBase')}:{' '}
                        <Text style={{ color: c.text }}>
                          {format(r.unit_price)}
                        </Text>
                      </Text>

                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          marginTop: 8,
                        }}
                      >
                        <Text style={{ color: c.subtext, flex: 1 }}>
                          {t('cycleDetail.priceThisCycle')}
                        </Text>
                        <FormInput
                          style={{ flex: 1 }}
                          keyboardType="decimal-pad"
                          value={r.value}
                          onChangeText={t2 =>
                            onChangeFixedValue(r.charge_type_id, t2)
                          }
                        />
                      </View>

                      <Text style={{ color: c.subtext, marginTop: 6 }}>
                        {t('cycleDetail.amount')}:{' '}
                        <Text style={{ color: c.text }}>{format(partial)}</Text>
                      </Text>
                    </>
                  )}
                </View>
              );
            })}

            {/* Phụ phí phát sinh */}
            <View style={{ marginTop: 4 }}>
              <Text
                style={{ color: c.text, fontWeight: '700', marginBottom: 6 }}
              >
                {t('cycleDetail.extraFees')}
              </Text>
              {extras.map((ex, idx) => (
                <View key={idx} style={{ gap: 6, marginBottom: 8 }}>
                  <FormInput
                    placeholder={t('cycleDetail.feeName')}
                    placeholderTextColor={c.subtext}
                    value={ex.name}
                    onChangeText={t2 => updateExtra(idx, { name: t2 })}
                    style={{
                      borderRadius: 10,
                      padding: 10,
                      color: c.text,
                      backgroundColor: c.card,
                    }}
                  />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <FormInput
                      style={{ flex: 1 }}
                      placeholder={t('cycleDetail.amountPlaceholder')}
                      keyboardType="decimal-pad"
                      value={ex.amount}
                      onChangeText={t2 =>
                        updateExtra(idx, {
                          amount: formatDecimalTypingVNStrict(t2),
                        })
                      }
                    />
                    <Button
                      title={t('common.delete')}
                      variant="ghost"
                      onPress={() => removeExtra(idx)}
                    />
                  </View>
                </View>
              ))}
              <Button
                title={t('cycleDetail.addExtra')}
                variant="ghost"
                onPress={addExtra}
              />
            </View>

            <View style={{ marginTop: 10 }}>
              <Text style={{ color: c.text, fontWeight: '700' }}>
                {t('cycleDetail.previewTotal')}: {format(previewTotal)}
              </Text>
              {invId ? (
                <Text style={{ color: c.subtext }}>
                  ({t('cycleDetail.currentInvoice')}: {format(invTotal)})
                </Text>
              ) : null}
            </View>
          </Card>

          <View
            style={{
              justifyContent: 'flex-end',
              position: 'absolute',
              left: 12,
              right: 12,
              bottom: insets.bottom + 8,
              flexDirection: 'row',
              gap: 12,
            }}
          >
            <Button
              title={t('common.cancel')}
              variant="ghost"
              onPress={() => {
                setEditMode(false);
                setExtras([]);
              }}
            />
            <Button
              title={t('cycleDetail.settleNow')}
              onPress={() => {
                const err = validateBeforeSettle();
                if (err) Alert.alert(t('common.missingInfo'), err);
                else setShowConfirmSettle(true);
              }}
            />
          </View>
        </ScrollView>
      )}

      {/* Modal kết thúc hợp đồng */}
      <Modal
        visible={showEndModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEndModal(false)}
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
              padding: 16,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              gap: 10,
            }}
          >
            <Text style={{ color: c.text, fontWeight: '800', fontSize: 16 }}>
              {t('cycleDetail.endLeaseTitle')}
            </Text>
            <Text style={{ color: c.text }}>
              {t('cycleDetail.deposit')}: {format(depositPreview)}
            </Text>

            <Card style={{ gap: 8 }}>
              <Text style={{ color: c.text, fontWeight: '700' }}>
                {t('cycleDetail.extraFees')}
              </Text>
              {endExtras.map((ex, idx) => (
                <View key={idx} style={{ gap: 6 }}>
                  <FormInput
                    placeholder={t('cycleDetail.itemName')}
                    placeholderTextColor={c.subtext}
                    value={ex.name}
                    onChangeText={t2 => updEndExtra(idx, { name: t2 })}
                    style={{
                      borderRadius: 10,
                      padding: 10,
                      color: c.text,
                      backgroundColor: c.card,
                    }}
                  />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <FormInput
                      style={{ flex: 1 }}
                      placeholder={t('cycleDetail.amountWithHint')}
                      keyboardType="decimal-pad"
                      value={ex.amount}
                      onChangeText={t2 =>
                        updEndExtra(idx, {
                          amount: formatDecimalTypingVNStrict(t2),
                        })
                      }
                    />
                    <Button
                      title={t('common.delete')}
                      variant="ghost"
                      onPress={() => delEndExtra(idx)}
                    />
                  </View>
                </View>
              ))}
              <Button
                title={t('cycleDetail.addItem')}
                variant="ghost"
                onPress={addEndExtra}
              />
            </Card>

            <Text style={{ color: c.text }}>
              {t('cycleDetail.extraTotal')}: {format(endExtrasTotal)}
            </Text>
            <Text style={{ color: c.text, fontWeight: '700' }}>
              {t('cycleDetail.balanceAfter')}:{' '}
              {format(depositPreview - endExtrasTotal)}
            </Text>
            <Text style={{ color: c.subtext }}>
              {depositPreview - endExtrasTotal > 0
                ? `- ${t('cycleDetail.refundToTenant')}: ${format(
                    depositPreview - endExtrasTotal,
                  )}`
                : depositPreview - endExtrasTotal < 0
                ? `- ${t('cycleDetail.collectFromTenant')}: ${format(
                    Math.abs(depositPreview - endExtrasTotal),
                  )}`
                : `- ${t('cycleDetail.noFurther')}`}
            </Text>

            <View
              style={{
                justifyContent: 'flex-end',
                position: 'absolute',
                left: 12,
                right: 12,
                bottom: insets.bottom + 8,
                flexDirection: 'row',
                gap: 12,
              }}
            >
              <Button
                title={t('common.cancel')}
                variant="ghost"
                onPress={() => setShowEndModal(false)}
              />
              <Button
                title={t('cycleDetail.finish')}
                onPress={() => {
                  const payload = endExtras
                    .filter(it => it.name.trim())
                    .map(it => ({
                      name: it.name.trim(),
                      amount: parseAmountInt(it.amount || ''),
                    }));
                  const res = endLeaseWithSettlement(leaseId, payload);
                  try {
                    cancelReminder(`lease_end_${leaseId}`);
                  } catch {}
                  setShowEndModal(false);
                  Alert.alert(
                    t('cycleDetail.ended'),
                    res.finalBalance > 0
                      ? `${t('cycleDetail.refundToTenant')} ${format(
                          res.finalBalance,
                        )}`
                      : res.finalBalance < 0
                      ? `${t('cycleDetail.collectFromTenant')} ${format(
                          Math.abs(res.finalBalance),
                        )}`
                      : t('cycleDetail.noFurther'),
                    [{ text: 'OK', onPress: () => navigation.goBack() }],
                  );
                }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal gia hạn hợp đồng */}
      <Modal
        visible={showExtendModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowExtendModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.35)',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <View
            style={{
              backgroundColor: c.bg,
              borderRadius: 12,
              padding: 16,
              gap: 10,
            }}
          >
            <Text style={{ color: c.text, fontWeight: '800', fontSize: 16 }}>
              {t('cycleDetail.extendLease')}
            </Text>
            <Text style={{ color: c.subtext }}>
              {t('cycleDetail.extendHint', {
                unit:
                  leaseInfo?.billing_cycle === 'daily'
                    ? t('common.days')
                    : t('common.months'),
              })}
            </Text>
            <FormInput
              keyboardType="numeric"
              value={extendCount}
              onChangeText={setExtendCount}
              placeholder={
                leaseInfo?.billing_cycle === 'daily'
                  ? t('cycleDetail.daysExample')
                  : t('cycleDetail.monthsExample')
              }
              placeholderTextColor={c.subtext}
              style={{
                borderRadius: 10,
                padding: 10,
                color: c.text,
                backgroundColor: c.card,
              }}
            />
            <View
              style={{
                justifyContent: 'flex-end',
                position: 'absolute',
                left: 12,
                right: 12,
                bottom: insets.bottom + 8,
                flexDirection: 'row',
                gap: 12,
              }}
            >
              <Button
                title={t('common.cancel')}
                variant="ghost"
                onPress={() => {
                  setShowExtendModal(false);
                  setExtendCount('');
                }}
              />
              <Button
                title={t('common.confirm')}
                onPress={() => {
                  const n = Number(extendCount);
                  if (!n || n <= 0) {
                    Alert.alert(
                      t('common.error'),
                      t('cycleDetail.enterValidNumber'),
                    );
                    return;
                  }
                  try {
                    extendLeaseAndAddCycles(leaseId, n);
                    setShowExtendModal(false);
                    setExtendCount('');
                    reload();
                    Alert.alert(
                      t('common.success'),
                      t('cycleDetail.extendedOk'),
                    );
                    try {
                      const isMonthly =
                        String(leaseInfo?.billing_cycle) === 'monthly';
                      const next = new Date(period.e);
                      if (isMonthly) next.setMonth(next.getMonth() + 1);
                      else next.setDate(next.getDate() + 1);
                      const nextISO = next.toISOString().slice(0, 10);
                      scheduleReminder(
                        `lease_${leaseId}_cycle_settle_${nextISO}`,
                        t('notify.settleTitle') || 'Tất toán kỳ',
                        t('notify.settleMsg') ||
                          'Hôm nay đến ngày tất toán kỳ. Vui lòng xử lý.',
                        nextISO,
                      );
                    } catch {}
                  } catch (e: any) {
                    Alert.alert(
                      t('common.error'),
                      e?.message || t('cycleDetail.extendFail'),
                    );
                  }
                }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal xác nhận settle */}
      <Modal
        visible={showConfirmSettle}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmSettle(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.35)',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <View
            style={{
              backgroundColor: c.bg,
              borderRadius: 12,
              padding: 16,
              gap: 10,
            }}
          >
            <Text style={{ color: c.text, fontWeight: '800', fontSize: 16 }}>
              {t('cycleDetail.confirmSettleTitle') || 'Xác nhận tất toán'}
            </Text>
            <Text style={{ color: c.text }}>
              {t('cycleDetail.confirmSettleMessage') ||
                'Sau khi tất toán, dữ liệu sẽ bị khóa và KHÔNG thể chỉnh sửa.'}
            </Text>

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
                gap: 12,
                marginTop: 8,
              }}
            >
              <Button
                title={t('common.cancel') || 'Hủy'}
                variant="ghost"
                onPress={() => setShowConfirmSettle(false)}
              />
              <Button
                title={t('common.confirm') || 'Xác nhận'}
                onPress={() => {
                  const err = validateBeforeSettle();
                  if (err) {
                    Alert.alert(t('common.missingInfo'), err);
                    return;
                  }
                  setShowConfirmSettle(false);
                  saveEdits('cycle');
                }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal THU BỔ SUNG */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
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
              }}
            >
              <Text
                style={{
                  color: c.text,
                  fontWeight: '800',
                  fontSize: 16,
                  marginBottom: 10,
                }}
              >
                {t('cycleDetail.collectMore') || 'Thu bổ sung'}
              </Text>

              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentInsetAdjustmentBehavior="automatic"
                style={{ maxHeight: Dimensions.get('window').height * 0.6 }}
                contentContainerStyle={{
                  gap: 10,
                  paddingBottom: insets.bottom + 84,
                }}
              >
                <Card style={{ gap: 8 }}>
                  {suppItems.map((ex, idx) => (
                    <View key={idx} style={{ gap: 6 }}>
                      <FormInput
                        placeholder={t('cycleDetail.itemName')}
                        placeholderTextColor={c.subtext}
                        value={ex.name}
                        onChangeText={t2 => updSupp(idx, { name: t2 })}
                        style={{
                          borderRadius: 10,
                          padding: 10,
                          color: c.text,
                          backgroundColor: c.card,
                        }}
                      />
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <FormInput
                          style={{ flex: 1 }}
                          placeholder={t('cycleDetail.amountWithHint')}
                          keyboardType="decimal-pad"
                          value={ex.amount}
                          onChangeText={t2 =>
                            updSupp(idx, {
                              amount: formatDecimalTypingVNStrict(t2),
                            })
                          }
                        />
                        <Button
                          title={t('common.delete')}
                          variant="ghost"
                          onPress={() => delSupp(idx)}
                        />
                      </View>
                    </View>
                  ))}
                  <Button
                    title={t('cycleDetail.addItem')}
                    variant="ghost"
                    onPress={addSupp}
                  />
                </Card>

                <Text style={{ color: c.text }}>
                  {t('cycleDetail.extraTotal')}: {format(suppTotal)}
                </Text>
              </ScrollView>

              <View
                style={{
                  position: 'absolute',
                  left: 16,
                  right: 16,
                  bottom: insets.bottom + 8,
                  flexDirection: 'row',
                  justifyContent: 'flex-end',
                  gap: 12,
                }}
              >
                <Button
                  title={t('common.cancel')}
                  variant="ghost"
                  onPress={() => setShowAddModal(false)}
                />
                <Button title={t('common.save')} onPress={saveSupplemental} />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal THU TIỀN (payments) */}
      <Modal
        visible={showPay}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPay(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.35)',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <View
            style={{
              backgroundColor: c.bg,
              borderRadius: 12,
              padding: 16,
              gap: 10,
            }}
          >
            <Text style={{ color: c.text, fontWeight: '800', fontSize: 16 }}>
              {t('invoice.collect') || 'Thu tiền'}
            </Text>
            <FormInput
              keyboardType="decimal-pad"
              value={payAmt}
               onChangeText={(txt) => setPayAmt(formatDecimalTypingVNStrict(txt))}
              placeholder={t('cycleDetail.amountPlaceholder') || '0,00'}
              placeholderTextColor={c.subtext}
            />
            <FormInput
              value={payMethod}
              onChangeText={setPayMethod}
              placeholder={t('invoice.method') || 'Phương thức (cash/bank...)'}
              placeholderTextColor={c.subtext}
            />
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
                gap: 12,
              }}
            >
              <Button
                title={t('common.cancel')}
                variant="ghost"
                onPress={() => setShowPay(false)}
              />
              <Button
                title={t('common.save')}
                onPress={() => {
                  try {
                    if (!invId) return;
                    const amt = parseDecimalCommaStrict(payAmt);
                    if (!amt || amt <= 0) {
                      Alert.alert(
                        t('common.error'),
                        t('cycleDetail.enterValidNumber'),
                      );
                      return;
                    }
                    recordPayment(invId, amt, payMethod || 'cash');
                    setShowPay(false);
                    setPayAmt('');
                    loadPayments();
                    reload();
                    Alert.alert(
                      t('common.success'),
                      t('invoice.collected') || 'Đã ghi nhận thanh toán',
                    );
                  } catch (e: any) {
                    Alert.alert(
                      t('common.error'),
                      e?.message || t('common.tryAgain'),
                    );
                  }
                }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* === TẠO & LƯU QR ẨN (sau khi tất toán) === */}
      {qrPayload && qrTarget ? (
        <HiddenVietQR
          payload={qrPayload}
          size={512}
          padding={16}
          onRendered={filePath => {
            try {
              if (filePath && qrTarget?.invId) {
                updateInvoiceQrPath(qrTarget.invId, filePath);
              }
            } finally {
              setQrPayload(null);
              setQrTarget(null);
            }
          }}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}
