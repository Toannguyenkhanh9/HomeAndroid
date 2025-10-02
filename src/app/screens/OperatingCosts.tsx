// src/app/screens/OperatingCosts.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/RootNavigator';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';
import { useThemeColors } from '../theme';
import {
  hasOperatingCostSetup,
  listOperatingCostMonths,
  ensureOperatingCostMonth,
} from '../../services/rent';
import { useTranslation } from 'react-i18next';

type Props = NativeStackScreenProps<RootStackParamList, 'OperatingCosts'>;

export default function OperatingCosts({ route, navigation }: Props) {
  const { apartmentId } = route.params as any;
  const c = useThemeColors();
  const { t } = useTranslation();

  const [ready, setReady] = useState(false);
  const [months, setMonths] = useState<any[]>([]);
  const [isSetup, setIsSetup] = useState(false);

  // Month picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMonths, setPickerMonths] = useState<string[]>([]);

  const reload = useCallback(() => {
    const ok = hasOperatingCostSetup(apartmentId);
    setIsSetup(ok);
    setMonths(ok ? (listOperatingCostMonths(apartmentId) || []) : []);
    setReady(true);
  }, [apartmentId]);

  useEffect(() => { reload(); }, [reload]);

  useFocusEffect(
    useCallback(() => { reload(); }, [reload])
  );

  // Build selectable months (exclude existing)
  const buildMonthChoices = useCallback(() => {
    const exist = new Set((months || []).map((m: any) => String(m.ym)));
    const now = new Date();
    const out: string[] = [];

    // Future 12 months
    for (let i = 1; i <= 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!exist.has(ym)) out.push(ym);
    }
    // Current & past 36 months
    for (let i = 0; i <= 36; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!exist.has(ym)) out.push(ym);
    }

    out.sort((a, b) => (a < b ? 1 : -1)); // desc
    return out;
  }, [months]);

  const openPicker = () => {
    setPickerMonths(buildMonthChoices());
    setPickerOpen(true);
  };

  const handlePick = (ym: string) => {
    ensureOperatingCostMonth(apartmentId, ym); // create only when user selects
    setPickerOpen(false);
    reload();
  };

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      {!ready ? null : !isSetup ? (
        <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
          <Card style={{ gap: 8 }}>
            <Text style={{ color: c.text }}>{t('operatingCosts.noSetup')}</Text>
            <Button
              title={t('operatingCosts.setupCosts')}
              onPress={() => navigation.navigate('OperatingCostSettings', { apartmentId })}
            />
          </Card>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
          <Card style={{ gap: 8 }}>
            <Text style={{ color: c.text, fontWeight: '800' }}>
              {t('operatingCosts.monthList')}
            </Text>

            {months.length === 0 && (
              <Text style={{ color: c.subtext }}>
                {t('operatingCosts.noData')}
              </Text>
            )}

            {months.map(m => (
              <TouchableOpacity
                key={m.id}
                activeOpacity={0.7}
                onPress={() =>
                  navigation.navigate('OperatingCostMonth', { apartmentId, ym: m.ym })
                }
              >
                <View style={{ borderRadius: 10, padding: 10, marginTop: 8 }}>
                  <Text style={{ color: c.text, fontWeight: '700' }}>{m.ym}</Text>
                  <Text style={{ color: c.subtext }}>
                    {t('operatingCosts.tapToView')}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              {/* Open month picker instead of auto-creating */}
              <Button title={t('operatingCosts.addCurrentMonth')} onPress={openPicker} />
              <Button
                title={t('operatingCosts.setupCosts')}
                variant="ghost"
                onPress={() =>
                  navigation.navigate('OperatingCostSettings', { apartmentId })
                }
              />
            </View>
          </Card>
        </ScrollView>
      )}

      {/* Month selection modal */}
      <Modal
        transparent
        visible={pickerOpen}
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.35)',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <Card style={{ padding: 12, maxHeight: '70%' }}>
            {/* Close (X) button */}
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setPickerOpen(false)}
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 12,
                backgroundColor: 'rgba(0,0,0,0.06)',
              }}
            >
              <Text style={{ color: c.text, fontWeight: '800', fontSize: 16 }}>×</Text>
            </TouchableOpacity>

            <Text style={{ color: c.text, fontWeight: '800', marginBottom: 8 }}>
              {t('operatingCosts.chooseMonthToAdd') || 'Chọn tháng để thêm'}
            </Text>
            <ScrollView>
              {pickerMonths.length === 0 ? (
                <Text style={{ color: c.subtext }}>
                  {t('operatingCosts.noMoreMonths') ||
                    'Không còn tháng nào để thêm trong phạm vi chọn.'}
                </Text>
              ) : (
                pickerMonths.map(ym => (
                  <TouchableOpacity
                    key={ym}
                    onPress={() => handlePick(ym)}
                    activeOpacity={0.7}
                  >
                    <View style={{ paddingVertical: 10 }}>
                      <Text style={{ color: c.text, fontWeight: '600' }}>{ym}</Text>
                      <Text style={{ color: c.subtext }}>
                        {t('operatingCosts.tapToAdd') || 'Nhấn để thêm'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>

            {/* Optional bottom action */}
            <View style={{ marginTop: 8 }}>
              <Button
                title={t('common.close') || 'Đóng'}
                variant="ghost"
                onPress={() => setPickerOpen(false)}
              />
            </View>
          </Card>
        </View>
      </Modal>
    </View>
  );
}
